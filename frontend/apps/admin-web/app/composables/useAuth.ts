/**
 * useAuth - Authentication composable (migrated to backend-v2)
 *
 * This composable has been migrated from Directus to backend-v2.
 * All auth operations now go through the new Hono.js backend.
 *
 * For types, import from useAuthV2:
 * import type { User, Employee, CurrentEmployee } from '~/composables/useAuthV2'
 */
export { useAuthV2 as useAuth } from './useAuthV2'
