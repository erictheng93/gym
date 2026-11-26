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
import { deduplicateRequest } from '../utils/debounce'

// --- Backend payloads (backend/src/routes/member-notifications.ts) ---

type Channel = 'line' | 'push' | 'email' | 'sms'

export interface ApiNotificationPreferences {
  channels: Record<Channel, boolean>
  types: {
    booking_confirmation?: boolean
    booking_reminder: boolean
    contract_expiry: boolean
    class_cancelled: boolean
    payment_confirmation?: boolean
    promotions: boolean
    system: boolean
  }
  quietHours: { enabled: boolean; start: string; end: string }
  smsFallback?: boolean
}

interface PreferencesResponse {
  success: boolean
  data: { preferences: ApiNotificationPreferences }
}

export interface ApiChannel {
  channel: Channel
  connected: boolean
  details: { email?: string; phone?: string; displayName?: string; devices?: number } | null
}

interface ChannelsResponse {
  success: boolean
  data: { channels: ApiChannel[] }
}

export interface ApiNotification {
  id: string
  type: string
  title: string | null
  message: string | null
  isRead: boolean
  createdAt: string
  reference: { type: string; id: string } | null
}

interface HistoryResponse {
  success: boolean
  data: {
    notifications: ApiNotification[]
    pagination: { total: number; page: number; limit: number; totalPages: number }
  }
}

/** Flat app key -> [section, backend key] */
const TYPE_KEYS = {
  notify_booking_confirmation: 'booking_confirmation',
  notify_booking_reminder: 'booking_reminder',
  notify_booking_cancelled: 'class_cancelled',
  notify_contract_expiry: 'contract_expiry',
  notify_payment_confirmation: 'payment_confirmation',
  notify_promotions: 'promotions',
  notify_system: 'system',
} as const

export function toNotificationPreferences(p: ApiNotificationPreferences): NotificationPreferences {
  return {
    enable_line: p.channels.line,
    enable_push: p.channels.push,
    enable_email: p.channels.email,
    enable_sms: p.channels.sms,
    notify_booking_confirmation: p.types.booking_confirmation ?? true,
    notify_booking_reminder: p.types.booking_reminder,
    notify_booking_cancelled: p.types.class_cancelled,
    notify_contract_expiry: p.types.contract_expiry,
    notify_payment_confirmation: p.types.payment_confirmation ?? true,
    notify_promotions: p.types.promotions,
    notify_system: p.types.system,
    quiet_hours_enabled: p.quietHours.enabled,
    quiet_hours_start: p.quietHours.start,
    quiet_hours_end: p.quietHours.end,
    sms_fallback_enabled: p.smsFallback ?? false,
    sms_otp_only: false,
  }
}

/** PUT body: only the sections/keys present in `updates`. */
export function toPreferencesUpdateBody(updates: Partial<NotificationPreferences>) {
  const body: {
    channels?: Partial<Record<Channel, boolean>>
    types?: Record<string, boolean>
    quietHours?: { enabled?: boolean; start?: string; end?: string }
    smsFallback?: boolean
  } = {}
  for (const channel of ['line', 'push', 'email', 'sms'] as const) {
    const value = updates[`enable_${channel}`]
    if (value !== undefined) body.channels = { ...body.channels, [channel]: value }
  }
  for (const [key, apiKey] of Object.entries(TYPE_KEYS) as [keyof typeof TYPE_KEYS, string][]) {
    const value = updates[key]
    if (value !== undefined) body.types = { ...body.types, [apiKey]: value }
  }
  if (updates.quiet_hours_enabled !== undefined) body.quietHours = { ...body.quietHours, enabled: updates.quiet_hours_enabled }
  if (updates.quiet_hours_start !== undefined) body.quietHours = { ...body.quietHours, start: updates.quiet_hours_start }
  if (updates.quiet_hours_end !== undefined) body.quietHours = { ...body.quietHours, end: updates.quiet_hours_end }
  if (updates.sms_fallback_enabled !== undefined) body.smsFallback = updates.sms_fallback_enabled
  return body
}

export function toChannelDetails(channels: ApiChannel[]): ChannelDetails {
  const get = (c: Channel) => channels.find(x => x.channel === c)
  return {
    line: { available: !!get('line')?.connected, displayName: get('line')?.details?.displayName },
    push: { available: !!get('push')?.connected },
    email: { available: !!get('email')?.connected, address: get('email')?.details?.email },
    sms: { available: !!get('sms')?.connected, phone: get('sms')?.details?.phone },
  }
}

export function toNotificationHistory(n: ApiNotification): NotificationHistory {
  return {
    id: n.id,
    notification_type: n.type,
    title: n.title,
    body: n.message,
    successful_channel: null,
    overall_status: n.isRead ? 'READ' : 'SENT',
    sent_at: n.createdAt,
    reference_type: n.reference?.type ?? null,
    reference_id: n.reference?.id ?? null,
    date_created: n.createdAt,
  }
}

export const useNotificationPreferences = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
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
   * Fetch notification preferences and available channels (with request deduplication)
   */
  const fetchPreferences = async (): Promise<boolean> => {
    if (!isAuthenticated.value) return false

    return deduplicateRequest('notification:preferences', async () => {
      isLoading.value = true
      error.value = null

      try {
        const response = await $fetch<PreferencesResponse>(`${apiUrl}/api/member/notifications/preferences`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          preferences.value = toNotificationPreferences(response.data.preferences)
          return true
        }
        return false
      } catch (err) {
        error.value = err instanceof Error ? err.message : '載入設定失敗'
        return false
      } finally {
        isLoading.value = false
      }
    })
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
      const response = await $fetch<PreferencesResponse & { message: string }>(`${apiUrl}/api/member/notifications/preferences`, {
        method: 'PUT',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: toPreferencesUpdateBody(updates),
      })

      if (response.success) {
        preferences.value = toNotificationPreferences(response.data.preferences)
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
   * Fetch detailed channel information (with request deduplication)
   */
  const fetchChannelDetails = async (): Promise<boolean> => {
    if (!isAuthenticated.value) return false

    return deduplicateRequest('notification:channels', async () => {
      try {
        const response = await $fetch<ChannelsResponse>(`${apiUrl}/api/member/notifications/channels`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          const details = toChannelDetails(response.data.channels)
          channelDetails.value = details
          availableChannels.value = {
            line: details.line.available,
            push: details.push.available,
            email: details.email.available,
            sms: details.sms.available,
          }
          return true
        }
        return false
      } catch {
        return false
      }
    })
  }

  /**
   * Fetch notification history (with request deduplication)
   */
  const fetchHistory = async (
    limit = 20,
    offset = 0
  ): Promise<boolean> => {
    if (!isAuthenticated.value) return false

    const dedupKey = `notification:history:${limit}:${offset}`
    return deduplicateRequest(dedupKey, async () => {
      try {
        const page = Math.floor(offset / limit) + 1
        const response = await $fetch<HistoryResponse>(
          `${apiUrl}/api/member/notifications/history?limit=${limit}&page=${page}`,
          {
            headers: getAuthHeader(),
          }
        )

        if (response.success) {
          const items = response.data.notifications.map(toNotificationHistory)
          if (offset === 0) {
            history.value = items
          } else {
            history.value = [...history.value, ...items]
          }
          historyPagination.value = { limit, offset, total: response.data.pagination.total }
          return true
        }
        return false
      } catch {
        return false
      }
    })
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
   * Send a test push notification to the member's own subscribed devices
   */
  const sendTestNotification = async (): Promise<{
    success: boolean
    sent?: number
    error?: string
  }> => {
    if (!isAuthenticated.value) {
      return { success: false, error: '未登入' }
    }

    try {
      const response = await $fetch<{
        success: boolean
        data?: { sent: number }
        error?: string
      }>(`${apiUrl}/api/member/push/test`, {
        method: 'POST',
        headers: getAuthHeader(),
      })

      return { success: response.success, sent: response.data?.sent, error: response.error }
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
    () => history.value.length < historyPagination.value.total
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
