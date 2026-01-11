/**
 * Session Rehydration Plugin (Client-only)
 *
 * Attempts to restore user session from localStorage on app initialization.
 * This provides a better UX by showing the authenticated state immediately
 * while verifying the session with the server in the background.
 */
import { loadSession } from '~/utils/session-storage'

export default defineNuxtPlugin(async () => {
  // Only run on client side (this file is .client.ts so it's automatic)
  const cachedSession = loadSession()

  if (cachedSession) {
    // We have a cached session - hydrate the state immediately for better UX
    const user = useState('auth_user')
    const currentEmployee = useState('auth_employee')

    // Set cached values immediately (will be verified by checkAuth later)
    if (!user.value) {
      user.value = cachedSession.user
    }
    if (!currentEmployee.value && cachedSession.employee) {
      currentEmployee.value = cachedSession.employee
    }

    console.log('[SessionRehydration] Restored session from localStorage')
  }
})
