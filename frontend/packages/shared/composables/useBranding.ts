/**
 * useBranding - Branding configuration composable
 *
 * Provides access to tenant branding configuration
 * Supports SSR-injected configuration via window.__BRANDING__
 */

import type { TenantBranding, AppType } from '../utils/branding-css';
import { DEFAULT_BRANDING, getFullBrandName, getAppColors } from '../utils/branding-css';

// Global state for branding
const brandingState = ref<TenantBranding | null>(null);
const isLoaded = ref(false);

/**
 * Declare global window property for SSR injection
 */
declare global {
  interface Window {
    __BRANDING__?: TenantBranding;
  }
}

/**
 * useBranding composable
 *
 * @param appType - The app type ('admin' | 'member' | 'coach')
 * @returns Branding configuration and utilities
 *
 * @example
 * ```ts
 * const { brandName, colors, fullBrandName } = useBranding('admin')
 * ```
 */
export function useBranding(appType: AppType = 'admin') {
  // Initialize from SSR-injected data on client
  if (import.meta.client && !isLoaded.value) {
    if (window.__BRANDING__) {
      brandingState.value = window.__BRANDING__;
    }
    isLoaded.value = true;
  }

  // Use branding from state or defaults
  const branding = computed<TenantBranding>(() => {
    return brandingState.value || DEFAULT_BRANDING;
  });

  // Brand name (without suffix)
  const brandName = computed(() => branding.value.brandName);

  // Full brand name (with app-specific suffix)
  const fullBrandName = computed(() => getFullBrandName(branding.value, appType));

  // App-specific colors
  const colors = computed(() => getAppColors(branding.value, appType));

  // App suffix
  const appSuffix = computed(() => {
    return branding.value.appSuffix?.[appType] || DEFAULT_BRANDING.appSuffix![appType];
  });

  // All app colors
  const allColors = computed(() => branding.value.colors);

  // All app suffixes
  const allSuffixes = computed(() => branding.value.appSuffix || DEFAULT_BRANDING.appSuffix);

  /**
   * Set branding configuration (for SSR or manual updates)
   */
  function setBranding(newBranding: TenantBranding) {
    brandingState.value = newBranding;
  }

  /**
   * Reset to default branding
   */
  function resetBranding() {
    brandingState.value = null;
  }

  /**
   * Fetch branding from API
   */
  async function fetchBranding(apiBaseUrl: string, slug?: string) {
    try {
      const url = slug
        ? `${apiBaseUrl}/api/public/branding?slug=${encodeURIComponent(slug)}`
        : `${apiBaseUrl}/api/public/branding`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.data) {
        brandingState.value = data.data;
        return data.data as TenantBranding;
      }

      return DEFAULT_BRANDING;
    } catch (error) {
      console.error('[useBranding] Failed to fetch branding:', error);
      return DEFAULT_BRANDING;
    }
  }

  return {
    // Branding data
    branding,
    brandName,
    fullBrandName,
    colors,
    appSuffix,
    allColors,
    allSuffixes,

    // Actions
    setBranding,
    resetBranding,
    fetchBranding,

    // State
    isLoaded: readonly(isLoaded)
  };
}

export type { TenantBranding, AppType };
export { DEFAULT_BRANDING };
