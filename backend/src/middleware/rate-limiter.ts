import { MiddlewareHandler, Context } from 'hono';
import { getClientIp } from './client-ip.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Upper bound on tracked keys. Some keys are chosen by the client (the OTP
 * identifier on the unauthenticated /api/member/otp/send lives for an hour),
 * so without a cap the store grows with request rate until the process runs
 * out of memory.
 */
const parsedMaxKeys = Number(process.env.RATE_LIMIT_MAX_KEYS);
const MAX_KEYS = Number.isInteger(parsedMaxKeys) && parsedMaxKeys > 0 ? parsedMaxKeys : 100_000;

const CLEANUP_INTERVAL = 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function pruneExpired(now: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Whether a new key fits. When full, expired entries are pruned first; if it
 * is still full the new key is refused. Live entries are never evicted: that
 * would let a flood of fresh keys reset an existing brute-force counter.
 */
function hasRoomForNewKey(now: number): boolean {
  if (rateLimitStore.size < MAX_KEYS) return true;
  pruneExpired(now);
  return rateLimitStore.size < MAX_KEYS;
}

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => pruneExpired(Date.now()), CLEANUP_INTERVAL);
  cleanupTimer.unref?.();
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (c: Context) => string;
  message?: string;
}

/**
 * Max requests for a limiter whose production budget is `productionMax`.
 * Tests (NODE_ENV=test) and the E2E stack (RELAX_RATE_LIMITS=true, which a
 * production process ignores) log in far more often than a real user, so they
 * get a budget of 100.
 */
export function limitMax(productionMax: number, env: Record<string, string | undefined> = process.env): number {
  const relaxed = env.NODE_ENV === 'test' ||
    (env.RELAX_RATE_LIMITS === 'true' && env.NODE_ENV !== 'production');
  return relaxed ? 100 : productionMax;
}

export function rateLimiter(options: RateLimitOptions = {}): MiddlewareHandler {
  const {
    windowMs = 60 * 1000,
    max = 100,
    keyGenerator = (c) => `rate:${getClientIp(c)}`,
    message = '請求過於頻繁，請稍後再試',
  } = options;

  startCleanup();

  return async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt <= now) {
      // ponytail: per-process memory store (fails closed when full); move to Redis if the API runs >1 instance
      if (!entry && !hasRoomForNewKey(now)) {
        c.header('Retry-After', String(Math.ceil(CLEANUP_INTERVAL / 1000)));
        return c.json({ success: false, error: message }, 429);
      }
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ success: false, error: message }, 429);
    }

    return next();
  };
}

export const strictRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: '操作過於頻繁，請稍後再試',
});

export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: limitMax(5),
  message: '登入嘗試過多，請 15 分鐘後再試',
});
