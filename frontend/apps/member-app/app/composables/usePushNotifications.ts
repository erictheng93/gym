/**
 * usePushNotifications composable
 * Handles Web Push notification subscription and management
 */

import type { PushNotificationPreferences } from '../types/notification'

export const usePushNotifications = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl
  const { getAuthHeader, isAuthenticated } = useMemberAuth()

  const isSupported = useState('push_supported', () => false)
  const isSubscribed = useState('push_subscribed', () => false)
  const permission = useState<NotificationPermission>('push_permission', () => 'default')
  const subscription = useState<PushSubscription | null>('push_subscription', () => null)
  const preferences = useState<PushNotificationPreferences>('push_preferences', () => ({
    notify_booking_reminder: true,
    notify_contract_expiry: true,
    notify_class_cancelled: true,
    notify_promotions: true,
  }))
  const isLoading = useState('push_loading', () => false)

  /**
   * Check if push notifications are supported
   */
  const checkSupport = () => {
    if (import.meta.client) {
      isSupported.value = 'serviceWorker' in navigator && 'PushManager' in window
      permission.value = Notification.permission
    }
    return isSupported.value
  }

  /**
   * Get VAPID public key from server
   */
  const getVapidKey = async (): Promise<string | null> => {
    try {
      const response = await $fetch<{ success: boolean; publicKey: string }>(
        `${apiUrl}/gym/push/vapid-public-key`
      )
      return response.success ? response.publicKey : null
    } catch {
      return null
    }
  }

  /**
   * Request notification permission
   */
  const requestPermission = async (): Promise<NotificationPermission> => {
    if (!isSupported.value) {
      return 'denied'
    }

    try {
      const result = await Notification.requestPermission()
      permission.value = result
      return result
    } catch {
      return 'denied'
    }
  }

  /**
   * Subscribe to push notifications
   */
  const subscribe = async (): Promise<boolean> => {
    if (!isSupported.value || !isAuthenticated.value) {
      return false
    }

    isLoading.value = true

    try {
      // Request permission if not granted
      if (permission.value !== 'granted') {
        const result = await requestPermission()
        if (result !== 'granted') {
          return false
        }
      }

      // Get VAPID key
      const vapidKey = await getVapidKey()
      if (!vapidKey) {
        return false
      }

      // Register service worker if not already registered
      const registration = await navigator.serviceWorker.ready

      // Subscribe to push
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // Send subscription to server
      const p256dh = arrayBufferToBase64(pushSubscription.getKey('p256dh'))
      const auth = arrayBufferToBase64(pushSubscription.getKey('auth'))

      const response = await $fetch<{ success: boolean; subscription_id: string }>(
        `${apiUrl}/gym/push/subscribe`,
        {
          method: 'POST',
          headers: getAuthHeader(),
          body: {
            endpoint: pushSubscription.endpoint,
            keys: {
              p256dh,
              auth,
            },
            device_name: getDeviceName(),
            preferences: preferences.value,
          },
        }
      )

      if (response.success) {
        subscription.value = pushSubscription
        isSubscribed.value = true
        return true
      }

      return false
    } catch {
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  const unsubscribe = async (): Promise<boolean> => {
    if (!subscription.value) {
      return true
    }

    isLoading.value = true

    try {
      // Unsubscribe locally
      await subscription.value.unsubscribe()

      // Notify server
      await $fetch(`${apiUrl}/gym/push/unsubscribe`, {
        method: 'DELETE',
        body: {
          endpoint: subscription.value.endpoint,
        },
      })

      subscription.value = null
      isSubscribed.value = false
      return true
    } catch {
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Update notification preferences
   */
  const updatePreferences = async (newPreferences: Partial<PushNotificationPreferences>): Promise<boolean> => {
    if (!subscription.value) {
      // Just update local state
      preferences.value = { ...preferences.value, ...newPreferences }
      return true
    }

    try {
      const response = await $fetch<{ success: boolean }>(
        `${apiUrl}/gym/push/preferences`,
        {
          method: 'PATCH',
          headers: getAuthHeader(),
          body: {
            endpoint: subscription.value.endpoint,
            preferences: { ...preferences.value, ...newPreferences },
          },
        }
      )

      if (response.success) {
        preferences.value = { ...preferences.value, ...newPreferences }
        return true
      }

      return false
    } catch {
      return false
    }
  }

  /**
   * Check current subscription status
   */
  const checkSubscription = async () => {
    if (!isSupported.value) return

    try {
      const registration = await navigator.serviceWorker.ready
      const existingSubscription = await registration.pushManager.getSubscription()

      if (existingSubscription) {
        subscription.value = existingSubscription
        isSubscribed.value = true
      } else {
        subscription.value = null
        isSubscribed.value = false
      }
    } catch {
      // Subscription check failed
    }
  }

  // Helper functions
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const arrayBufferToBase64 = (buffer: ArrayBuffer | null): string => {
    if (!buffer) return ''
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  const getDeviceName = (): string => {
    const ua = navigator.userAgent
    if (/iPhone/.test(ua)) return 'iPhone'
    if (/iPad/.test(ua)) return 'iPad'
    if (/Android/.test(ua)) return 'Android'
    if (/Mac/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows'
    return 'Unknown Device'
  }

  // Initialize on client
  onMounted(() => {
    checkSupport()
    if (isSupported.value && isAuthenticated.value) {
      checkSubscription()
    }
  })

  // Computed properties
  const canSubscribe = computed(() =>
    isSupported.value && permission.value !== 'denied' && !isSubscribed.value
  )

  const isDenied = computed(() => permission.value === 'denied')

  const needsPermission = computed(() =>
    isSupported.value && permission.value === 'default'
  )

  return {
    isSupported,
    isSubscribed,
    permission,
    subscription,
    preferences,
    isLoading,
    canSubscribe,
    isDenied,
    needsPermission,
    checkSupport,
    requestPermission,
    subscribe,
    unsubscribe,
    updatePreferences,
    checkSubscription,
  }
}
