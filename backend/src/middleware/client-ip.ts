import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/**
 * How many reverse proxies in front of the API append the address they received
 * the request from to X-Forwarded-For (TRUST_PROXY). Unset, "false", "0" or an
 * invalid value means none: forwarding headers are then ignored, because any
 * client can send them. "true" means one.
 *
 * Production (docs/deployment-runbook.md): Cloudflare edge -> cloudflared tunnel
 * -> API. The edge appends the visitor's address and cloudflared forwards it
 * unchanged, so TRUST_PROXY=1.
 */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (raw === 'true') return 1;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address || undefined;
  } catch {
    // No Node socket (app.request() in tests, other runtimes)
    return undefined;
  }
}

/**
 * The client address for rate limiting and logging.
 *
 * Without proxy trust this is the TCP peer. With TRUST_PROXY=n it is the entry
 * the outermost trusted proxy appended to X-Forwarded-For: the n-th from the
 * right. Entries left of it were sent by the client and can be anything, so
 * the left-most entry is never used on its own. X-Real-IP is used only when a
 * trusted proxy sent no X-Forwarded-For.
 */
export function getClientIp(c: Context, env: Record<string, string | undefined> = process.env): string {
  const hops = trustedProxyHops(env);
  if (hops > 0) {
    const chain = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    if (chain.length > 0) return chain[Math.max(chain.length - hops, 0)];

    const realIp = c.req.header('x-real-ip')?.trim();
    if (realIp) return realIp;
  }
  return socketAddress(c) ?? 'unknown';
}
