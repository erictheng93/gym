/**
 * Tests for usePushNotifications composable
 *
 * Tests Web Push notification subscription and management
 * Note: Browser APIs are mocked for unit testing
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state stores
const stateStore = new Map<string, { value: unknown }>()
const cookieStore = new Map<string, { value: string | null | undefined }>()

// Mock Push Subscription
const mockPushSubscription = {
  endpoint: 'https://push.example.com/subscription/123',
  getKey: vi.fn((name: string) => {
    if (name === 'p256dh') return new ArrayBuffer(8)
    if (name === 'auth') return new ArrayBuffer(8)
    return null
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
}

// Mock Push Manager
const mockPushManager = {
  subscribe: vi.fn().mockResolvedValue(mockPushSubscription),
  getSubscription: vi.fn().mockResolvedValue(null),
}

// Mock Service Worker Registration
const mockServiceWorkerRegistration = {
  pushManager: mockPushManager,
}

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    directusUrl: 'http://localhost:8500',
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

vi.stubGlobal('onMounted', (_fn: () => void) => {
  // Don't auto-execute in tests
})

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

// Import after mocks - note: we'll test the logic without browser APIs
import { usePushNotifications } from './usePushNotifications'

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockIsAuthenticated.value = true
    mockPushManager.getSubscription.mockResolvedValue(null)
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const push = usePushNotifications()

      expect(push.isSupported).toBeDefined()
      expect(push.isSubscribed).toBeDefined()
      expect(push.permission).toBeDefined()
      expect(push.subscription).toBeDefined()
      expect(push.preferences).toBeDefined()
      expect(push.isLoading).toBeDefined()
    })

    it('should have default preferences', () => {
      const { preferences } = usePushNotifications()

      expect(preferences.value).toEqual({
        notify_booking_reminder: true,
        notify_contract_expiry: true,
        notify_class_cancelled: true,
        notify_promotions: true,
      })
    })

    it('should expose computed properties', () => {
      const push = usePushNotifications()

      expect(push.canSubscribe).toBeDefined()
      expect(push.isDenied).toBeDefined()
      expect(push.needsPermission).toBeDefined()
    })

    it('should expose all required methods', () => {
      const push = usePushNotifications()

      expect(typeof push.checkSupport).toBe('function')
      expect(typeof push.requestPermission).toBe('function')
      expect(typeof push.subscribe).toBe('function')
      expect(typeof push.unsubscribe).toBe('function')
      expect(typeof push.updatePreferences).toBe('function')
      expect(typeof push.checkSubscription).toBe('function')
    })
  })

  describe('subscribe', () => {
    it('should return false when not supported', async () => {
      stateStore.set('push_supported', { value: false })

      const { subscribe } = usePushNotifications()
      const result = await subscribe()

      expect(result).toBe(false)
    })

    it('should return false when not authenticated', async () => {
      mockIsAuthenticated.value = false
      stateStore.set('push_supported', { value: true })

      const { subscribe } = usePushNotifications()
      const result = await subscribe()

      expect(result).toBe(false)
    })

    it('should reset loading state after subscribe completes', async () => {
      stateStore.set('push_supported', { value: false })

      const { subscribe, isLoading } = usePushNotifications()

      // Subscribe will fail because not supported
      await subscribe()

      // Loading should be false after operation completes
      expect(isLoading.value).toBe(false)
    })
  })

  describe('unsubscribe', () => {
    it('should return true when no subscription exists', async () => {
      const { unsubscribe } = usePushNotifications()

      const result = await unsubscribe()

      expect(result).toBe(true)
    })

    it('should attempt to unsubscribe and notify server when subscription exists', async () => {
      stateStore.set('push_subscription', { value: mockPushSubscription })
      stateStore.set('push_subscribed', { value: true })

      mockFetch.mockResolvedValueOnce({ success: true })

      const { unsubscribe, isSubscribed, subscription } = usePushNotifications()
      const result = await unsubscribe()

      expect(result).toBe(true)
      expect(mockPushSubscription.unsubscribe).toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8500/gym/push/unsubscribe',
        expect.objectContaining({
          method: 'DELETE',
          body: { endpoint: 'https://push.example.com/subscription/123' },
        })
      )
      expect(isSubscribed.value).toBe(false)
      expect(subscription.value).toBeNull()
    })

    it('should set loading state during unsubscribe', async () => {
      stateStore.set('push_subscription', { value: mockPushSubscription })

      mockFetch.mockResolvedValueOnce({ success: true })

      const { unsubscribe, isLoading } = usePushNotifications()
      const promise = unsubscribe()

      expect(isLoading.value).toBe(true)

      await promise

      expect(isLoading.value).toBe(false)
    })

    it('should return false on unsubscribe error', async () => {
      stateStore.set('push_subscription', { value: mockPushSubscription })

      mockPushSubscription.unsubscribe.mockRejectedValueOnce(new Error('Failed'))

      const { unsubscribe } = usePushNotifications()
      const result = await unsubscribe()

      expect(result).toBe(false)
    })
  })

  describe('updatePreferences', () => {
    it('should update local preferences when no subscription', async () => {
      const { updatePreferences, preferences } = usePushNotifications()

      const result = await updatePreferences({
        notify_promotions: false,
      })

      expect(result).toBe(true)
      expect(preferences.value.notify_promotions).toBe(false)
    })

    it('should update server preferences when subscribed', async () => {
      stateStore.set('push_subscription', { value: mockPushSubscription })

      mockFetch.mockResolvedValueOnce({ success: true })

      const { updatePreferences, preferences } = usePushNotifications()
      const result = await updatePreferences({
        notify_booking_reminder: false,
      })

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8500/gym/push/preferences',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'X-Member-Token': 'test-token' },
          body: expect.objectContaining({
            endpoint: 'https://push.example.com/subscription/123',
          }),
        })
      )
      expect(preferences.value.notify_booking_reminder).toBe(false)
    })

    it('should return false on server error', async () => {
      stateStore.set('push_subscription', { value: mockPushSubscription })

      mockFetch.mockResolvedValueOnce({ success: false })

      const { updatePreferences } = usePushNotifications()
      const result = await updatePreferences({
        notify_promotions: false,
      })

      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      stateStore.set('push_subscription', { value: mockPushSubscription })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { updatePreferences } = usePushNotifications()
      const result = await updatePreferences({
        notify_promotions: false,
      })

      expect(result).toBe(false)
    })
  })

  describe('computed properties', () => {
    it('canSubscribe should be true when supported, not denied, and not subscribed', () => {
      stateStore.set('push_supported', { value: true })
      stateStore.set('push_permission', { value: 'default' })
      stateStore.set('push_subscribed', { value: false })

      const { canSubscribe } = usePushNotifications()

      expect(canSubscribe.value).toBe(true)
    })

    it('canSubscribe should be false when already subscribed', () => {
      stateStore.set('push_supported', { value: true })
      stateStore.set('push_permission', { value: 'granted' })
      stateStore.set('push_subscribed', { value: true })

      const { canSubscribe } = usePushNotifications()

      expect(canSubscribe.value).toBe(false)
    })

    it('canSubscribe should be false when permission denied', () => {
      stateStore.set('push_supported', { value: true })
      stateStore.set('push_permission', { value: 'denied' })
      stateStore.set('push_subscribed', { value: false })

      const { canSubscribe } = usePushNotifications()

      expect(canSubscribe.value).toBe(false)
    })

    it('isDenied should be true when permission is denied', () => {
      stateStore.set('push_permission', { value: 'denied' })

      const { isDenied } = usePushNotifications()

      expect(isDenied.value).toBe(true)
    })

    it('isDenied should be false when permission is not denied', () => {
      stateStore.set('push_permission', { value: 'granted' })

      const { isDenied } = usePushNotifications()

      expect(isDenied.value).toBe(false)
    })

    it('needsPermission should be true when supported and permission is default', () => {
      stateStore.set('push_supported', { value: true })
      stateStore.set('push_permission', { value: 'default' })

      const { needsPermission } = usePushNotifications()

      expect(needsPermission.value).toBe(true)
    })

    it('needsPermission should be false when permission already granted', () => {
      stateStore.set('push_supported', { value: true })
      stateStore.set('push_permission', { value: 'granted' })

      const { needsPermission } = usePushNotifications()

      expect(needsPermission.value).toBe(false)
    })
  })

  describe('state management', () => {
    it('should track subscription status', () => {
      const { isSubscribed, subscription } = usePushNotifications()

      expect(isSubscribed.value).toBe(false)
      expect(subscription.value).toBeNull()

      stateStore.set('push_subscribed', { value: true })
      stateStore.set('push_subscription', { value: mockPushSubscription })

      // Get fresh instance to check updated state
      const { isSubscribed: newIsSubscribed, subscription: newSubscription } = usePushNotifications()

      expect(newIsSubscribed.value).toBe(true)
      expect(newSubscription.value).toBe(mockPushSubscription)
    })

    it('should track permission status', () => {
      const { permission } = usePushNotifications()

      expect(permission.value).toBe('default')

      stateStore.set('push_permission', { value: 'granted' })

      const { permission: newPermission } = usePushNotifications()

      expect(newPermission.value).toBe('granted')
    })
  })
})
