import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { memberAuthMiddleware, requireMember, getMemberFromToken } from '../src/middleware/member-auth.js';
import { coachAuthMiddleware, requireCoach, getCoachFromToken } from '../src/middleware/coach-auth.js';
import { tenantMiddleware, requireTenant } from '../src/middleware/tenant-context.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';

// =============================================================================
// Member Auth Middleware Tests
// =============================================================================

describe('Member Auth Middleware', () => {
  const mockMember = {
    id: 'member-001',
    memberCode: 'M001',
    branchId: 'branch-001',
    tenantId: 'tenant-001',
  };

  describe('memberAuthMiddleware', () => {
    it('should set member to null when no token provided', async () => {
      const app = new Hono();
      app.use('*', memberAuthMiddleware);
      app.get('/test', (c) => c.json({ member: c.get('member') }));

      const res = await app.request('/test');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.member).toBeNull();
    });

    it('should set member info when valid token is provided', async () => {
      const tokens = generateMemberTokens(mockMember);
      const app = new Hono();
      app.use('*', memberAuthMiddleware);
      app.get('/test', (c) => c.json({ member: c.get('member') }));

      const res = await app.request('/test', {
        headers: { 'X-Member-Token': tokens.accessToken },
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.member).not.toBeNull();
      expect(data.member.id).toBe(mockMember.id);
      expect(data.member.memberCode).toBe(mockMember.memberCode);
      expect(data.member.branchId).toBe(mockMember.branchId);
      expect(data.member.tenantId).toBe(mockMember.tenantId);
    });

    it('should set member to null when invalid token is provided', async () => {
      const app = new Hono();
      app.use('*', memberAuthMiddleware);
      app.get('/test', (c) => c.json({ member: c.get('member') }));

      const res = await app.request('/test', {
        headers: { 'X-Member-Token': 'invalid-token' },
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.member).toBeNull();
    });
  });

  describe('requireMember', () => {
    it('should return 401 when no member is set', async () => {
      const app = new Hono();
      app.use('*', memberAuthMiddleware);
      app.use('*', requireMember);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should pass through when member is authenticated', async () => {
      const tokens = generateMemberTokens(mockMember);
      const app = new Hono();
      app.use('*', memberAuthMiddleware);
      app.use('*', requireMember);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-Member-Token': tokens.accessToken },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('should return 401 with invalid token', async () => {
      const app = new Hono();
      app.use('*', memberAuthMiddleware);
      app.use('*', requireMember);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-Member-Token': 'bad-token' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('getMemberFromToken', () => {
    it('should return null for undefined token', () => {
      expect(getMemberFromToken(undefined)).toBeNull();
    });

    it('should return null for invalid token', () => {
      expect(getMemberFromToken('invalid')).toBeNull();
    });

    it('should return member info for valid token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = getMemberFromToken(tokens.accessToken);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockMember.id);
    });
  });
});

// =============================================================================
// Coach Auth Middleware Tests
// =============================================================================

describe('Coach Auth Middleware', () => {
  const mockCoach = {
    id: 'employee-001',
    employeeCode: 'EMP001',
    branchId: 'branch-001',
    tenantId: 'tenant-001',
    jobTitle: 'COACH',
  };

  describe('coachAuthMiddleware', () => {
    it('should set coach to null when no token provided', async () => {
      const app = new Hono();
      app.use('*', coachAuthMiddleware);
      app.get('/test', (c) => c.json({ coach: c.get('coach') }));

      const res = await app.request('/test');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.coach).toBeNull();
    });

    it('should set coach info when valid token is provided', async () => {
      const tokens = generateCoachTokens(mockCoach);
      const app = new Hono();
      app.use('*', coachAuthMiddleware);
      app.get('/test', (c) => c.json({ coach: c.get('coach') }));

      const res = await app.request('/test', {
        headers: { 'X-Coach-Token': tokens.accessToken },
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.coach).not.toBeNull();
      expect(data.coach.id).toBe(mockCoach.id);
      expect(data.coach.employeeCode).toBe(mockCoach.employeeCode);
      expect(data.coach.jobTitle).toBe(mockCoach.jobTitle);
    });

    it('should set coach to null when invalid token is provided', async () => {
      const app = new Hono();
      app.use('*', coachAuthMiddleware);
      app.get('/test', (c) => c.json({ coach: c.get('coach') }));

      const res = await app.request('/test', {
        headers: { 'X-Coach-Token': 'garbage' },
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.coach).toBeNull();
    });
  });

  describe('requireCoach', () => {
    it('should return 401 when no coach is set', async () => {
      const app = new Hono();
      app.use('*', coachAuthMiddleware);
      app.use('*', requireCoach);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should pass through when coach is authenticated', async () => {
      const tokens = generateCoachTokens(mockCoach);
      const app = new Hono();
      app.use('*', coachAuthMiddleware);
      app.use('*', requireCoach);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-Coach-Token': tokens.accessToken },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('getCoachFromToken', () => {
    it('should return null for undefined token', () => {
      expect(getCoachFromToken(undefined)).toBeNull();
    });

    it('should return null for invalid token', () => {
      expect(getCoachFromToken('invalid')).toBeNull();
    });

    it('should return coach info for valid token', () => {
      const tokens = generateCoachTokens(mockCoach);
      const result = getCoachFromToken(tokens.accessToken);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockCoach.id);
      expect(result!.employeeCode).toBe(mockCoach.employeeCode);
    });
  });
});

// =============================================================================
// Tenant Context Middleware Tests
// =============================================================================

describe('Tenant Context Middleware', () => {
  describe('tenantMiddleware', () => {
    it('should set tenantId from user context', async () => {
      const app = new Hono();
      // Simulate user being set by auth middleware
      app.use('*', async (c, next) => {
        c.set('user', { tenantId: 'tenant-001', role: 'admin', isActive: true } as any);
        return next();
      });
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({
        tenantId: c.get('tenantId'),
        branchId: c.get('branchId'),
      }));

      const res = await app.request('/test');
      const data = await res.json();

      expect(data.tenantId).toBe('tenant-001');
      expect(data.branchId).toBeNull();
    });

    it('should set tenantId to null when no user', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', null);
        return next();
      });
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test');
      const data = await res.json();
      expect(data.tenantId).toBeNull();
    });

    it('should extract branchId from X-Branch-Id header', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', { tenantId: 'tenant-001' } as any);
        return next();
      });
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ branchId: c.get('branchId') }));

      const res = await app.request('/test', {
        headers: { 'X-Branch-Id': 'branch-abc' },
      });
      const data = await res.json();
      expect(data.branchId).toBe('branch-abc');
    });

    it('should extract branchId from branch_id query param', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', { tenantId: 'tenant-001' } as any);
        return next();
      });
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ branchId: c.get('branchId') }));

      const res = await app.request('/test?branch_id=branch-xyz');
      const data = await res.json();
      expect(data.branchId).toBe('branch-xyz');
    });

    it('should prefer X-Branch-Id header over query param', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', { tenantId: 'tenant-001' } as any);
        return next();
      });
      app.use('*', tenantMiddleware);
      app.get('/test', (c) => c.json({ branchId: c.get('branchId') }));

      const res = await app.request('/test?branch_id=from-query', {
        headers: { 'X-Branch-Id': 'from-header' },
      });
      const data = await res.json();
      expect(data.branchId).toBe('from-header');
    });
  });

  describe('requireTenant', () => {
    it('should return 400 when tenantId is null', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('user', null);
        c.set('tenantId', null);
        return next();
      });
      app.use('*', requireTenant);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should pass through when tenantId is set', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('tenantId', 'tenant-001');
        return next();
      });
      app.use('*', requireTenant);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });
  });
});
