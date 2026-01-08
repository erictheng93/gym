<script setup lang="ts">
const {
  isSupported,
  isSubscribed,
  canSubscribe,
  isDenied,
  needsPermission,
  isLoading,
  subscribe,
} = usePushNotifications()

const showBanner = ref(true)
const dismissed = useCookie('push_banner_dismissed', {
  maxAge: 60 * 60 * 24 * 7, // 7 days
})

const handleSubscribe = async () => {
  const success = await subscribe()
  if (success) {
    showBanner.value = false
  }
}

const dismissBanner = () => {
  showBanner.value = false
  dismissed.value = 'true'
}

// Don't show if already dismissed, subscribed, denied, or not supported
const shouldShow = computed(() => {
  if (dismissed.value === 'true') return false
  if (!isSupported.value) return false
  if (isSubscribed.value) return false
  if (isDenied.value) return false
  return showBanner.value
})
</script>

<template>
  <Transition name="slide">
    <div v-if="shouldShow" class="push-banner">
      <div class="banner-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </div>

      <div class="banner-content">
        <h3 class="banner-title">開啟通知提醒</h3>
        <p class="banner-text">接收課程預約提醒、合約到期通知等重要訊息</p>
      </div>

      <div class="banner-actions">
        <button
          class="btn-subscribe"
          :disabled="isLoading"
          @click="handleSubscribe"
        >
          <span v-if="isLoading" class="spinner"></span>
          {{ isLoading ? '處理中...' : '開啟通知' }}
        </button>

        <button class="btn-dismiss" @click="dismissBanner">
          之後再說
        </button>
      </div>

      <button class="btn-close" aria-label="關閉" @click="dismissBanner">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.push-banner {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(135deg, var(--color-primary), #059669);
  border-radius: 16px;
  color: white;
  margin-bottom: 20px;
}

.banner-icon {
  width: 48px;
  height: 48px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.banner-content {
  flex: 1;
}

.banner-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.banner-text {
  font-size: 14px;
  opacity: 0.9;
  margin: 0;
  line-height: 1.4;
}

.banner-actions {
  display: flex;
  gap: 12px;
}

.btn-subscribe {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  background-color: white;
  color: var(--color-primary);
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-subscribe:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-subscribe:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-dismiss {
  padding: 14px 20px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-dismiss:active {
  background-color: rgba(255, 255, 255, 0.3);
}

.btn-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  background-color: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: background-color 0.2s ease;
}

.btn-close:active {
  background-color: rgba(255, 255, 255, 0.3);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* Desktop layout */
@media (min-width: 600px) {
  .push-banner {
    flex-direction: row;
    align-items: center;
  }

  .banner-actions {
    flex-direction: column;
    gap: 8px;
  }

  .btn-subscribe,
  .btn-dismiss {
    white-space: nowrap;
  }
}
</style>
