import { describe, it, expect } from 'vitest';
import app from '../src/app.js';

describe('CORS Configuration Tests', () => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004',
    'http://localhost:3005',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3003',
    'http://127.0.0.1:3004',
  ];

  describe('OPTIONS Preflight Requests', () => {
    for (const origin of allowedOrigins) {
      it(`should return correct CORS preflight headers for ${origin}`, async () => {
        const res = await app.request('/api/member/auth/login', {
          method: 'OPTIONS',
          headers: {
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Member-Token, X-Coach-Token, X-Branch-Id, X-Tenant-Id, X-CSRF-Token, X-Request-Id, Accept',
          },
        });

        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe(origin);
        expect(res.headers.get('access-control-allow-credentials')).toBe('true');
        expect(res.headers.get('access-control-max-age')).toBe('86400');

        const allowMethods = res.headers.get('access-control-allow-methods') || '';
        expect(allowMethods).toContain('POST');
        expect(allowMethods).toContain('GET');
        expect(allowMethods).toContain('OPTIONS');
        expect(allowMethods).toContain('HEAD');

        const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
        expect(allowHeaders).toContain('content-type');
        expect(allowHeaders).toContain('authorization');
        expect(allowHeaders).toContain('x-member-token');
        expect(allowHeaders).toContain('x-coach-token');
        expect(allowHeaders).toContain('x-csrf-token');
        expect(allowHeaders).toContain('x-branch-id');
        expect(allowHeaders).toContain('x-tenant-id');
        expect(allowHeaders).toContain('x-request-id');
        expect(allowHeaders).toContain('accept');
      });
    }

    it('should support dynamic localhost/127.0.0.1 ports in development', async () => {
      const dynamicOrigin = 'http://localhost:5173';
      const res = await app.request('/api/member/auth/login', {
        method: 'OPTIONS',
        headers: {
          'Origin': dynamicOrigin,
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(dynamicOrigin);
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('should disallow unauthorized origins that are not localhost/127.0.0.1', async () => {
      const res = await app.request('/api/member/auth/login', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://malicious-website.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('Actual Requests CORS and Expose Headers', () => {
    it('should include CORS headers and exposeHeaders on GET requests', async () => {
      const origin = 'http://localhost:3004';
      const res = await app.request('/', {
        method: 'GET',
        headers: {
          'Origin': origin,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');

      const exposeHeaders = (res.headers.get('access-control-expose-headers') || '').toLowerCase();
      expect(exposeHeaders).toContain('content-disposition');
      expect(exposeHeaders).toContain('x-total-count');
      expect(exposeHeaders).toContain('x-request-id');
    });

    it('should allow requests without Origin header (e.g., server-to-server / curl)', async () => {
      const res = await app.request('/', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe('Gym Nexus API');
    });
  });
});
