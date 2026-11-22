import { NativeConnection, Worker } from '@temporalio/worker';
import pino from 'pino';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from './config';
import { createRedis } from './redis-store';
import { createActivities } from './activities';

async function main() {
  const config = loadConfig();
  const logger = pino({ level: config.LOG_LEVEL });
  const redis = createRedis(config.REDIS_URL);
  redis.on('error', err => logger.error({ err }, 'Redis connection error'));
  await redis.connect();
  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    ...(existsSync(path.join(__dirname, 'workflow-bundle.js'))
      ? { workflowBundle: { codePath: path.join(__dirname, 'workflow-bundle.js') } }
      : { workflowsPath: require.resolve('./workflows') }),
    activities: createActivities(config, redis),
    maxConcurrentActivityTaskExecutions: 30,
    maxConcurrentWorkflowTaskExecutions: 10,
    maxCachedWorkflows: 20,
    shutdownGraceTime: '15 seconds',
  });
  logger.info({ taskQueue: config.TEMPORAL_TASK_QUEUE }, 'Temporal worker ready');
  try { await worker.run(); }
  finally { await Promise.allSettled([redis.quit(), connection.close()]); }
}
main().catch(error => { console.error(error); process.exit(1); });
