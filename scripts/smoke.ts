import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const request = async (path: string, status = 200) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, status, `${path} HTTP status`);
  return { response, body: await response.json() };
};
async function main() {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) })).ok) break; } catch {}
    if (i === 89) throw new Error('Stack did not become healthy');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const health = await request('/health');
  assert.equal(health.body.status, 'healthy');
  const all = await request('/api/hotels?city=delhi');
  assert.equal(all.body.length, 5);
  assert.deepEqual(all.body.find((h: { name: string }) => h.name === 'Holtin'), { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 });
  assert.equal(all.body.find((h: { name: string }) => h.name === 'Radison').supplier, 'Supplier A');
  assert.ok(all.response.headers.get('x-workflow-id'));
  assert.deepEqual((await request('/api/hotels?city=delhi&minPrice=5340&maxPrice=5900')).body.map((h: { name: string }) => h.name), ['Holtin', 'Radison']);
  assert.deepEqual((await request('/api/hotels?city=atlantis')).body, []);
  assert.equal((await request('/api/hotels?city=mumbai')).body.length, 2);
  await request('/api/hotels?city=delhi&minPrice=10&maxPrice=1', 400);
  await request('/api/hotels?city=delhi&city=mumbai', 400);
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => request('/api/hotels?city=delhi&maxPrice=5340')));
  concurrent.forEach(result => assert.equal(result.body.length, 3));
  console.log('PASS: healthy stack, exact winners, Redis bounds, empty city, second city, validation, workflow tracing, 8 concurrent searches');
}
main().catch(error => { console.error(error); process.exit(1); });
