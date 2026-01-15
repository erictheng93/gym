/**
 * Notification Types - Centralized notification type definitions
 *
 * These types are used across notification composables:
 * - useNotificationPreferences
 * - usePushNotifications
 */

export interface NotificationPreferences {
  // Channel toggles
  enable_line: boolean
  enable_push: boolean
  enable_email: boolean
  enable_sms: boolean

  // Notification type toggles
  notify_booking_confirmation: boolean
  notify_booking_reminder: boolean
  notify_booking_cancelled: boolean
  notify_contract_expiry: boolean
  notify_payment_confirmation: boolean
  notify_promotions: boolean
  notify_system: boolean

  // Quiet hours
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string

  // SMS settings
  sms_fallback_enabled: boolean
  sms_otp_only: boolean
}

export interface AvailableChannels {
  line: boolean
  push: boolean
  email: boolean
  sms: boolean
}

export interface ChannelDetails {
  line: {
    available: boolean
    displayName?: string
    linkedAt?: string
  }
  push: {
    available: boolean
    deviceName?: string
    subscribedAt?: string
  }
  email: {
    available: boolean
    address?: string
  }
  sms: {
    available: boolean
    phone?: string
  }
}

export interface NotificationHistory {
  id: string
  notification_type: string
  title: string | null
  body: string | null
  successful_channel: string | null
  overall_status: string
  sent_at: string | null
  reference_type: string | null
  reference_id: string | null
  date_created: string
}

/**
 * Simplified push notification preferences
 * Used by usePushNotifications for Web Push specific settings
 */
export interface PushNotificationPreferences {
  notify_booking_reminder: boolean
  notify_contract_expiry: boolean
  notify_class_cancelled: boolean
  notify_promotions: boolean
}
