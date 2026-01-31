/**
 * useAuthWrapper - Authentication wrapper (fully migrated to backend-v2)
 *
 * This wrapper previously allowed switching between Directus and backend-v2 auth.
 * Now that migration is complete, it always uses backend-v2 auth.
 *
 * Usage:
 *   const { login, logout, user, isAuthenticated, checkAuth } = useAuthWrapper()
 */
import { useAuthV2 } from './useAuthV2'

// Re-export useAuthV2 as useAuthWrapper for backwards compatibility
export const useAuthWrapper = useAuthV2

// Export useAuth as alias for easier migration
export const useAuth = useAuthV2
