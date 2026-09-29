import { TestApp } from './helpers.js';

describe('App (e2e)', () => {
  const t = new TestApp();
  beforeAll(() => t.start());
  afterAll(() => t.stop());

  it('GET /api/health reports db and redis', async () => {
    const h = await t.call('get', '/health');
    expect(h.status).toBe('ok');
    expect(h.db).toBe(true);
    expect(h.redis).toBe(true);
  });
});
