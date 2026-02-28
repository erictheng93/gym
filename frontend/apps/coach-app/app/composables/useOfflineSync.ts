/**
 * useOfflineSync composable (coach-app)
 * Thin wrapper over shared createOfflineSync with coach-specific queue helpers
 */
import { createOfflineSync } from '@shared/composables/useOfflineSyncCore'

const useOfflineSyncCore = createOfflineSync({
  dbName: 'gym-nexus-coach',
  stateKeyPrefix: 'coach_offline_sync_',
  getAuthHeaders: () => useCoachTokens().getAuthHeader(),
})

export const useOfflineSync = () => {
  const core = useOfflineSyncCore()
  const apiUrl = useRuntimeConfig().public.apiBaseUrl

  const queueMarkAttendance = async (
    bookingId: string,
    data: { attended: boolean; notes?: string; class_record?: Record<string, unknown> }
  ): Promise<string> => {
    return core.queueRequest({
      url: `${apiUrl}/api/coach/classes/${bookingId}/attendance`,
      method: 'POST',
      body: data,
      maxRetries: 3,
      type: 'attendance',
      optimisticId: bookingId,
      description: data.attended ? '標記出席' : '標記未到',
    })
  }

  const queueCancelClass = async (
    sessionId: string,
    reason: string
  ): Promise<string> => {
    return core.queueRequest({
      url: `${apiUrl}/api/coach/classes/${sessionId}/cancel`,
      method: 'POST',
      body: { reason },
      maxRetries: 3,
      type: 'cancel_class',
      optimisticId: sessionId,
      description: '取消課程',
    })
  }

  return {
    ...core,
    queueMarkAttendance,
    queueCancelClass,
  }
}
