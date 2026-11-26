import { describe, it, expect, afterEach, vi } from 'vitest';
import app from '../src/app.js';

// Member login / password-reset limiters key on the client address. A rotating
// X-Forwarded-For must not give the same client a fresh budget unless a trusted
// proxy (TRUST_PROXY) appended it. Under NODE_ENV=test the budget is 100.
const BUDGET = 100;

// @hono/node-server exposes the TCP peer as env.incoming.socket
const socket = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress, remotePort: 40000, remoteFamily: 'IPv4' } } });

// An empty body fails validation after the limiter, so no database work is done
const post = (path: string, xff: string, peer: string) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff, 'X-Real-IP': xff },
    body: '{}',
  }, socket(peer));

async function exhaust(path: string, peer: string, xff: (i: number) => string) {
  for (let i = 0; i < BUDGET; i++) {
    expect((await post(path, xff(i), peer)).status).not.toBe(429);
  }
}

describe.each(['/api/member/auth/login', '/api/member/auth/forgot-password'])('%s rate limit', (path) => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is not reset by a spoofed X-Forwarded-For when TRUST_PROXY is off', async () => {
    vi.stubEnv('TRUST_PROXY', '');
    const peer = path.endsWith('login') ? '10.1.0.1' : '10.1.0.2';
    await exhaust(path, peer, (i) => `198.18.${i}.1`);

    expect((await post(path, '198.18.250.1', peer)).status).toBe(429);
    // Another socket still has its budget
    expect((await post(path, '198.18.250.1', `${peer}0`)).status).not.toBe(429);
  });

  it('keys on the proxy-appended address when TRUST_PROXY=1', async () => {
    vi.stubEnv('TRUST_PROXY', '1');
    const visitor = path.endsWith('login') ? '203.0.113.10' : '203.0.113.11';
    await exhaust(path, '10.2.0.1', (i) => `6.6.${i}.6, ${visitor}`);

    expect((await post(path, `7.7.7.7, ${visitor}`, '10.2.0.1')).status).toBe(429);
    // A different visitor behind the same proxy is not limited
    expect((await post(path, `7.7.7.7, ${visitor}9`, '10.2.0.1')).status).not.toBe(429);
  });
});
