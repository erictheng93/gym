/**
 * Session Rehydration Plugin (Client-only)
 *
 * Note: Session hydration is now handled directly in the auth middleware
 * to ensure correct timing and avoid race conditions on hard refresh.
 *
 * This plugin is kept for logging/debugging purposes only.
 */
import { loadSession } from '~/utils/session-storage'

export default defineNuxtPlugin(() => {
  // Session hydration 已移至 middleware/auth.ts
  // 這裡只做 debug logging
  if (import.meta.dev) {
    const cachedSession = loadSession()
    if (cachedSession) {
      console.log('[SessionRehydration] Cached session found, will be hydrated by middleware')
    }
  }
})
