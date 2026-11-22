import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).default('false').transform(v => v === 'true');
export const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  TEMPORAL_ADDRESS: z.string().min(1).default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default('hotel-offers'),
  SUPPLIER_BASE_URL: z.string().url().default('http://localhost:3000'),
  SUPPLIER_TIMEOUT_MS: z.coerce.number().int().min(100).max(5000).default(3000),
  OFFER_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(300),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  SUPPLIER_A_DOWN: booleanString,
  SUPPLIER_B_DOWN: booleanString,
});
export type Config = z.infer<typeof configSchema>;
export function loadConfig(): Config { return configSchema.parse(process.env); }
