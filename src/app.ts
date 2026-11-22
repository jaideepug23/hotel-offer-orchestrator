import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Config } from './config';
import { fixtures } from './fixtures';
import { citySchema, querySchema } from './validation';
import type { HotelOffer, HotelQuery, Supplier } from './types';
import type { HealthReport } from './health';

export interface AppDependencies {
  config: Config;
  logger: Logger;
  execute: (query: HotelQuery, workflowId: string) => Promise<HotelOffer[]>;
  health: () => Promise<HealthReport>;
}

export function createApp({ config, logger, execute, health }: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(helmet());
  app.use((req, res, next) => {
    const id = randomUUID();
    res.locals.requestId = id;
    res.setHeader('X-Request-Id', id);
    res.setHeader('Cache-Control', 'no-store');
    const start = performance.now();
    res.on('finish', () => logger.info({ requestId: id, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(performance.now() - start) }, 'HTTP request'));
    next();
  });

  // Liveness deliberately has no downstream dependency; readiness uses /health.
  app.get('/live', (_req, res) => res.json({ status: 'alive' }));
  app.get('/health', async (_req, res) => {
    const report = await health();
    res.status(report.status === 'healthy' ? 200 : 503).json(report);
  });
  for (const [prefix, supplier, down] of [
    ['supplierA', 'Supplier A', config.SUPPLIER_A_DOWN],
    ['supplierB', 'Supplier B', config.SUPPLIER_B_DOWN],
  ] as const) {
    app.get(`/${prefix}/health`, (_req, res) => res.status(down ? 503 : 200).json({ supplier, status: down ? 'down' : 'up' }));
    app.get(`/${prefix}/hotels`, (req, res) => {
      if (down) { res.status(503).json({ error: { code: 'SUPPLIER_UNAVAILABLE', message: `${supplier} is temporarily unavailable` } }); return; }
      if (req.query.city === undefined) { res.json(fixtures[supplier as Supplier]); return; }
      const city = citySchema.safeParse(req.query.city);
      if (!city.success) { res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Provide one valid city name' } }); return; }
      res.json(fixtures[supplier].filter(h => h.city === city.data));
    });
  }

  // An admission limit bounds work queued by a public demo. No fake results or
  // in-memory orchestration fallback: successful requests always use Temporal.
  let activeRequests = 0;
  app.get('/api/hotels', async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Invalid hotel search parameters', details: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })), requestId: res.locals.requestId } });
      return;
    }
    if (activeRequests >= 40) {
      res.setHeader('Retry-After', '2');
      res.status(429).json({ error: { code: 'BUSY', message: 'Too many concurrent searches; retry shortly', requestId: res.locals.requestId } });
      return;
    }
    activeRequests++;
    const workflowId = `hotel-search-${res.locals.requestId as string}`;
    res.setHeader('X-Workflow-Id', workflowId);
    try {
      const offers = await execute(parsed.data, workflowId);
      res.json(offers);
    } catch (error) {
      logger.error({ err: error, workflowId, requestId: res.locals.requestId }, 'Hotel comparison failed');
      res.status(503).json({ error: { code: 'COMPARISON_UNAVAILABLE', message: 'Could not complete a reliable comparison. Please retry shortly.', requestId: res.locals.requestId, workflowId } });
    } finally { activeRequests--; }
  });
  app.get('/openapi.json', (_req, res) => res.sendFile(path.resolve(__dirname, '../public/openapi.json')));
  app.use(express.static(path.resolve(__dirname, '../public'), { index: 'index.html' }));
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found', requestId: res.locals.requestId } }));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err: error }, 'Unexpected request failure');
    if (!res.headersSent) res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error', requestId: res.locals.requestId } });
  });
  return app;
}
