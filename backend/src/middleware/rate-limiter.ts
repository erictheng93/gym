import { MiddlewareHandler, Context } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export const MAX_STORE_SIZE = 10000;
const rateLimitStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function pruneExpired(now: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function ensureCapacity(now: number) {
  if (rateLimitStore.size < MAX_STORE_SIZE) return;

  // First pass: purge all expired entries
  pruneExpired(now);

  // Second pass: if still at or over capacity, evict oldest 20% entries (FIFO)
  if (rateLimitStore.size >= MAX_STORE_SIZE) {
    const toEvict = Math.ceil(MAX_STORE_SIZE * 0.2);
    let evicted = 0;
    for (const key of rateLimitStore.keys()) {
      rateLimitStore.delete(key);
      evicted++;
      if (evicted >= toEvict) break;
    }
  }
}

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    pruneExpired(Date.now());
  }, CLEANUP_INTERVAL);
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (c: Context) => string;
  message?: string;
}

export function rateLimiter(options: RateLimitOptions = {}): MiddlewareHandler {
  const {
    windowMs = 60 * 1000,
    max = 100,
    keyGenerator = (c) => {
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
                 c.req.header('x-real-ip') ||
                 'unknown';
      return `rate:${ip}`;
    },
    message = '請求過於頻繁，請稍後再試',
  } = options;

  startCleanup();

  return async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt <= now) {
      if (!entry) {
        ensureCapacity(now);
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
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  message: '登入嘗試過多，請 15 分鐘後再試',
});

export function _getStoreSize(): number {
  return rateLimitStore.size;
}

export function _clearStore(): void {
  rateLimitStore.clear();
}

export function _stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

