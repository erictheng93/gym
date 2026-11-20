import { Hono } from 'hono';
import { db, tenants } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { DEFAULT_BRANDING, mergeBranding } from '../types/branding.js';
import type { TenantBranding } from '../types/branding.js';

interface BrandingCacheEntry {
  branding: TenantBranding;
  expiresAt: number;
}

const brandingCache = new Map<string, BrandingCacheEntry>();
const inFlightBranding = new Map<string, Promise<TenantBranding | null>>();
const BRANDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Invalidate branding cache for a specific tenant slug or all tenants
 */
export function invalidateBrandingCache(slug?: string): void {
  if (slug) {
    brandingCache.delete(slug);
    inFlightBranding.delete(slug);
  } else {
    brandingCache.clear();
    inFlightBranding.clear();
  }
}

const app = new Hono();

/**
 * GET /api/public/branding
 * Public API for retrieving tenant branding configuration
 * No authentication required - used by SSR for Launch Screen
 *
 * Query params:
 * - slug: tenant slug (required)
 * - app: app type ('admin' | 'member' | 'coach') (optional, for getting specific colors)
 *
 * Returns branding configuration with defaults applied
 */
app.get('/', async (c) => {
  const slug = c.req.query('slug');

  // If no slug provided, return default branding
  if (!slug) {
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return c.json({
      success: true,
      data: DEFAULT_BRANDING
    });
  }

  // Check in-memory cache
  const cached = brandingCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return c.json({
      success: true,
      data: cached.branding
    });
  }

  try {
    let fetchPromise = inFlightBranding.get(slug);
    if (!fetchPromise) {
      fetchPromise = (async () => {
        // Fetch tenant by slug
        const [tenant] = await db
          .select({
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
            settings: tenants.settings
          })
          .from(tenants)
          .where(eq(tenants.slug, slug))
          .limit(1);

        if (!tenant) {
          return null;
        }

        // Extract branding from settings JSONB
        const settings = (tenant.settings || {}) as Record<string, unknown>;
        const brandingData = settings.branding as Partial<TenantBranding> | undefined;

        // Merge with defaults
        const branding = mergeBranding(brandingData || {});

        // Cache the result
        brandingCache.set(slug, {
          branding,
          expiresAt: Date.now() + BRANDING_CACHE_TTL_MS
        });

        return branding;
      })().finally(() => {
        inFlightBranding.delete(slug);
      });

      inFlightBranding.set(slug, fetchPromise);
    }

    const branding = await fetchPromise;

    // If tenant not found, return default branding
    if (!branding) {
      c.header('Cache-Control', 'public, max-age=60');
      return c.json({
        success: true,
        data: DEFAULT_BRANDING
      });
    }

    // Return branding configuration
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return c.json({
      success: true,
      data: branding
    });
  } catch (error) {
    console.error('[Branding API] Error fetching branding:', error);
    // On error, return defaults to avoid breaking the app
    return c.json({
      success: true,
      data: DEFAULT_BRANDING
    });
  }
});

export default app;
