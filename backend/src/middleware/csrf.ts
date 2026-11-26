import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie } from 'hono/cookie';
import crypto from 'crypto';

// =============================================================================
// CSRF PROTECTION MIDDLEWARE
// =============================================================================
// Implements the Synchronizer Token Pattern for CSRF protection

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSP_HEADER_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Allow inline scripts for some SSR frameworks
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
].join('; ');

const PERMISSIONS_POLICY_HEADER_VALUE = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
].join(', ');

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * CSRF Protection Middleware
 *
 * - Sets CSRF token cookie on all requests
 * - Validates CSRF token on state-changing requests (POST, PUT, PATCH, DELETE)
 * - Token must match between cookie and header
 *
 * Usage:
 *   app.use('*', csrfProtection);
 *
 * Skip for:
 *   - API routes that use JWT auth (Authorization header)
 *   - Webhook endpoints that have their own signature verification
 */
export const csrfProtection = createMiddleware(async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;

  // Skip CSRF for safe methods
  if (SAFE_METHODS.has(method)) {
    // Set or refresh CSRF token cookie
    let csrfToken = getCookie(c, CSRF_COOKIE_NAME);
    if (!csrfToken) {
      csrfToken = generateToken();
      setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false, // Frontend needs to read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }
    await next();
    return;
  }

  // Skip CSRF validation for webhook endpoints
  if (path.includes('/webhook')) {
    await next();
    return;
  }

  // Skip CSRF validation for member/coach API endpoints (JWT auth)
  if (path.startsWith('/api/member/') || path.startsWith('/api/coach/')) {
    await next();
    return;
  }

  // Skip CSRF validation if Authorization header is present (JWT auth)
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    await next();
    return;
  }

  // Validate CSRF token for state-changing requests
  const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
  const headerToken = c.req.header(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return c.json({
      success: false,
      error: 'CSRF token missing'
    }, 403);
  }

  if (!safeCompare(cookieToken, headerToken)) {
    return c.json({
      success: false,
      error: 'CSRF token mismatch'
    }, 403);
  }

  await next();
  return;
});

/**
 * CSRF Token Endpoint
 *
 * GET /api/csrf-token
 * Returns the current CSRF token for frontend initialization
 */
export const getCsrfToken = createMiddleware(async (c) => {
  let csrfToken = getCookie(c, CSRF_COOKIE_NAME);

  if (!csrfToken) {
    csrfToken = generateToken();
    setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
  }

  return c.json({
    success: true,
    data: { token: csrfToken }
  });
});

/**
 * Security Headers Middleware
 *
 * Adds additional security headers beyond what Hono's secureHeaders provides
 */
export const extraSecurityHeaders = createMiddleware(async (c, next) => {
  await next();

  // Content Security Policy - restrict resource loading
  c.header('Content-Security-Policy', CSP_HEADER_VALUE);

  // Permissions Policy - restrict browser features
  c.header('Permissions-Policy', PERMISSIONS_POLICY_HEADER_VALUE);

  // Additional security headers
  c.header('X-Permitted-Cross-Domain-Policies', 'none');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

/**
 * Request ID Middleware
 *
 * Generates a unique request ID for tracing and logging
 */
export const requestId = createMiddleware(async (c, next) => {
  const existingId = c.req.header('x-request-id');
  const requestIdValue = existingId || crypto.randomUUID();

  c.set('requestId', requestIdValue);
  c.header('X-Request-Id', requestIdValue);

  await next();
});

export default csrfProtection;
