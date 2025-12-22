<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const {
  isSupported,
  isSubscribed,
  permission,
  preferences,
  isLoading,
  canSubscribe,
  isDenied,
  subscribe,
  unsubscribe,
  updatePreferences,
} = usePushNotifications()

const isSaving = ref(false)
const successMessage = ref('')

const handleSubscribe = async () => {
  const success = await subscribe()
  if (success) {
    successMessage.value = '通知已開啟'
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)
  }
}

const handleUnsubscribe = async () => {
  if (confirm('確定要關閉通知嗎？')) {
    const success = await unsubscribe()
    if (success) {
      successMessage.value = '通知已關閉'
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    }
  }
}

const togglePreference = async (key: keyof typeof preferences.value) => {
  isSaving.value = true
  const newValue = !preferences.value[key]
  const success = await updatePreferences({ [key]: newValue })
  if (success) {
    successMessage.value = '設定已儲存'
    setTimeout(() => {
      successMessage.value = ''
    }, 2000)
  }
  isSaving.value = false
}

const notificationOptions = [
  {
    key: 'notify_booking_reminder' as const,
    label: '課程預約提醒',
    description: '課程開始前 24 小時和 2 小時前提醒',
  },
  {
    key: 'notify_contract_expiry' as const,
    label: '合約到期通知',
    description: '合約到期前 7 天、3 天、1 天提醒',
  },
  {
    key: 'notify_class_cancelled' as const,
    label: '課程取消通知',
    description: '當您預約的課程被取消時通知',
  },
  {
    key: 'notify_promotions' as const,
    label: '優惠活動推廣',
    description: '接收最新優惠和活動資訊',
  },
]
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

    <!-- Success Message -->
    <Transition name="slide">
      <div v-if="successMessage" class="success-toast">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        {{ successMessage }}
      </div>
    </Transition>

    <!-- Not Supported Warning -->
    <div v-if="!isSupported" class="warning-card">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>您的瀏覽器不支援推播通知功能</p>
    </div>

    <!-- Permission Denied Warning -->
    <div v-else-if="isDenied" class="warning-card">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
      <div>
        <p class="warning-title">通知權限已被封鎖</p>
        <p class="warning-text">請在瀏覽器設定中允許此網站發送通知</p>
      </div>
    </div>

    <!-- Main Notification Toggle -->
    <section v-else class="section">
      <div class="toggle-card main-toggle">
        <div class="toggle-info">
          <div class="toggle-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div class="toggle-content">
            <h3 class="toggle-label">推播通知</h3>
            <p class="toggle-description">
              {{ isSubscribed ? '已開啟' : '未開啟' }}
            </p>
          </div>
        </div>

        <button
          v-if="canSubscribe"
          class="btn-subscribe"
          :disabled="isLoading"
          @click="handleSubscribe"
        >
          {{ isLoading ? '處理中...' : '開啟' }}
        </button>

        <button
          v-else-if="isSubscribed"
          class="btn-unsubscribe"
          :disabled="isLoading"
          @click="handleUnsubscribe"
        >
          {{ isLoading ? '處理中...' : '關閉' }}
        </button>
      </div>
    </section>

    <!-- Notification Preferences -->
    <section v-if="isSubscribed" class="section">
      <h2 class="section-title">通知類型</h2>
      <div class="preferences-list">
        <div
          v-for="option in notificationOptions"
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
            @click="togglePreference(option.key)"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
      </div>
    </section>

    <!-- Help Text -->
    <div class="help-text">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <p>通知可能會因裝置設定而有所不同。若未收到通知，請確認裝置的通知權限設定。</p>
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
  margin-bottom: 24px;
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

/* Success Toast */
.success-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background-color: var(--color-primary);
  color: white;
  border-radius: 12px;
  margin-bottom: 20px;
  font-weight: 500;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Warning Card */
.warning-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
  border-radius: 16px;
  margin-bottom: 24px;
}

.warning-card svg {
  flex-shrink: 0;
  color: var(--color-warning);
}

.warning-card p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.warning-title {
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.warning-text {
  font-size: 13px;
}

/* Section */
.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12px;
}

/* Main Toggle Card */
.toggle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
}

.main-toggle {
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 10%, var(--color-surface)), var(--color-surface));
}

.toggle-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toggle-icon {
  width: 48px;
  height: 48px;
  background-color: var(--color-primary);
  color: white;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-label {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.toggle-description {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.btn-subscribe,
.btn-unsubscribe {
  padding: 12px 24px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-subscribe {
  background-color: var(--color-primary);
  color: white;
}

.btn-subscribe:active:not(:disabled) {
  background-color: #059669;
}

.btn-unsubscribe {
  background-color: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}

.btn-unsubscribe:active:not(:disabled) {
  background-color: var(--color-border);
}

.btn-subscribe:disabled,
.btn-unsubscribe:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
</style>
