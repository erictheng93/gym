import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateCsv, type ExportColumn } from '../src/services/export.js';
import { generateOtp } from '../src/services/otp.js';

// Regression tests for security issues #7 (OTP), #9 (JWT secrets), #10 (CSV injection)

describe('CSV formula injection (#10)', () => {
  const columns: ExportColumn[] = [{ header: 'v', key: 'v' }];
  const body = (v: unknown) =>
    generateCsv(columns, [{ v }]).buffer!.toString('utf-8').replace('﻿', '').split('\r\n')[1];

  it.each(['=1+1', '@SUM(A1)', '+1+1', '-2+3', '\tcmd', '\rcmd'])('neutralizes %j', value => {
    expect(body(value).replace(/^"|"$/g, '')).toMatch(/^'/);
  });

  it('keeps the prefixed quote and still quotes special chars', () => {
    expect(body('=1,2')).toBe(`"'=1,2"`);
  });

  it('does not mangle numeric values or plain text', () => {
    expect(body(-50)).toBe('-50');
    expect(body('-50.5')).toBe('-50.5');
    expect(body('Alice')).toBe('Alice');
  });

  it('neutralizes headers too', () => {
    const csv = generateCsv([{ header: '=evil()', key: 'v' }], []).buffer!.toString('utf-8');
    expect(csv).toContain("'=evil()");
  });
});

describe('OTP generation (#7)', () => {
  it('uses a CSPRNG, not Math.random, and yields 6 digits', () => {
    const spy = vi.spyOn(Math, 'random');
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(/^[1-9]\d{5}$/);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('JWT secrets in production (#9)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const good = 'x'.repeat(40);
  const modules = [
    ['../src/services/member-jwt.js', 'MEMBER_JWT_SECRET'],
    ['../src/services/coach-jwt.js', 'COACH_JWT_SECRET'],
  ] as const;

  it.each(modules)('%s throws without %s in production', async (mod, name) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', good); // shared secret must not be used as fallback
    vi.stubEnv(name, '');
    vi.resetModules();
    await expect(import(mod)).rejects.toThrow(name);
  });

  it.each(modules)('%s rejects default and short secrets in production', async (mod, name) => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const bad of ['dev-secret-change-in-production', 'change-me-in-production', 'short']) {
      vi.stubEnv(name, bad);
      vi.resetModules();
      await expect(import(mod)).rejects.toThrow(name);
    }
  });

  it('loads with a strong secret in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MEMBER_JWT_SECRET', good);
    vi.resetModules();
    await expect(import('../src/services/member-jwt.js')).resolves.toBeDefined();
  });

  it('rejects a coach secret equal to the member secret in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MEMBER_JWT_SECRET', good);
    vi.stubEnv('COACH_JWT_SECRET', good);
    vi.resetModules();
    await expect(import('../src/services/coach-jwt.js')).rejects.toThrow('must differ');
    vi.stubEnv('COACH_JWT_SECRET', 'y'.repeat(40));
    vi.resetModules();
    await expect(import('../src/services/coach-jwt.js')).resolves.toBeDefined();
  });
});
