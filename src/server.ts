import { Client, Connection } from '@temporalio/client';
import pino from 'pino';
import { createApp } from './app';
import { loadConfig } from './config';
import { createRedis } from './redis-store';
import { healthReport } from './health';
import type { hotelOffersWorkflow } from './workflows';

async function main() {
  const config = loadConfig();
  const logger = pino({ level: config.LOG_LEVEL });
  const redis = createRedis(config.REDIS_URL);
  redis.on('error', err => logger.error({ err }, 'Redis connection error'));
  await redis.connect();
  const connection = await Connection.connect({ address: config.TEMPORAL_ADDRESS, connectTimeout: '10 seconds' });
  const client = new Client({ connection, namespace: config.TEMPORAL_NAMESPACE });
  const app = createApp({
    config, logger,
    execute: (query, workflowId) => connection.withDeadline(Date.now() + 38_000, () => client.workflow.execute<typeof hotelOffersWorkflow>('hotelOffersWorkflow', {
      taskQueue: config.TEMPORAL_TASK_QUEUE,
      workflowId,
      args: [query],
      workflowExecutionTimeout: '35 seconds',
      workflowTaskTimeout: '10 seconds',
    })),
    health: () => healthReport(config, redis, client),
  });
  const server = app.listen(config.PORT, '0.0.0.0', () => logger.info({ port: config.PORT }, 'Hotel Offer Orchestrator listening'));
  server.requestTimeout = 45_000;
  server.headersTimeout = 10_000;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    logger.info('Draining HTTP requests');
    const timer = setTimeout(() => process.exit(1), 40_000).unref();
    server.close(() => { void Promise.allSettled([redis.quit(), connection.close()]).then(() => { clearTimeout(timer); process.exit(0); }); });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch(error => { console.error(error); process.exit(1); });
