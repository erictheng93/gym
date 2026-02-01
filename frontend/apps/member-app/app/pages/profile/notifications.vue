<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { addToast } = useToast()

// Push notifications composable (existing)
const {
  isSupported: pushSupported,
  isSubscribed: pushSubscribed,
  permission: pushPermission,
  isLoading: pushLoading,
  canSubscribe: pushCanSubscribe,
  isDenied: pushDenied,
  subscribe: subscribePush,
  unsubscribe: unsubscribePush,
} = usePushNotifications()

// Multi-channel notification preferences (new)
const {
  preferences,
  availableChannels,
  channelDetails,
  history,
  historyPagination,
  isLoading,
  error,
  fetchPreferences,
  updatePreferences,
  togglePreference,
  fetchChannelDetails,
  fetchHistory,
  loadMoreHistory,
  hasMoreHistory,
  getChannelLabel,
  getNotificationTypeLabel,
  sendTestNotification,
} = useNotificationPreferences()

const isSaving = ref(false)
const activeTab = ref<'settings' | 'history'>('settings')
const showQuietHours = ref(false)

// Load data on mount
onMounted(async () => {
  await Promise.all([
    fetchPreferences(),
    fetchChannelDetails(),
  ])
})

// Channel icons
const channelIcons = {
  line: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 5.94 2 10.7c0 4.18 3.71 7.68 8.72 8.52.34.07.8.22.92.51.11.26.07.66.04.93l-.15.91c-.05.28-.22 1.08.95.59 1.17-.49 6.31-3.72 8.61-6.36C22.61 13.13 22 11.02 22 10.7 22 5.94 17.52 2 12 2z"/></svg>`,
  push: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  sms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
}

// Notification type keys
type NotificationTypeKey =
  | 'notify_booking_confirmation'
  | 'notify_booking_reminder'
  | 'notify_booking_cancelled'
  | 'notify_contract_expiry'
  | 'notify_payment_confirmation'
  | 'notify_promotions'
  | 'notify_system'

// Notification types configuration
const notificationTypes: Array<{
  key: NotificationTypeKey
  label: string
  description: string
  icon: string
}> = [
  {
    key: 'notify_booking_confirmation',
    label: '預約確認',
    description: '預約課程成功時通知',
    icon: 'calendar-check',
  },
  {
    key: 'notify_booking_reminder',
    label: '課程提醒',
    description: '課程開始前 24 小時和 2 小時提醒',
    icon: 'clock',
  },
  {
    key: 'notify_booking_cancelled',
    label: '預約取消',
    description: '課程取消或您取消預約時通知',
    icon: 'calendar-x',
  },
  {
    key: 'notify_contract_expiry',
    label: '會籍到期提醒',
    description: '會籍到期前 7 天、3 天、1 天提醒',
    icon: 'alert-circle',
  },
  {
    key: 'notify_payment_confirmation',
    label: '付款確認',
    description: '付款成功時通知',
    icon: 'credit-card',
  },
  {
    key: 'notify_promotions',
    label: '優惠活動',
    description: '接收最新優惠和活動資訊',
    icon: 'gift',
  },
  {
    key: 'notify_system',
    label: '系統通知',
    description: '重要系統公告和維護通知',
    icon: 'info',
  },
]

// Handle push subscription
const handlePushSubscribe = async () => {
  const success = await subscribePush()
  if (success) {
    addToast({ message: '推播通知已開啟', type: 'success' })
    await fetchPreferences()
  } else {
    addToast({ message: '開啟推播通知失敗', type: 'error' })
  }
}

const handlePushUnsubscribe = async () => {
  if (confirm('確定要關閉推播通知嗎？')) {
    const success = await unsubscribePush()
    if (success) {
      addToast({ message: '推播通知已關閉', type: 'success' })
      await fetchPreferences()
    }
  }
}

// Handle channel toggle
const handleChannelToggle = async (channel: 'line' | 'push' | 'email' | 'sms') => {
  if (!preferences.value) return

  const key = `enable_${channel}` as keyof typeof preferences.value
  const newValue = !preferences.value[key]

  isSaving.value = true
  const success = await togglePreference(key, newValue)
  isSaving.value = false

  if (success) {
    addToast({
      message: `${getChannelLabel(channel)} 通知已${newValue ? '開啟' : '關閉'}`,
      type: 'success'
    })
  } else {
    addToast({ message: '更新失敗，請稍後再試', type: 'error' })
  }
}

// Handle notification type toggle
const handleTypeToggle = async (key: NotificationTypeKey) => {
  if (!preferences.value) return

  const newValue = !preferences.value[key]

  isSaving.value = true
  const toggleSuccess = await togglePreference(key, newValue)
  isSaving.value = false

  if (toggleSuccess) {
    addToast({ message: '設定已儲存', type: 'success' })
  } else {
    addToast({ message: '更新失敗，請稍後再試', type: 'error' })
  }
}

// Handle quiet hours toggle
const handleQuietHoursToggle = async () => {
  if (!preferences.value) return

  const newValue = !preferences.value.quiet_hours_enabled

  isSaving.value = true
  const success = await togglePreference('quiet_hours_enabled', newValue)
  isSaving.value = false

  if (success) {
    addToast({
      message: `勿擾時段已${newValue ? '開啟' : '關閉'}`,
      type: 'success'
    })
  }
}

// Handle quiet hours time update
const handleQuietHoursUpdate = async () => {
  if (!preferences.value) return

  isSaving.value = true
  const success = await updatePreferences({
    quiet_hours_start: preferences.value.quiet_hours_start,
    quiet_hours_end: preferences.value.quiet_hours_end,
  })
  isSaving.value = false

  if (success) {
    addToast({ message: '勿擾時段已更新', type: 'success' })
  }
}

// Handle SMS fallback toggle
const handleSmsFallbackToggle = async () => {
  if (!preferences.value) return

  isSaving.value = true
  const success = await togglePreference('sms_fallback_enabled', !preferences.value.sms_fallback_enabled)
  isSaving.value = false

  if (success) {
    addToast({ message: '備用簡訊設定已更新', type: 'success' })
  }
}

// Load history when tab switches
watch(activeTab, async (tab) => {
  if (tab === 'history' && history.value.length === 0) {
    await fetchHistory()
  }
})

// Format date for display
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get status badge class
const getStatusClass = (status: string) => {
  switch (status) {
    case 'sent':
    case 'delivered':
      return 'status-success'
    case 'failed':
      return 'status-error'
    case 'pending':
      return 'status-pending'
    default:
      return 'status-default'
  }
}

// Get status label
const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    sent: '已發送',
    delivered: '已送達',
    failed: '失敗',
    pending: '待發送',
  }
  return labels[status] || status
}
</script>

<template>
  <div class="notifications-page">
    <header class="page-header">
      <NuxtLink to="/profile" class="back-button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">通知設定</h1>
    </header>

    <!-- Tabs -->
    <div class="tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'settings' }"
        @click="activeTab = 'settings'"
      >
        設定
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        歷史紀錄
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && !preferences" class="loading-state">
      <div class="spinner"></div>
      <p>載入中...</p>
    </div>

    <!-- Settings Tab -->
    <div v-else-if="activeTab === 'settings'" class="tab-content">
      <!-- Notification Channels Section -->
      <section class="section">
        <h2 class="section-title">通知管道</h2>
        <p class="section-description">選擇您希望接收通知的方式</p>

        <div class="channels-grid">
          <!-- LINE Channel -->
          <div class="channel-card" :class="{ available: availableChannels.line }">
            <div class="channel-header">
              <div class="channel-icon line" v-html="channelIcons.line"></div>
              <div class="channel-info">
                <h3>LINE</h3>
                <p v-if="channelDetails?.line.available" class="channel-status connected">
                  已連結
                  <span v-if="channelDetails.line.displayName">
                    ({{ channelDetails.line.displayName }})
                  </span>
                </p>
                <p v-else class="channel-status">未連結</p>
              </div>
            </div>
            <button
              v-if="availableChannels.line"
              class="toggle-switch"
              :class="{ active: preferences?.enable_line }"
              :disabled="isSaving"
              @click="handleChannelToggle('line')"
            >
              <span class="toggle-knob"></span>
            </button>
            <NuxtLink
              v-else
              to="/profile/linked-accounts"
              class="btn-link"
            >
              前往綁定
            </NuxtLink>
          </div>

          <!-- Push Channel -->
          <div class="channel-card" :class="{ available: pushSupported }">
            <div class="channel-header">
              <div class="channel-icon push" v-html="channelIcons.push"></div>
              <div class="channel-info">
                <h3>推播通知</h3>
                <p v-if="pushDenied" class="channel-status error">權限已封鎖</p>
                <p v-else-if="pushSubscribed" class="channel-status connected">已開啟</p>
                <p v-else-if="!pushSupported" class="channel-status">不支援</p>
                <p v-else class="channel-status">未開啟</p>
              </div>
            </div>
            <button
              v-if="pushCanSubscribe"
              class="btn-enable"
              :disabled="pushLoading"
              @click="handlePushSubscribe"
            >
              開啟
            </button>
            <button
              v-else-if="pushSubscribed"
              class="toggle-switch active"
              :disabled="pushLoading"
              @click="handlePushUnsubscribe"
            >
              <span class="toggle-knob"></span>
            </button>
            <span v-else-if="pushDenied" class="status-badge error">
              已封鎖
            </span>
          </div>

          <!-- Email Channel -->
          <div class="channel-card" :class="{ available: availableChannels.email }">
            <div class="channel-header">
              <div class="channel-icon email" v-html="channelIcons.email"></div>
              <div class="channel-info">
                <h3>Email</h3>
                <p v-if="channelDetails?.email.available" class="channel-status connected">
                  {{ channelDetails.email.address }}
                </p>
                <p v-else class="channel-status">未設定</p>
              </div>
            </div>
            <button
              v-if="availableChannels.email"
              class="toggle-switch"
              :class="{ active: preferences?.enable_email }"
              :disabled="isSaving"
              @click="handleChannelToggle('email')"
            >
              <span class="toggle-knob"></span>
            </button>
            <NuxtLink
              v-else
              to="/profile"
              class="btn-link"
            >
              設定 Email
            </NuxtLink>
          </div>

          <!-- SMS Channel -->
          <div class="channel-card" :class="{ available: availableChannels.sms }">
            <div class="channel-header">
              <div class="channel-icon sms" v-html="channelIcons.sms"></div>
              <div class="channel-info">
                <h3>簡訊</h3>
                <p v-if="channelDetails?.sms.available" class="channel-status connected">
                  {{ channelDetails.sms.phone }}
                </p>
                <p v-else class="channel-status">未設定</p>
              </div>
            </div>
            <button
              v-if="availableChannels.sms"
              class="toggle-switch"
              :class="{ active: preferences?.enable_sms }"
              :disabled="isSaving"
              @click="handleChannelToggle('sms')"
            >
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>
      </section>

      <!-- Notification Types Section -->
      <section v-if="preferences" class="section">
        <h2 class="section-title">通知類型</h2>
        <p class="section-description">選擇您想要接收的通知類型</p>

        <div class="preferences-list">
          <div
            v-for="option in notificationTypes"
            :key="option.key"
            class="preference-item"
          >
            <div class="preference-info">
              <h3 class="preference-label">{{ option.label }}</h3>
              <p class="preference-description">{{ option.description }}</p>
            </div>
            <button
              class="toggle-switch"
              :class="{ active: preferences[option.key] }"
              :disabled="isSaving"
              @click="handleTypeToggle(option.key)"
            >
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>
      </section>

      <!-- Quiet Hours Section -->
      <section v-if="preferences" class="section">
        <h2 class="section-title">勿擾時段</h2>
        <p class="section-description">在指定時段內暫停非緊急通知</p>

        <div class="quiet-hours-card">
          <div class="quiet-hours-toggle">
            <div class="toggle-info">
              <div class="toggle-icon moon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </div>
              <div>
                <h3 class="toggle-label">勿擾模式</h3>
                <p class="toggle-description">
                  {{ preferences.quiet_hours_enabled
                    ? `${preferences.quiet_hours_start} - ${preferences.quiet_hours_end}`
                    : '已關閉'
                  }}
                </p>
              </div>
            </div>
            <button
              class="toggle-switch"
              :class="{ active: preferences.quiet_hours_enabled }"
              :disabled="isSaving"
              @click="handleQuietHoursToggle"
            >
              <span class="toggle-knob"></span>
            </button>
          </div>

          <div v-if="preferences.quiet_hours_enabled" class="quiet-hours-times">
            <div class="time-picker">
              <label>開始時間</label>
              <input
                v-model="preferences.quiet_hours_start"
                type="time"
                @change="handleQuietHoursUpdate"
              />
            </div>
            <div class="time-separator">至</div>
            <div class="time-picker">
              <label>結束時間</label>
              <input
                v-model="preferences.quiet_hours_end"
                type="time"
                @change="handleQuietHoursUpdate"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- SMS Fallback Section -->
      <section v-if="preferences && availableChannels.sms" class="section">
        <h2 class="section-title">備用設定</h2>

        <div class="preferences-list">
          <div class="preference-item">
            <div class="preference-info">
              <h3 class="preference-label">簡訊備用</h3>
              <p class="preference-description">
                當 LINE 和推播無法送達時，使用簡訊發送重要通知
              </p>
            </div>
            <button
              class="toggle-switch"
              :class="{ active: preferences.sms_fallback_enabled }"
              :disabled="isSaving"
              @click="handleSmsFallbackToggle"
            >
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>

        <p class="info-note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          簡訊僅用於重要通知（如 OTP 驗證碼、會籍到期提醒），每日發送有上限
        </p>
      </section>

      <!-- Help Text -->
      <div class="help-text">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p>建議開啟 LINE 通知以獲得最佳體驗。若未綁定 LINE 帳號，可前往「連結帳號」頁面進行綁定。</p>
      </div>
    </div>

    <!-- History Tab -->
    <div v-else-if="activeTab === 'history'" class="tab-content">
      <div v-if="isLoading && history.length === 0" class="loading-state">
        <div class="spinner"></div>
        <p>載入中...</p>
      </div>

      <div v-else-if="history.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <p>尚無通知紀錄</p>
      </div>

      <div v-else class="history-list">
        <div
          v-for="item in history"
          :key="item.id"
          class="history-item"
        >
          <div class="history-header">
            <span class="history-type">{{ getNotificationTypeLabel(item.notification_type) }}</span>
            <span class="history-date">{{ formatDate(item.date_created) }}</span>
          </div>
          <div class="history-body">
            <p v-if="item.title" class="history-title">{{ item.title }}</p>
            <p v-if="item.body" class="history-text">{{ item.body }}</p>
          </div>
          <div class="history-footer">
            <span v-if="item.successful_channel" class="history-channel">
              透過 {{ getChannelLabel(item.successful_channel) }}
            </span>
            <span
              class="status-badge"
              :class="getStatusClass(item.overall_status)"
            >
              {{ getStatusLabel(item.overall_status) }}
            </span>
          </div>
        </div>

        <button
          v-if="hasMoreHistory"
          class="btn-load-more"
          :disabled="isLoading"
          @click="loadMoreHistory"
        >
          {{ isLoading ? '載入中...' : '載入更多' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notifications-page {
  padding: 16px;
  padding-bottom: 100px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.back-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: var(--color-surface);
  border-radius: 12px;
  color: var(--color-text);
  text-decoration: none;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

/* Tabs */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background-color: var(--color-surface);
  padding: 4px;
  border-radius: 12px;
}

.tab-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background-color: var(--color-primary);
  color: white;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Section */
.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.section-description {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

/* Channels Grid */
.channels-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.channel-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.channel-card.available {
  opacity: 1;
}

.channel-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.channel-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.channel-icon svg {
  width: 22px;
  height: 22px;
}

.channel-icon.line {
  background-color: #06C755;
  color: white;
}

.channel-icon.push {
  background-color: var(--color-primary);
  color: white;
}

.channel-icon.email {
  background-color: #EA4335;
  color: white;
}

.channel-icon.sms {
  background-color: #5865F2;
  color: white;
}

.channel-info h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.channel-status {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
}

.channel-status.connected {
  color: var(--color-primary);
}

.channel-status.error {
  color: var(--color-error);
}

.btn-link {
  padding: 8px 16px;
  background-color: var(--color-surface-secondary);
  color: var(--color-primary);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  text-align: center;
}

.btn-enable {
  padding: 8px 16px;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-enable:disabled {
  opacity: 0.6;
}

/* Preferences List */
.preferences-list {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
}

.preference-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.preference-item:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.preference-info {
  flex: 1;
  padding-right: 16px;
}

.preference-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.preference-description {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  width: 52px;
  height: 32px;
  background-color: var(--color-border);
  border-radius: 16px;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease;
  padding: 0;
  flex-shrink: 0;
}

.toggle-switch.active {
  background-color: var(--color-primary);
}

.toggle-switch:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 28px;
  height: 28px;
  background-color: white;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

/* Quiet Hours */
.quiet-hours-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
}

.quiet-hours-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.toggle-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toggle-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-icon.moon {
  background-color: #6366f1;
  color: white;
}

.toggle-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.toggle-description {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.quiet-hours-times {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-surface-secondary);
}

.time-picker {
  flex: 1;
}

.time-picker label {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: 6px;
}

.time-picker input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 16px;
}

.time-separator {
  padding-top: 20px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

/* Info Note */
.info-note {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.info-note svg {
  flex-shrink: 0;
  margin-top: 1px;
}

/* Status Badge */
.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.error {
  background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
  color: var(--color-error);
}

.status-badge.status-success {
  background-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
}

.status-badge.status-error {
  background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
  color: var(--color-error);
}

.status-badge.status-pending {
  background-color: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

/* Help Text */
.help-text {
  display: flex;
  gap: 12px;
  padding: 16px;
  background-color: var(--color-surface-secondary);
  border-radius: 12px;
}

.help-text svg {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.help-text p {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0;
  line-height: 1.5;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-tertiary);
}

.empty-state svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 15px;
}

/* History List */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 16px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-type {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  text-transform: uppercase;
}

.history-date {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.history-body {
  margin-bottom: 12px;
}

.history-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.history-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.4;
}

.history-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-channel {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.btn-load-more {
  padding: 14px 24px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-load-more:active:not(:disabled) {
  background-color: var(--color-surface-secondary);
}

.btn-load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 360px) {
  .channels-grid {
    grid-template-columns: 1fr;
  }
}
</style>
