import { Hono } from 'hono';
import { db, tenants } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { DEFAULT_BRANDING, mergeBranding } from '../types/branding.js';
import type { TenantBranding } from '../types/branding.js';

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
    return c.json({
      success: true,
      data: DEFAULT_BRANDING
    });
  }

  try {
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

    // If tenant not found, return default branding
    if (!tenant) {
      return c.json({
        success: true,
        data: DEFAULT_BRANDING
      });
    }

    // Extract branding from settings JSONB
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const brandingData = settings.branding as Partial<TenantBranding> | undefined;

    // Merge with defaults
    const branding = mergeBranding(brandingData || {});

    // Return branding configuration
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
