import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { BACKEND_ROOT, parseConfig } from '../src/config.js';

describe('backend config', () => {
  it('applies defaults and resolves DB_PATH from the backend folder', () => {
    const c = parseConfig({});
    expect(c).toMatchObject({ host: '127.0.0.1', port: 4000, logLevel: 'info', corsOrigins: ['http://localhost:5173'] });
    expect(c.dbPath).toBe(`${BACKEND_ROOT}/data/lending.db`);
  });

  it('keeps :memory: and absolute paths as given; splits CORS origins', () => {
    expect(parseConfig({ DB_PATH: ':memory:' }).dbPath).toBe(':memory:');
    expect(parseConfig({ DB_PATH: '/tmp/x.db' }).dbPath).toBe('/tmp/x.db');
    expect(parseConfig({ CORS_ORIGINS: 'https://a.ng, https://b.ng' }).corsOrigins).toEqual(['https://a.ng', 'https://b.ng']);
  });

  it('fails fast with a readable message on bad values', () => {
    expect(() => parseConfig({ PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => parseConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});

describe('CORS', () => {
  it('allows configured origins (with the Idempotency-Key header) and rejects others', async () => {
    const { app } = buildApp({ corsOrigins: ['http://localhost:5173'] });
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/loans',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,idempotency-key' },
      });
    const ok = await preflight('http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(String(ok.headers['access-control-allow-headers'])).toContain('idempotency-key');
    const blocked = await preflight('https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
