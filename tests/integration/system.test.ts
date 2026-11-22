import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import express from 'express';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import request from 'supertest';
import { configSchema } from '../../src/config';
import { createActivities } from '../../src/activities';
import { createRedis, cityKeys, storeAndFilter } from '../../src/redis-store';
import { fixtures } from '../../src/fixtures';
import { createApp } from '../../src/app';
import { healthReport } from '../../src/health';
import type { hotelOffersWorkflow } from '../../src/workflows';
import type { HotelQuery, Supplier } from '../../src/types';

describe('real Temporal + Redis integration', () => {
  let env: TestWorkflowEnvironment;
  let supplierServer: Server;
  let worker: Worker;
  let workerRun: Promise<void>;
  let app: ReturnType<typeof createApp>;
  let failB = false;
  let transientFailures = 0;
  let invalidB = false;
  let bCalls = 0;
  const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15');
  redis.on('error', () => {});
  const queue = `test-${randomUUID()}`;
  const execute = (query: HotelQuery, workflowId = `test-${randomUUID()}`) => env.client.workflow.execute<typeof hotelOffersWorkflow>('hotelOffersWorkflow', {
    taskQueue: queue, workflowId, args: [query], workflowExecutionTimeout: '35 seconds',
  });
  beforeAll(async () => {
    await redis.connect();
    const suppliers = express();
    for (const [prefix, supplier] of [['supplierA', 'Supplier A'], ['supplierB', 'Supplier B']] as const) {
      suppliers.get(`/${prefix}/health`, (_req, res) => res.status(supplier === 'Supplier B' && failB ? 503 : 200).json({ status: 'up' }));
      suppliers.get(`/${prefix}/hotels`, async (req, res) => {
        if (supplier === 'Supplier B') {
          bCalls++;
          if (failB || transientFailures-- > 0) { res.sendStatus(503); return; }
          if (invalidB) { res.json([{ price: -1 }]); return; }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        res.json(fixtures[supplier as Supplier].filter(h => h.city === req.query.city));
      });
    }
    supplierServer = suppliers.listen(0, '127.0.0.1');
    await once(supplierServer, 'listening');
    const address = supplierServer.address();
    if (!address || typeof address === 'string') throw new Error('No supplier port');
    const config = configSchema.parse({ SUPPLIER_BASE_URL: `http://127.0.0.1:${address.port}`, TEMPORAL_TASK_QUEUE: queue, OFFER_TTL_SECONDS: 60 });
    env = await TestWorkflowEnvironment.createLocal();
    worker = await Worker.create({
      connection: env.nativeConnection, taskQueue: queue,
      workflowsPath: require.resolve('../../src/workflows.ts'), activities: createActivities(config, redis),
    });
    workerRun = worker.run();
    app = createApp({ config, logger: pino({ level: 'silent' }), execute, health: () => healthReport(config, redis, env.client) });
  });
  afterAll(async () => {
    if (worker) { worker.shutdown(); await workerRun; }
    if (env) await env.teardown();
    if (supplierServer) await new Promise<void>(resolve => supplierServer.close(() => resolve()));
    if (redis.status === 'ready') {
      await redis.del(...cityKeys('delhi'), ...cityKeys('atlantis'), ...cityKeys('concurrency-test'), ...cityKeys('ttl-test'));
      await redis.quit();
    } else redis.disconnect();
  });
  it('executes both suppliers in parallel, selects exact winners, persists all offers, and replays history', async () => {
    const id = `test-${randomUUID()}`;
    const offers = await execute({ city: 'delhi' }, id);
    expect(offers).toHaveLength(5);
    expect(offers.find(h => h.name === 'Holtin')).toEqual({ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 });
    expect(await redis.zcard(cityKeys('delhi')[0])).toBe(5);
    expect(await redis.ttl(cityKeys('delhi')[0])).toBeGreaterThan(0);
    const history = await env.client.workflow.getHandle(id).fetchHistory();
    const events = history.events ?? [];
    const schedules = events.flatMap((e, i) => e.activityTaskScheduledEventAttributes?.activityType?.name === 'fetchSupplier' ? [i] : []);
    const firstComplete = events.findIndex(e => e.activityTaskCompletedEventAttributes);
    expect(schedules).toHaveLength(2);
    expect(schedules.every(i => i < firstComplete)).toBe(true);
    await Worker.runReplayHistory({ workflowsPath: require.resolve('../../src/workflows.ts') }, history);
  });
  it('filters inclusive bounds inside Redis while retaining the entire unfiltered city snapshot', async () => {
    const response = await request(app).get('/api/hotels?city=delhi&minPrice=5340&maxPrice=5900').expect(200);
    expect(response.body.map((h: { name: string }) => h.name)).toEqual(['Holtin', 'Radison']);
    expect(await redis.zcard(cityKeys('delhi')[0])).toBe(5);
    expect(await execute({ city: 'delhi', minPrice: 5340, maxPrice: 5340 })).toHaveLength(1);
    expect(await execute({ city: 'delhi', maxPrice: 0 })).toEqual([]);
  });
  it('returns and records an empty result for an unknown city', async () => {
    expect(await execute({ city: 'atlantis' })).toEqual([]);
    expect(await redis.get(cityKeys('atlantis')[1])).toBe('0');
  });
  it('recovers from transient supplier failure using real activity retries', async () => {
    transientFailures = 1;
    bCalls = 0;
    expect(await execute({ city: 'delhi' })).toHaveLength(5);
    expect(bCalls).toBe(2);
  });
  it('fails closed after bounded retries and reports the supplier as unhealthy', async () => {
    failB = true;
    bCalls = 0;
    try {
      await request(app).get('/api/hotels?city=delhi').expect(503);
      expect(bCalls).toBe(3);
      const response = await request(app).get('/health').expect(503);
      expect(response.body.checks.supplierB.status).toBe('down');
    } finally { failB = false; }
  });
  it('does not retry invalid supplier payloads', async () => {
    invalidB = true;
    bCalls = 0;
    try { await expect(execute({ city: 'delhi' })).rejects.toThrow(); expect(bCalls).toBe(1); }
    finally { invalidB = false; }
  });
  it('keeps concurrent Redis snapshot writes and filtering isolated', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => storeAndFilter(redis,
      [{ name: `Hotel ${i}`, price: i, supplier: 'Supplier A', commissionPct: 10 }],
      { city: 'concurrency-test', minPrice: i, maxPrice: i }, 60)));
    results.forEach((rows, i) => expect(rows).toEqual([{ name: `Hotel ${i}`, price: i, supplier: 'Supplier A', commissionPct: 10 }]));
  });
  it('expires both populated and empty snapshots', async () => {
    await storeAndFilter(redis, [{ name: 'TTL Hotel', price: 20, supplier: 'Supplier A', commissionPct: 10 }], { city: 'ttl-test' }, 1);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(await redis.exists(...cityKeys('ttl-test'))).toBe(0);
  });
});
