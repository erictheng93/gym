/**
 * useAuthWrapper - Feature flag wrapper for authentication
 * Allows switching between old Directus auth and new backend-v2 auth
 *
 * Usage:
 *   const { login, logout, user, isAuthenticated, checkAuth } = useAuthWrapper()
 *
 * Set USE_NEW_AUTH=true in .env to use the new backend-v2 auth
 */
import { useAuth } from './useAuth'
import { useAuthV2 } from './useAuthV2'

export const useAuthWrapper = () => {
  const config = useRuntimeConfig()
  const useNewAuth = config.public?.useNewAuth === true

  if (useNewAuth) {
    return useAuthV2()
  }

  return useAuth()
}

// Helper to check if new auth is enabled
export const isNewAuthEnabled = () => {
  const config = useRuntimeConfig()
  return config.public?.useNewAuth === true
}
