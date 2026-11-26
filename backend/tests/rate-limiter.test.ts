import { describe, it, expect } from 'vitest';
import { limitMax } from '../src/middleware/rate-limiter.js';

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
