/**
 * useAuthWrapper - Authentication wrapper
 *
 * Uses backend-v2 auth.
 *
 * Usage:
 *   const { login, logout, user, isAuthenticated, checkAuth } = useAuthWrapper()
 */
import { useAuthV2 } from './useAuthV2'

// Re-export useAuthV2 as useAuthWrapper for backwards compatibility
export const useAuthWrapper = useAuthV2

// Export useAuth as alias for easier migration
export const useAuth = useAuthV2
