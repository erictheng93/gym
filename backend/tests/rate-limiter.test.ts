import { describe, it, expect, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { limitMax, rateLimiter } from '../src/middleware/rate-limiter.js';
import { getClientIp, trustedProxyHops } from '../src/middleware/client-ip.js';

describe('limitMax', () => {
  it('uses the production budget by default', () => {
    expect(limitMax(5, { NODE_ENV: 'development' })).toBe(5);
  });

  it('relaxes the budget under NODE_ENV=test', () => {
    expect(limitMax(5, { NODE_ENV: 'test' })).toBe(100);
  });

  it('relaxes the budget for the E2E stack via RELAX_RATE_LIMITS', () => {
    expect(limitMax(5, { NODE_ENV: 'development', RELAX_RATE_LIMITS: 'true' })).toBe(100);
  });

  it('ignores RELAX_RATE_LIMITS in production', () => {
    expect(limitMax(5, { NODE_ENV: 'production', RELAX_RATE_LIMITS: 'true' })).toBe(5);
  });
});

describe('rateLimiter client address', () => {
  // The limiter store is module-wide and keyed `rate:<ip>`, so every test uses
  // its own socket / proxy addresses.
  function limitedApp(max: number) {
    const app = new Hono();
    app.post('/login', rateLimiter({ max, windowMs: 60_000 }), (c) => c.text('ok'));
    return app;
  }
  // @hono/node-server exposes the TCP peer as env.incoming.socket
  const socket = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress, remotePort: 40000, remoteFamily: 'IPv4' } } });
  const post = (app: Hono, xff: string, peer: string) =>
    app.request('/login', { method: 'POST', headers: { 'X-Forwarded-For': xff, 'X-Real-IP': xff } }, socket(peer));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ignores a spoofed X-Forwarded-For when TRUST_PROXY is off', async () => {
    vi.stubEnv('TRUST_PROXY', '');
    const app = limitedApp(2);

    expect((await post(app, '1.1.1.1', '10.0.0.1')).status).toBe(200);
    expect((await post(app, '2.2.2.2', '10.0.0.1')).status).toBe(200);
    // Rotating the header does not make the same socket a new client
    expect((await post(app, '3.3.3.3', '10.0.0.1')).status).toBe(429);
  });

  it('limits by socket address when TRUST_PROXY is off', async () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    const app = limitedApp(1);

    expect((await post(app, '1.1.1.1', '10.0.0.2')).status).toBe(200);
    expect((await post(app, '1.1.1.1', '10.0.0.3')).status).toBe(200);
    expect((await post(app, '1.1.1.1', '10.0.0.2')).status).toBe(429);
  });

  it('uses the address the trusted proxy appended, not the client-supplied first entry', async () => {
    vi.stubEnv('TRUST_PROXY', '1');
    const app = limitedApp(2);

    // The client rotates a fake left-most entry; the proxy appends the real 203.0.113.7
    expect((await post(app, '1.1.1.1, 203.0.113.7', '10.0.0.4')).status).toBe(200);
    expect((await post(app, '2.2.2.2, 203.0.113.7', '10.0.0.4')).status).toBe(200);
    expect((await post(app, '3.3.3.3, 203.0.113.7', '10.0.0.4')).status).toBe(429);
    // Another visitor behind the same proxy (same socket) has its own budget
    expect((await post(app, '198.51.100.4', '10.0.0.4')).status).toBe(200);
  });

  it('counts TRUST_PROXY hops from the right', () => {
    const ctx = (xff: string) =>
      ({ req: { header: (name: string) => (name === 'x-forwarded-for' ? xff : undefined) }, env: undefined }) as unknown as Context;

    expect(getClientIp(ctx('6.6.6.6, 203.0.113.7, 172.18.0.3'), { TRUST_PROXY: '2' })).toBe('203.0.113.7');
    expect(getClientIp(ctx('6.6.6.6, 203.0.113.7'), { TRUST_PROXY: 'true' })).toBe('203.0.113.7');
    expect(getClientIp(ctx('203.0.113.7'), { TRUST_PROXY: '3' })).toBe('203.0.113.7');
    // No trust and no socket (app.request without env): one shared bucket
    expect(getClientIp(ctx('6.6.6.6'), {})).toBe('unknown');
  });

  it('parses TRUST_PROXY', () => {
    expect(trustedProxyHops({})).toBe(0);
    expect(trustedProxyHops({ TRUST_PROXY: 'false' })).toBe(0);
    expect(trustedProxyHops({ TRUST_PROXY: 'yes' })).toBe(0);
    expect(trustedProxyHops({ TRUST_PROXY: 'true' })).toBe(1);
    expect(trustedProxyHops({ TRUST_PROXY: '2' })).toBe(2);
  });
});
