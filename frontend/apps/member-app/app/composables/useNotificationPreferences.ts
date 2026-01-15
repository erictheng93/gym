/**
 * useNotificationPreferences composable
 *
 * Manages multi-channel notification preferences for members
 * Supports: LINE, Push, Email, SMS channels
 */

import type {
  NotificationPreferences,
  AvailableChannels,
  ChannelDetails,
  NotificationHistory,
} from '../types/notification'

interface PreferencesResponse {
  success: boolean
  preferences: NotificationPreferences
  available_channels: AvailableChannels
}

interface ChannelsResponse {
  success: boolean
  channels: ChannelDetails
}

interface HistoryResponse {
  success: boolean
  data: NotificationHistory[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export const useNotificationPreferences = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl
  const { getAuthHeader, isAuthenticated } = useMemberAuth()

  // State
  const preferences = useState<NotificationPreferences | null>('notification_prefs', () => null)
  const availableChannels = useState<AvailableChannels>('notification_channels', () => ({
    line: false,
    push: false,
    email: false,
    sms: false,
  }))
  const channelDetails = useState<ChannelDetails | null>('notification_channel_details', () => null)
  const history = useState<NotificationHistory[]>('notification_history', () => [])
  const historyPagination = useState('notification_history_pagination', () => ({
    limit: 20,
    offset: 0,
    total: 0,
  }))

  const isLoading = useState('notification_prefs_loading', () => false)
  const error = useState<string | null>('notification_prefs_error', () => null)

  /**
   * Fetch notification preferences and available channels
   */
  const fetchPreferences = async (): Promise<boolean> => {
    if (!isAuthenticated.value) return false

    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<PreferencesResponse>(`${apiUrl}/gym/notifications/preferences`, {
        headers: getAuthHeader(),
      })

      if (response.success) {
        preferences.value = response.preferences
        availableChannels.value = response.available_channels
        return true
      }
      return false
    } catch (err) {
      error.value = err instanceof Error ? err.message : '載入設定失敗'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Update notification preferences
   */
  const updatePreferences = async (
    updates: Partial<NotificationPreferences>
  ): Promise<boolean> => {
    if (!isAuthenticated.value) return false

    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        message: string
        preferences: NotificationPreferences
      }>(`${apiUrl}/gym/notifications/preferences`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: updates,
      })

      if (response.success) {
        preferences.value = response.preferences
        return true
      }
      return false
    } catch (err) {
      error.value = err instanceof Error ? err.message : '更新設定失敗'
      return false
    }
  }

  /**
   * Toggle a single preference
   */
  const togglePreference = async (
    key: keyof NotificationPreferences,
    value: boolean
  ): Promise<boolean> => {
    return updatePreferences({ [key]: value })
  }

  /**
   * Fetch detailed channel information
   */
  const fetchChannelDetails = async (): Promise<boolean> => {
    if (!isAuthenticated.value) return false

    try {
      const response = await $fetch<ChannelsResponse>(`${apiUrl}/gym/notifications/channels`, {
        headers: getAuthHeader(),
      })

      if (response.success) {
        channelDetails.value = response.channels
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Fetch notification history
   */
  const fetchHistory = async (
    limit = 20,
    offset = 0
  ): Promise<boolean> => {
    if (!isAuthenticated.value) return false

    try {
      const response = await $fetch<HistoryResponse>(
        `${apiUrl}/gym/notifications/history?limit=${limit}&offset=${offset}`,
        {
          headers: getAuthHeader(),
        }
      )

      if (response.success) {
        if (offset === 0) {
          history.value = response.data
        } else {
          history.value = [...history.value, ...response.data]
        }
        historyPagination.value = response.pagination
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Load more history items
   */
  const loadMoreHistory = async (): Promise<boolean> => {
    const nextOffset = historyPagination.value.offset + historyPagination.value.limit
    if (nextOffset >= historyPagination.value.total) return false
    return fetchHistory(historyPagination.value.limit, nextOffset)
  }

  /**
   * Send test notification (development only)
   */
  const sendTestNotification = async (
    channel?: 'line' | 'push' | 'email' | 'sms',
    type = 'test'
  ): Promise<{
    success: boolean
    channel?: string
    error?: string
  }> => {
    if (!isAuthenticated.value) {
      return { success: false, error: '未登入' }
    }

    try {
      const response = await $fetch<{
        success: boolean
        channel?: string
        error?: string
      }>(`${apiUrl}/gym/notifications/test`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: { channel, type },
      })

      return response
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : '發送失敗',
      }
    }
  }

  // Computed helpers
  const hasLineLinked = computed(() => availableChannels.value.line)
  const hasPushEnabled = computed(() => availableChannels.value.push)
  const hasEmail = computed(() => availableChannels.value.email)
  const hasPhone = computed(() => availableChannels.value.sms)
  const hasMoreHistory = computed(
    () => historyPagination.value.offset + history.value.length < historyPagination.value.total
  )

  // Channel label helpers
  const getChannelLabel = (channel: string): string => {
    const labels: Record<string, string> = {
      line: 'LINE',
      push: '推播通知',
      email: 'Email',
      sms: '簡訊',
    }
    return labels[channel] || channel
  }

  const getNotificationTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      booking_confirmation: '預約確認',
      booking_reminder_24h: '課程提醒 (24小時前)',
      booking_reminder_2h: '課程提醒 (2小時前)',
      booking_cancelled: '課程取消',
      class_cancelled: '課程取消',
      contract_expiry_7d: '會籍到期提醒 (7天)',
      contract_expiry_3d: '會籍到期提醒 (3天)',
      contract_expiry_1d: '會籍到期提醒 (1天)',
      payment_confirmation: '付款確認',
      welcome: '歡迎訊息',
      otp: '驗證碼',
      test: '測試通知',
    }
    return labels[type] || type
  }

  return {
    // State
    preferences,
    availableChannels,
    channelDetails,
    history,
    historyPagination,
    isLoading,
    error,

    // Actions
    fetchPreferences,
    updatePreferences,
    togglePreference,
    fetchChannelDetails,
    fetchHistory,
    loadMoreHistory,
    sendTestNotification,

    // Computed
    hasLineLinked,
    hasPushEnabled,
    hasEmail,
    hasPhone,
    hasMoreHistory,

    // Helpers
    getChannelLabel,
    getNotificationTypeLabel,
  }
}
