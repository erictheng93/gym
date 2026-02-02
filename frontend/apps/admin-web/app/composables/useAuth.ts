/**
 * useAuth - Authentication composable
 *
 * All auth operations go through the Hono.js backend (backend-v2).
 *
 * For types, import from useAuthV2:
 * import type { User, Employee, CurrentEmployee } from '~/composables/useAuthV2'
 */
export { useAuthV2 as useAuth } from './useAuthV2'
