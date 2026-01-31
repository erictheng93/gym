/**
 * Directus Client Plugin - DEPRECATED
 *
 * This plugin has been deprecated as part of the Directus migration.
 * The application now uses backend-v2 (Hono.js) for all API operations.
 *
 * Authentication is handled by useAuthV2 composable.
 * API calls are made directly to backend-v2 via fetch.
 *
 * @deprecated This plugin is no longer used
 */
export default defineNuxtPlugin(() => {
  // No-op plugin - Directus has been replaced by backend-v2
  // Keeping this file to prevent import errors during transition
  return {
    provide: {
      directus: null
    }
  }
})
