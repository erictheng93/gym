/**
 * useOfflineSync composable (member-app)
 * Thin wrapper over shared createOfflineSync with member-specific queue helpers
 */
import { createOfflineSync } from '@shared/composables/useOfflineSyncCore'

const useOfflineSyncCore = createOfflineSync({
  dbName: 'gym-nexus-member',
  stateKeyPrefix: 'offline_sync_',
  getAuthHeaders: () => useAuthTokens().getAuthHeader(),
})

export const useOfflineSync = () => {
  const core = useOfflineSyncCore()
  const apiUrl = useRuntimeConfig().public.apiBaseUrl

  const queueCancelBooking = async (bookingId: string): Promise<string> => {
    return core.queueRequest({
      url: `${apiUrl}/api/member/bookings/${bookingId}`,
      method: 'DELETE',
      maxRetries: 3,
      type: 'booking',
      optimisticId: bookingId,
    })
  }

  const queueSubmitReview = async (
    payload: { booking_id: string; rating: number; comment?: string }
  ): Promise<string> => {
    return core.queueRequest({
      url: `${apiUrl}/api/member/reviews`,
      method: 'POST',
      body: payload,
      maxRetries: 3,
      type: 'review',
      optimisticId: payload.booking_id,
    })
  }

  const queueCreateWorkout = async (
    payload: Record<string, unknown>
  ): Promise<string> => {
    return core.queueRequest({
      url: `${apiUrl}/api/member/workouts`,
      method: 'POST',
      body: payload,
      maxRetries: 5,
      type: 'workout',
    })
  }

  const queueUpdateWorkout = async (
    workoutId: string,
    payload: Record<string, unknown>
  ): Promise<string> => {
    return core.queueRequest({
      url: `${apiUrl}/api/member/workouts/${workoutId}`,
      method: 'PUT',
      body: payload,
      maxRetries: 5,
      type: 'workout',
      optimisticId: workoutId,
    })
  }

  const queueDeleteWorkout = async (workoutId: string): Promise<string> => {
    return core.queueRequest({
      url: `${apiUrl}/api/member/workouts/${workoutId}`,
      method: 'DELETE',
      maxRetries: 3,
      type: 'workout',
      optimisticId: workoutId,
    })
  }

  return {
    ...core,
    queueCancelBooking,
    queueSubmitReview,
    queueCreateWorkout,
    queueUpdateWorkout,
    queueDeleteWorkout,
  }
}
