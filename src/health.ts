import type { Client } from '@temporalio/client';
import type { Redis } from 'ioredis';
import type { Config } from './config';

export interface Check { status: 'up' | 'down'; latencyMs: number; }
export interface HealthReport {
  status: 'healthy' | 'degraded';
  checks: Record<'redis' | 'temporal' | 'worker' | 'supplierA' | 'supplierB', Check>;
  timestamp: string;
}
async function check(fn: () => Promise<unknown>): Promise<Check> {
  const start = performance.now();
  try { await fn(); return { status: 'up', latencyMs: Math.round(performance.now() - start) }; }
  catch { return { status: 'down', latencyMs: Math.round(performance.now() - start) }; }
}
export async function healthReport(config: Config, redis: Redis, client: Client): Promise<HealthReport> {
  const supplier = async (path: string) => {
    const response = await fetch(new URL(path, config.SUPPLIER_BASE_URL), { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error('Supplier unavailable');
  };
  const [redisCheck, temporal, worker, supplierA, supplierB] = await Promise.all([
    check(() => redis.ping()),
    check(() => client.connection.withDeadline(Date.now() + 2500, () => client.connection.workflowService.getSystemInfo({}))),
    check(async () => {
      const result = await client.connection.withDeadline(Date.now() + 2500, () => client.connection.workflowService.describeTaskQueue({
        namespace: config.TEMPORAL_NAMESPACE,
        taskQueue: { name: config.TEMPORAL_TASK_QUEUE },
        taskQueueType: 1,
      }));
      if (!result.pollers?.some(p => {
        const seconds = Number(p.lastAccessTime?.seconds ?? 0);
        return Date.now() - seconds * 1000 < 60_000;
      })) throw new Error('No recent workflow poller');
    }),
    check(() => supplier('/supplierA/health')),
    check(() => supplier('/supplierB/health')),
  ]);
  const checks = { redis: redisCheck, temporal, worker, supplierA, supplierB };
  return { status: Object.values(checks).every(c => c.status === 'up') ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() };
}
