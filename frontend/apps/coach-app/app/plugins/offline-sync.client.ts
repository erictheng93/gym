/**
 * Offline Sync Plugin
 * Initializes online/offline detection and background sync capabilities
 */

export default defineNuxtPlugin(() => {
  const { setupListeners, syncPendingRequests, hasPendingRequests } = useOfflineSync()

  // Set up online/offline listeners
  setupListeners()

  // Register periodic background sync if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      if ('periodicSync' in reg) {
        (reg as any).periodicSync.register('sync-pending-requests', {
          minInterval: 5 * 60 * 1000, // 5 minutes
        }).catch(() => {
          // Periodic sync not available, fall back to manual
        })
      }
    })
  }

  // Sync on visibility change (when user returns to the app)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && hasPendingRequests.value) {
        syncPendingRequests()
      }
    })
  }
})
