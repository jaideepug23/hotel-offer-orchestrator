import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../../src/app';
import { configSchema } from '../../src/config';
import type { HealthReport } from '../../src/health';

const report: HealthReport = { status: 'healthy', timestamp: '2026-01-01T00:00:00Z', checks: {
  redis: { status: 'up', latencyMs: 1 }, temporal: { status: 'up', latencyMs: 1 }, worker: { status: 'up', latencyMs: 1 },
  supplierA: { status: 'up', latencyMs: 1 }, supplierB: { status: 'up', latencyMs: 1 },
} };
function setup(overrides = {}) {
  const execute = vi.fn().mockResolvedValue([{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }]);
  const health = vi.fn().mockResolvedValue(report);
  const app = createApp({ config: configSchema.parse(overrides), logger: pino({ level: 'silent' }), execute, health });
  return { app, execute, health };
}
describe('HTTP contract', () => {
  it('returns exactly the required array shape and trace headers', async () => {
    const { app, execute } = setup();
    const response = await request(app).get('/api/hotels?city=Delhi&minPrice=5000&maxPrice=6000').expect(200);
    expect(response.body).toEqual([{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }]);
    expect(response.headers['x-workflow-id']).toMatch(/^hotel-search-/);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(execute).toHaveBeenCalledWith({ city: 'delhi', minPrice: 5000, maxPrice: 6000 }, expect.any(String));
  });
  it('rejects duplicate and missing query params before starting Temporal', async () => {
    const { app, execute } = setup();
    await request(app).get('/api/hotels').expect(400);
    await request(app).get('/api/hotels?city=delhi&city=mumbai').expect(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('fails closed without leaking internal exception details', async () => {
    const { app, execute } = setup();
    execute.mockRejectedValue(new Error('redis://secret:password@host'));
    const response = await request(app).get('/api/hotels?city=delhi').expect(503);
    expect(response.body.error.code).toBe('COMPARISON_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('password');
  });
  it('supports the supplied mock endpoints with and without a city', async () => {
    const { app } = setup();
    expect((await request(app).get('/supplierA/hotels').expect(200)).body.length).toBeGreaterThan(0);
    expect((await request(app).get('/supplierB/hotels?city=atlantis').expect(200)).body).toEqual([]);
    await request(app).get('/supplierA/hotels?city=').expect(400);
  });
  it('simulates supplier downtime and reports it through the supplier health endpoint', async () => {
    const { app } = setup({ SUPPLIER_B_DOWN: 'true' });
    await request(app).get('/supplierB/hotels').expect(503);
    await request(app).get('/supplierB/health').expect(503);
    await request(app).get('/supplierA/health').expect(200);
  });
  it('separates process liveness from downstream readiness', async () => {
    const { app, health } = setup();
    health.mockResolvedValue({ ...report, status: 'degraded' });
    await request(app).get('/live').expect(200);
    await request(app).get('/health').expect(503);
    await request(app).get('/unknown').expect(404);
  });
});
