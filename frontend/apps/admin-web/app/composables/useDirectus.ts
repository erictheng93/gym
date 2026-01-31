/**
 * useDirectus - DEPRECATED
 *
 * This composable has been deprecated as part of the Directus migration.
 * All API calls should now use:
 * - useFetch from ~/composables/core/useFetch for data operations
 * - useAuthV2 for authentication
 * - Specific composables (useMembers, useContracts, etc.) for domain operations
 *
 * @deprecated Use useFetch or specific composables instead
 */
export const useDirectus = () => {
  console.warn('[DEPRECATED] useDirectus is deprecated. Use useFetch or specific composables instead.')

  // Return a mock object that warns on any property access
  return new Proxy({}, {
    get(_target, prop) {
      console.error(`[DEPRECATED] Attempted to access directus.${String(prop)}. The application has migrated to backend-v2.`)
      return () => Promise.reject(new Error('useDirectus is deprecated. Use useFetch instead.'))
    }
  })
}

export type DirectusInstance = never
