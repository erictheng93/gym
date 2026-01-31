/**
 * useDirectus - DEPRECATED
 *
 * This composable has been deprecated as part of the Directus migration.
 * The application now uses backend-v2 (Hono.js) for all API operations.
 *
 * For API calls, use useApi composable or specific composables:
 * - useAuthV2 for authentication
 * - useMembers, useContracts, etc. for data operations
 *
 * @deprecated Use specific composables instead
 */
export const useDirectus = () => {
  console.warn('[DEPRECATED] useDirectus is deprecated. Use specific composables (useApi, useAuthV2, etc.) instead.')
  throw new Error('useDirectus is no longer available. The application has migrated to backend-v2.')
}

export type DirectusInstance = never
