/**
 * Tests for useNotificationPreferences composable
 *
 * Tests multi-channel notification preferences management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state stores
const stateStore = new Map<string, { value: unknown }>()
const cookieStore = new Map<string, { value: string | null | undefined }>()

// Mock preferences data
const mockPreferences = {
  enable_line: true,
  enable_push: true,
  enable_email: true,
  enable_sms: false,
  notify_booking_confirmation: true,
  notify_booking_reminder: true,
  notify_booking_cancelled: true,
  notify_contract_expiry: true,
  notify_payment_confirmation: true,
  notify_promotions: false,
  notify_system: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  sms_fallback_enabled: true,
  sms_otp_only: false,
}

const mockAvailableChannels = {
  line: true,
  push: true,
  email: true,
  sms: false,
}

const mockNotificationHistory = [
  {
    id: 'notif-1',
    notification_type: 'booking_confirmation',
    title: 'Booking Confirmed',
    body: 'Your booking has been confirmed',
    successful_channel: 'push',
    overall_status: 'delivered',
    sent_at: '2024-01-01T10:00:00Z',
    reference_type: 'booking',
    reference_id: 'booking-123',
    date_created: '2024-01-01T10:00:00Z',
  },
  {
    id: 'notif-2',
    notification_type: 'booking_reminder_24h',
    title: 'Reminder',
    body: 'Your class is tomorrow',
    successful_channel: 'line',
    overall_status: 'delivered',
    sent_at: '2024-01-02T10:00:00Z',
    reference_type: 'booking',
    reference_id: 'booking-124',
    date_created: '2024-01-02T10:00:00Z',
  },
]

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})

vi.stubGlobal('useCookie', (name: string) => {
  if (!cookieStore.has(name)) {
    cookieStore.set(name, { value: null })
  }
  return cookieStore.get(name)!
})

vi.stubGlobal('computed', (getter: () => unknown) => ({
  get value() {
    return getter()
  },
}))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useMemberAuth
const mockIsAuthenticated = { value: true }
const mockGetAuthHeader = vi.fn(() => ({ 'X-Member-Token': 'test-token' }))

vi.stubGlobal('useMemberAuth', () => ({
  isAuthenticated: mockIsAuthenticated,
  getAuthHeader: mockGetAuthHeader,
}))

// Import after mocks
import { useNotificationPreferences } from './useNotificationPreferences'

describe('useNotificationPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockIsAuthenticated.value = true
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const prefs = useNotificationPreferences()

      expect(prefs.preferences).toBeDefined()
      expect(prefs.availableChannels).toBeDefined()
      expect(prefs.channelDetails).toBeDefined()
      expect(prefs.history).toBeDefined()
      expect(prefs.isLoading).toBeDefined()
      expect(prefs.error).toBeDefined()
    })

    it('should have default available channels as false', () => {
      const { availableChannels } = useNotificationPreferences()

      expect(availableChannels.value).toEqual({
        line: false,
        push: false,
        email: false,
        sms: false,
      })
    })
  })

  // Backend payloads (backend/src/routes/member-notifications.ts)
  const apiPreferences = {
    channels: { line: true, push: true, email: true, sms: false },
    types: {
      booking_confirmation: true,
      booking_reminder: true,
      contract_expiry: true,
      class_cancelled: true,
      payment_confirmation: true,
      promotions: false,
      system: true,
    },
    quietHours: { enabled: false, start: '22:00', end: '08:00' },
    smsFallback: true,
  }
  const apiChannels = [
    { channel: 'push', connected: true, details: { devices: 1 } },
    { channel: 'email', connected: true, details: { email: 'tes***@example.com' } },
    { channel: 'line', connected: true, details: { displayName: 'John Doe' } },
    { channel: 'sms', connected: false, details: null },
  ]
  const apiNotification = (id: string, type: string, isRead = false) => ({
    id,
    type,
    title: `T-${id}`,
    message: `M-${id}`,
    data: null,
    isRead,
    readAt: null,
    priority: 'normal',
    createdAt: '2024-01-01T10:00:00Z',
    reference: { type: 'booking', id: 'booking-123' },
  })
  const historyPage = (items: unknown[], total: number, page = 1) => ({
    notifications: items,
    pagination: { total, page, limit: 20, totalPages: Math.ceil(total / 20) },
  })

  describe('fetchPreferences', () => {
    it('should return false when not authenticated', async () => {
      mockIsAuthenticated.value = false

      const { fetchPreferences } = useNotificationPreferences()
      const result = await fetchPreferences()

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch and flatten the nested preferences', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: { preferences: apiPreferences } })

      const { fetchPreferences, preferences, isLoading } = useNotificationPreferences()
      const result = await fetchPreferences()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/notifications/preferences',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
      expect(preferences.value).toEqual(mockPreferences)
      expect(isLoading.value).toBe(false)
    })

    it('defaults the keys older stored preferences do not have', async () => {
      const { booking_confirmation: _a, payment_confirmation: _b, ...oldTypes } = apiPreferences.types
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { preferences: { channels: apiPreferences.channels, types: oldTypes, quietHours: apiPreferences.quietHours } },
      })

      const { fetchPreferences, preferences } = useNotificationPreferences()
      await fetchPreferences()

      expect(preferences.value).toMatchObject({
        notify_booking_confirmation: true,
        notify_payment_confirmation: true,
        sms_fallback_enabled: false,
      })
    })

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchPreferences, error } = useNotificationPreferences()
      const result = await fetchPreferences()

      expect(result).toBe(false)
      expect(error.value).toBe('Network error')
    })

    it('should return false on unsuccessful response', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { fetchPreferences } = useNotificationPreferences()
      const result = await fetchPreferences()

      expect(result).toBe(false)
    })

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false

      mockFetch.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: { preferences: apiPreferences } }), 100)
        })
      })

      const { fetchPreferences, isLoading } = useNotificationPreferences()
      const fetchPromise = fetchPreferences()

      // Check loading is true during fetch
      loadingDuringFetch = isLoading.value

      await fetchPromise

      expect(loadingDuringFetch).toBe(true)
      expect(isLoading.value).toBe(false)
    })
  })

  describe('updatePreferences', () => {
    it('should return false when not authenticated', async () => {
      mockIsAuthenticated.value = false

      const { updatePreferences } = useNotificationPreferences()
      const result = await updatePreferences({ notify_promotions: true })

      expect(result).toBe(false)
    })

    it('should PUT the nested shape the backend expects', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Updated',
        data: { preferences: { ...apiPreferences, types: { ...apiPreferences.types, promotions: true } } },
      })

      const { updatePreferences, preferences } = useNotificationPreferences()
      const result = await updatePreferences({ notify_promotions: true })

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/notifications/preferences',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'X-Member-Token': 'test-token',
            'Content-Type': 'application/json',
          }),
          body: { types: { promotions: true } },
        })
      )
      expect(preferences.value?.notify_promotions).toBe(true)
    })

    it('maps every flat key to its backend section', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: { preferences: apiPreferences } })

      await useNotificationPreferences().updatePreferences({
        enable_sms: true,
        notify_booking_cancelled: false,
        quiet_hours_enabled: true,
        quiet_hours_start: '23:00',
        quiet_hours_end: '07:00',
        sms_fallback_enabled: false,
      })

      expect(mockFetch.mock.calls[0]![1].body).toEqual({
        channels: { sms: true },
        types: { class_cancelled: false },
        quietHours: { enabled: true, start: '23:00', end: '07:00' },
        smsFallback: false,
      })
    })

    it('should handle update error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Update failed'))

      const { updatePreferences, error } = useNotificationPreferences()
      const result = await updatePreferences({ notify_promotions: true })

      expect(result).toBe(false)
      expect(error.value).toBe('Update failed')
    })
  })

  describe('togglePreference', () => {
    it('should toggle a single preference', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Updated',
        data: { preferences: { ...apiPreferences, channels: { ...apiPreferences.channels, line: false } } },
      })

      const { togglePreference, preferences } = useNotificationPreferences()
      const result = await togglePreference('enable_line', false)

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/notifications/preferences',
        expect.objectContaining({
          body: { channels: { line: false } },
        })
      )
      expect(preferences.value?.enable_line).toBe(false)
    })
  })

  describe('fetchChannelDetails', () => {
    it('should return false when not authenticated', async () => {
      mockIsAuthenticated.value = false

      const { fetchChannelDetails } = useNotificationPreferences()
      const result = await fetchChannelDetails()

      expect(result).toBe(false)
    })

    it('should map the channel list to details and available channels', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: { channels: apiChannels } })

      const { fetchChannelDetails, channelDetails, availableChannels } = useNotificationPreferences()
      const result = await fetchChannelDetails()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/notifications/channels',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
      expect(channelDetails.value).toEqual({
        line: { available: true, displayName: 'John Doe' },
        push: { available: true },
        email: { available: true, address: 'tes***@example.com' },
        sms: { available: false, phone: undefined },
      })
      expect(availableChannels.value).toEqual(mockAvailableChannels)
    })

    it('should return false on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchChannelDetails } = useNotificationPreferences()
      const result = await fetchChannelDetails()

      expect(result).toBe(false)
    })
  })

  describe('fetchHistory', () => {
    it('should return false when not authenticated', async () => {
      mockIsAuthenticated.value = false

      const { fetchHistory } = useNotificationPreferences()
      const result = await fetchHistory()

      expect(result).toBe(false)
    })

    it('should fetch page 1 and map the notifications', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: historyPage([apiNotification('n1', 'booking_confirmation', true)], 2),
      })

      const { fetchHistory, history, historyPagination } = useNotificationPreferences()
      const result = await fetchHistory()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/notifications/history?limit=20&page=1',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
      expect(history.value).toEqual([{
        id: 'n1',
        notification_type: 'booking_confirmation',
        title: 'T-n1',
        body: 'M-n1',
        successful_channel: null,
        overall_status: 'READ',
        sent_at: '2024-01-01T10:00:00Z',
        reference_type: 'booking',
        reference_id: 'booking-123',
        date_created: '2024-01-01T10:00:00Z',
      }])
      expect(historyPagination.value).toEqual({ limit: 20, offset: 0, total: 2 })
    })

    it('should append history on offset > 0', async () => {
      stateStore.set('notification_history', { value: mockNotificationHistory })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 21 } })

      mockFetch.mockResolvedValueOnce({ success: true, data: historyPage([apiNotification('n3', 'test')], 21, 2) })

      const { fetchHistory, history } = useNotificationPreferences()
      await fetchHistory(20, 20)

      expect(mockFetch.mock.calls[0]![0]).toBe('http://localhost:8056/api/member/notifications/history?limit=20&page=2')
      expect(history.value.length).toBe(3)
    })

    it('should replace history on offset = 0', async () => {
      stateStore.set('notification_history', { value: mockNotificationHistory })

      mockFetch.mockResolvedValueOnce({ success: true, data: historyPage([apiNotification('new', 'new')], 1) })

      const { fetchHistory, history } = useNotificationPreferences()
      await fetchHistory()

      expect(history.value.map(h => h.id)).toEqual(['new'])
    })
  })

  describe('loadMoreHistory', () => {
    it('should return false when no more items', async () => {
      stateStore.set('notification_history', { value: mockNotificationHistory })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 2 } })

      const { loadMoreHistory, hasMoreHistory } = useNotificationPreferences()
      const result = await loadMoreHistory()

      expect(result).toBe(false)
      expect(hasMoreHistory.value).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should load the next page when available', async () => {
      stateStore.set('notification_history', { value: mockNotificationHistory })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 40 } })

      mockFetch.mockResolvedValueOnce({ success: true, data: historyPage([], 40, 2) })

      const { loadMoreHistory } = useNotificationPreferences()
      await loadMoreHistory()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/notifications/history?limit=20&page=2',
        expect.any(Object)
      )
    })
  })

  describe('sendTestNotification', () => {
    it('should return error when not authenticated', async () => {
      mockIsAuthenticated.value = false

      const { sendTestNotification } = useNotificationPreferences()
      const result = await sendTestNotification()

      expect(result).toEqual({ success: false, error: '未登入' })
    })

    it('should send test notification successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { sent: 2 },
      })

      const { sendTestNotification } = useNotificationPreferences()
      const result = await sendTestNotification()

      expect(result).toEqual({ success: true, sent: 2, error: undefined })
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/push/test',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('should handle send error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Send failed'))

      const { sendTestNotification } = useNotificationPreferences()
      const result = await sendTestNotification()

      expect(result).toEqual({ success: false, error: 'Send failed' })
    })
  })

  describe('computed properties', () => {
    it('hasLineLinked should reflect available channels', () => {
      stateStore.set('notification_channels', { value: { line: true, push: false, email: false, sms: false } })

      const { hasLineLinked } = useNotificationPreferences()

      expect(hasLineLinked.value).toBe(true)
    })

    it('hasPushEnabled should reflect available channels', () => {
      stateStore.set('notification_channels', { value: { line: false, push: true, email: false, sms: false } })

      const { hasPushEnabled } = useNotificationPreferences()

      expect(hasPushEnabled.value).toBe(true)
    })

    it('hasEmail should reflect available channels', () => {
      stateStore.set('notification_channels', { value: { line: false, push: false, email: true, sms: false } })

      const { hasEmail } = useNotificationPreferences()

      expect(hasEmail.value).toBe(true)
    })

    it('hasPhone should reflect available channels', () => {
      stateStore.set('notification_channels', { value: { line: false, push: false, email: false, sms: true } })

      const { hasPhone } = useNotificationPreferences()

      expect(hasPhone.value).toBe(true)
    })

    it('hasMoreHistory should be true when more items available', () => {
      stateStore.set('notification_history', { value: [{ id: '1' }] })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 50 } })

      const { hasMoreHistory } = useNotificationPreferences()

      expect(hasMoreHistory.value).toBe(true)
    })

    it('hasMoreHistory should be false when all items loaded', () => {
      stateStore.set('notification_history', { value: [{ id: '1' }, { id: '2' }] })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 2 } })

      const { hasMoreHistory } = useNotificationPreferences()

      expect(hasMoreHistory.value).toBe(false)
    })
  })

  describe('helper functions', () => {
    it('getChannelLabel should return correct labels', () => {
      const { getChannelLabel } = useNotificationPreferences()

      expect(getChannelLabel('line')).toBe('LINE')
      expect(getChannelLabel('push')).toBe('推播通知')
      expect(getChannelLabel('email')).toBe('Email')
      expect(getChannelLabel('sms')).toBe('簡訊')
      expect(getChannelLabel('unknown')).toBe('unknown')
    })

    it('getNotificationTypeLabel should return correct labels', () => {
      const { getNotificationTypeLabel } = useNotificationPreferences()

      expect(getNotificationTypeLabel('booking_confirmation')).toBe('預約確認')
      expect(getNotificationTypeLabel('booking_reminder_24h')).toBe('課程提醒 (24小時前)')
      expect(getNotificationTypeLabel('contract_expiry_7d')).toBe('會籍到期提醒 (7天)')
      expect(getNotificationTypeLabel('payment_confirmation')).toBe('付款確認')
      expect(getNotificationTypeLabel('otp')).toBe('驗證碼')
      expect(getNotificationTypeLabel('test')).toBe('測試通知')
      expect(getNotificationTypeLabel('unknown_type')).toBe('unknown_type')
    })
  })
})
