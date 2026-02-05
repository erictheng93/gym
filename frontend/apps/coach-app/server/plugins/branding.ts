/**
 * Branding SSR Plugin for Coach App
 *
 * Injects dynamic branding configuration into the HTML during SSR:
 * - Critical CSS for Launch Screen
 * - window.__BRANDING__ for client-side hydration
 */

import { generateAppCriticalCSS, DEFAULT_BRANDING } from '@shared/utils/branding-css';
import type { TenantBranding } from '@shared/utils/branding-css';

// Simple in-memory cache for branding
let cachedBranding: TenantBranding | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch branding from API with caching
 */
async function fetchBranding(apiBaseUrl: string, slug?: string): Promise<TenantBranding> {
  const now = Date.now();

  // Return cached value if still valid
  if (cachedBranding && now - cacheTimestamp < CACHE_TTL) {
    return cachedBranding;
  }

  try {
    const url = slug
      ? `${apiBaseUrl}/api/public/branding?slug=${encodeURIComponent(slug)}`
      : `${apiBaseUrl}/api/public/branding`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.warn('[Branding Plugin] API returned non-OK status:', response.status);
      return DEFAULT_BRANDING;
    }

    const data = await response.json();

    if (data.success && data.data) {
      cachedBranding = data.data;
      cacheTimestamp = now;
      return data.data;
    }

    return DEFAULT_BRANDING;
  } catch (error) {
    console.error('[Branding Plugin] Failed to fetch branding:', error);
    return DEFAULT_BRANDING;
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (html, { event }) => {
    // Get API URL from runtime config
    const config = useRuntimeConfig(event);
    const apiBaseUrl = config.public?.apiBaseUrl || 'http://localhost:8056';

    // Get tenant slug from environment or default
    const slug = process.env.TENANT_SLUG || 'gym-nexus';

    // Fetch branding configuration
    const branding = await fetchBranding(apiBaseUrl, slug);

    // Generate Critical CSS
    const criticalCSS = generateAppCriticalCSS(branding, 'coach');

    // Inject at the end of <head>
    const styleTag = `<style>${criticalCSS}</style>`;
    const brandingScript = `<script>window.__BRANDING__=${JSON.stringify(branding)};</script>`;

    html.head.push(styleTag);
    html.head.push(brandingScript);
  });
});
