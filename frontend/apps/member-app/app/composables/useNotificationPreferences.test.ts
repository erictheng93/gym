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

const mockChannelDetails = {
  line: {
    available: true,
    displayName: 'John Doe',
    linkedAt: '2024-01-01T00:00:00Z',
  },
  push: {
    available: true,
    deviceName: 'iPhone',
    subscribedAt: '2024-01-01T00:00:00Z',
  },
  email: {
    available: true,
    address: 'test@example.com',
  },
  sms: {
    available: false,
    phone: undefined,
  },
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
    directusUrl: 'http://localhost:8055',
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

  describe('fetchPreferences', () => {
    it('should return false when not authenticated', async () => {
      mockIsAuthenticated.value = false

      const { fetchPreferences } = useNotificationPreferences()
      const result = await fetchPreferences()

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch preferences successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        preferences: mockPreferences,
        available_channels: mockAvailableChannels,
      })

      const { fetchPreferences, preferences, availableChannels, isLoading } = useNotificationPreferences()
      const result = await fetchPreferences()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/notifications/preferences',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
      expect(preferences.value).toEqual(mockPreferences)
      expect(availableChannels.value).toEqual(mockAvailableChannels)
      expect(isLoading.value).toBe(false)
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
          setTimeout(() => resolve({
            success: true,
            preferences: mockPreferences,
            available_channels: mockAvailableChannels,
          }), 100)
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
      const result = await updatePreferences({ enable_promotions: true })

      expect(result).toBe(false)
    })

    it('should update preferences successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Updated',
        preferences: { ...mockPreferences, notify_promotions: true },
      })

      const { updatePreferences, preferences } = useNotificationPreferences()
      const result = await updatePreferences({ notify_promotions: true })

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/notifications/preferences',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'X-Member-Token': 'test-token',
            'Content-Type': 'application/json',
          }),
          body: { notify_promotions: true },
        })
      )
      expect(preferences.value?.notify_promotions).toBe(true)
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
        preferences: { ...mockPreferences, enable_line: false },
      })

      const { togglePreference, preferences } = useNotificationPreferences()
      const result = await togglePreference('enable_line', false)

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/notifications/preferences',
        expect.objectContaining({
          body: { enable_line: false },
        })
      )
    })
  })

  describe('fetchChannelDetails', () => {
    it('should return false when not authenticated', async () => {
      mockIsAuthenticated.value = false

      const { fetchChannelDetails } = useNotificationPreferences()
      const result = await fetchChannelDetails()

      expect(result).toBe(false)
    })

    it('should fetch channel details successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        channels: mockChannelDetails,
      })

      const { fetchChannelDetails, channelDetails } = useNotificationPreferences()
      const result = await fetchChannelDetails()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/notifications/channels',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
      expect(channelDetails.value).toEqual(mockChannelDetails)
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

    it('should fetch history successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockNotificationHistory,
        pagination: { limit: 20, offset: 0, total: 2 },
      })

      const { fetchHistory, history, historyPagination } = useNotificationPreferences()
      const result = await fetchHistory()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/notifications/history?limit=20&offset=0',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
      expect(history.value).toEqual(mockNotificationHistory)
      expect(historyPagination.value).toEqual({ limit: 20, offset: 0, total: 2 })
    })

    it('should append history on offset > 0', async () => {
      // First fetch
      stateStore.set('notification_history', { value: mockNotificationHistory })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 4 } })

      const additionalHistory = [
        {
          id: 'notif-3',
          notification_type: 'test',
          title: 'Test',
          body: 'Test body',
          successful_channel: 'email',
          overall_status: 'delivered',
          sent_at: '2024-01-03T10:00:00Z',
          reference_type: null,
          reference_id: null,
          date_created: '2024-01-03T10:00:00Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: additionalHistory,
        pagination: { limit: 20, offset: 20, total: 4 },
      })

      const { fetchHistory, history } = useNotificationPreferences()
      await fetchHistory(20, 20)

      expect(history.value.length).toBe(3)
    })

    it('should replace history on offset = 0', async () => {
      stateStore.set('notification_history', { value: mockNotificationHistory })

      const newHistory = [
        {
          id: 'notif-new',
          notification_type: 'new',
          title: 'New',
          body: 'New body',
          successful_channel: 'push',
          overall_status: 'delivered',
          sent_at: '2024-01-04T10:00:00Z',
          reference_type: null,
          reference_id: null,
          date_created: '2024-01-04T10:00:00Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: newHistory,
        pagination: { limit: 20, offset: 0, total: 1 },
      })

      const { fetchHistory, history } = useNotificationPreferences()
      await fetchHistory()

      expect(history.value).toEqual(newHistory)
    })
  })

  describe('loadMoreHistory', () => {
    it('should return false when no more items', async () => {
      stateStore.set('notification_history', { value: mockNotificationHistory })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 2 } })

      const { loadMoreHistory } = useNotificationPreferences()
      const result = await loadMoreHistory()

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should load more items when available', async () => {
      stateStore.set('notification_history', { value: mockNotificationHistory })
      stateStore.set('notification_history_pagination', { value: { limit: 20, offset: 0, total: 40 } })

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        pagination: { limit: 20, offset: 20, total: 40 },
      })

      const { loadMoreHistory } = useNotificationPreferences()
      await loadMoreHistory()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/notifications/history?limit=20&offset=20',
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
        channel: 'push',
      })

      const { sendTestNotification } = useNotificationPreferences()
      const result = await sendTestNotification('push', 'test')

      expect(result).toEqual({ success: true, channel: 'push' })
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/notifications/test',
        expect.objectContaining({
          method: 'POST',
          body: { channel: 'push', type: 'test' },
        })
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
