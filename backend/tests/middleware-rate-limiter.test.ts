import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import {
  rateLimiter,
  MAX_STORE_SIZE,
  _getStoreSize,
  _clearStore,
  _stopCleanup,
} from '../src/middleware/rate-limiter.js';

describe('Rate Limiter Middleware', () => {
  beforeEach(() => {
    _clearStore();
  });

  afterEach(() => {
    _clearStore();
    _stopCleanup();
  });

  describe('Headers and Throttling', () => {
    it('should set appropriate rate limit headers on successful request', async () => {
      const app = new Hono();
      app.use('*', rateLimiter({ max: 5, windowMs: 10000 }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should return 429 when max requests exceeded within window', async () => {
      const app = new Hono();
      app.use('*', rateLimiter({ max: 2, windowMs: 10000, message: 'Too many requests' }));
      app.get('/test', (c) => c.json({ ok: true }));

      const headers = { 'x-forwarded-for': '10.0.0.1' };

      const res1 = await app.request('/test', { headers });
      expect(res1.status).toBe(200);

      const res2 = await app.request('/test', { headers });
      expect(res2.status).toBe(200);

      const res3 = await app.request('/test', { headers });
      expect(res3.status).toBe(429);
      expect(res3.headers.get('Retry-After')).toBeDefined();
      const body = await res3.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Too many requests');
    });

    it('should differentiate between different client IPs', async () => {
      const app = new Hono();
      app.use('*', rateLimiter({ max: 1, windowMs: 10000 }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res1 = await app.request('/test', {
        headers: { 'x-forwarded-for': '1.1.1.1' },
      });
      expect(res1.status).toBe(200);

      // Same IP should be blocked
      const res1Blocked = await app.request('/test', {
        headers: { 'x-forwarded-for': '1.1.1.1' },
      });
      expect(res1Blocked.status).toBe(429);

      // Different IP should succeed
      const res2 = await app.request('/test', {
        headers: { 'x-forwarded-for': '2.2.2.2' },
      });
      expect(res2.status).toBe(200);
    });

    it('should support x-real-ip header when x-forwarded-for is missing', async () => {
      const app = new Hono();
      app.use('*', rateLimiter({ max: 1, windowMs: 10000 }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res1 = await app.request('/test', {
        headers: { 'x-real-ip': '3.3.3.3' },
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request('/test', {
        headers: { 'x-real-ip': '3.3.3.3' },
      });
      expect(res2.status).toBe(429);
    });
  });

  describe('Memory Protection and Eviction', () => {
    it('should bound store growth and evict oldest keys when reaching capacity', async () => {
      const app = new Hono();
      // Configure rate limiter
      app.use('*', rateLimiter({ max: 10, windowMs: 60000 }));
      app.get('/test', (c) => c.json({ ok: true }));

      // Fill store close to MAX_STORE_SIZE by simulating requests
      // Rather than running 10000 HTTP requests in test, verify eviction logic directly
      expect(MAX_STORE_SIZE).toBe(10000);

      // Pre-fill store to max
      for (let i = 0; i < MAX_STORE_SIZE; i++) {
        await app.request('/test', {
          headers: { 'x-forwarded-for': `ip-${i}` },
        });
      }

      expect(_getStoreSize()).toBe(MAX_STORE_SIZE);

      // Request with new IP should trigger ensureCapacity eviction
      await app.request('/test', {
        headers: { 'x-forwarded-for': 'ip-overflow-1' },
      });

      // Size should remain strictly bounded (20% evicted then +1 added)
      expect(_getStoreSize()).toBeLessThan(MAX_STORE_SIZE);
      expect(_getStoreSize()).toBeGreaterThan(0);
    });
  });
});
