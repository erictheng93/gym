<script setup lang="ts">
import QRCode from 'qrcode'

definePageMeta({
  middleware: 'auth'
})

const { member } = useMemberAuth()
const { getCache, setCache } = useOfflineSync()
const toast = useToast()
const sound = useSoundEffects()
const haptic = useHapticFeedback()

const qrCodeDataUrl = ref('')
const qrExpiry = ref<Date | null>(null)
const timeRemaining = ref(0)
const isQrOffline = ref(false)

// Pull-to-refresh
const isPulling = ref(false)
const pullDistance = ref(0)
const isRefreshing = ref(false)
const startTouchY = ref(0)
const PULL_THRESHOLD = 80

// QR data cache settings
const QR_DATA_CACHE_KEY = 'member:qr-data'
const QR_DATA_TTL = 24 * 60 * 60 * 1000 // 24 hours

interface QrCacheData {
  memberCode: string
  contractId: string | null
  memberStatus: string
}

// Cache QR-relevant data for offline use
const cacheQrData = async () => {
  if (!member.value) return
  const data: QrCacheData = {
    memberCode: member.value.member_code,
    contractId: member.value.activeContract?.id || null,
    memberStatus: member.value.member_status,
  }
  await setCache(QR_DATA_CACHE_KEY, data, QR_DATA_TTL)
}

// 生成入場 QR Code
const generateQRCode = async () => {
  isQrOffline.value = false

  let memberCode: string | undefined
  let contractId: string | null | undefined

  if (member.value) {
    memberCode = member.value.member_code
    contractId = member.value.activeContract?.id || null
    // Proactively cache for offline use
    await cacheQrData()
  } else {
    // Try offline cache
    const cached = await getCache<QrCacheData>(QR_DATA_CACHE_KEY)
    if (cached) {
      memberCode = cached.memberCode
      contractId = cached.contractId
      isQrOffline.value = true
    } else {
      toast.error('無法產生入場 QR Code，請連線後重試')
      return
    }
  }

  // QR Code 有效期 3 分鐘 (180 秒)
  const expiry = new Date(Date.now() + 180 * 1000)
  qrExpiry.value = expiry

  // QR Code 內容: member_code + timestamp + signature (簡化版)
  const payload = JSON.stringify({
    m: memberCode,
    t: expiry.getTime(),
    c: contractId
  })

  try {
    qrCodeDataUrl.value = await QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
  } catch (error) {
    console.error('QR Code generation failed:', error)
    toast.error('無法產生入場 QR Code')
  }
}

// 更新倒數計時
const updateCountdown = () => {
  if (!qrExpiry.value) {
    timeRemaining.value = 0
    return
  }

  const remaining = Math.max(0, qrExpiry.value.getTime() - Date.now())
  timeRemaining.value = Math.ceil(remaining / 1000)

  if (remaining <= 0) {
    // 自動重新生成
    generateQRCode()
  }
}

// Pull-to-refresh handlers
const handleTouchStart = (e: TouchEvent) => {
  const touch = e.touches[0]
  if (!touch) return

  if (window.scrollY === 0 && !isRefreshing.value) {
    isPulling.value = true
    startTouchY.value = touch.clientY
  }
}

const handleTouchMove = (e: TouchEvent) => {
  if (!isPulling.value || isRefreshing.value) return

  const touch = e.touches[0]
  if (!touch) return

  const delta = touch.clientY - startTouchY.value
  pullDistance.value = Math.max(0, Math.min(delta, 120))
}

const handleTouchEnd = async () => {
  if (!isPulling.value) return

  if (pullDistance.value >= PULL_THRESHOLD) {
    isRefreshing.value = true
    haptic.medium()
    await generateQRCode()
    sound.success()
    haptic.success()
    toast.success('已更新')
  }

  isPulling.value = false
  pullDistance.value = 0
  isRefreshing.value = false
}

const handleManualRefresh = async () => {
  sound.tap()
  haptic.light()
  await generateQRCode()
  sound.success()
  haptic.success()
}

// 初始化
onMounted(async () => {
  generateQRCode()

  // 每秒更新倒數
  const timer = setInterval(updateCountdown, 1000)

  onUnmounted(() => {
    clearInterval(timer)
  })
})

// 格式化時間顯示 (分:秒)
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  return `${secs}秒`
}

// 合約狀態文字
const contractStatusText = computed(() => {
  const contract = member.value?.activeContract
  if (!contract) return '無有效合約'

  const plan = (contract as { plan?: { name: string, plan_type: string } }).plan
  if (plan?.plan_type === 'COUNT_BASED') {
    return `${plan.name} - 剩餘 ${contract.remaining_counts} 次`
  }

  if (contract.end_date) {
    const endDate = new Date(contract.end_date)
    const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return `${plan?.name || '會籍'} - 剩餘 ${daysLeft} 天`
  }

  return plan?.name || '有效會籍'
})
</script>

<template>
  <div
    class="entry-page"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Pull-to-refresh indicator -->
    <div
      class="pull-indicator"
      :class="{ visible: isPulling || isRefreshing }"
      :style="{ transform: `translateY(${pullDistance - 40}px)` }"
    >
      <div class="pull-spinner" :class="{ spinning: isRefreshing }" />
    </div>

    <!-- Header -->
    <header class="header">
      <h1 class="greeting">{{ member?.full_name || '會員' }}，您好</h1>
      <p class="branch">{{ member?.branch_name || '健身房' }}</p>
    </header>

    <!-- Push Notification Banner -->
    <PushPermissionBanner />

    <!-- QR Code Card - iOS Style -->
    <section
      class="qr-section"
      aria-labelledby="qr-section-title"
      aria-describedby="qr-section-desc"
    >
      <h2 id="qr-section-title" class="sr-only">入場 QR Code</h2>
      <p id="qr-section-desc" class="sr-only">
        掃描此 QR Code 進入健身房，每 3 分鐘自動刷新，剩餘 {{ formatTime(timeRemaining) }}
      </p>

      <div class="qr-card">
        <!-- Pass Card Header -->
        <div class="pass-card-header">
          <div class="pass-brand">
            <span class="pass-brand-dot" />
            <span class="pass-brand-text">NEXUS PASS</span>
          </div>
          <div class="pass-status-pill">
            <span class="pass-beacon" />
            <span class="pass-status-text">ACTIVE</span>
          </div>
        </div>

        <div class="qr-container-wrap">
          <!-- Tactical HUD Reticle Brackets -->
          <span class="reticle-corner top-left" />
          <span class="reticle-corner top-right" />
          <span class="reticle-corner bottom-left" />
          <span class="reticle-corner bottom-right" />

          <div class="qr-container">
            <img
              v-if="qrCodeDataUrl"
              :src="qrCodeDataUrl"
              alt="入場 QR Code，會員編號 {{ member?.member_code }}"
              class="qr-image"
            />
            <div
              v-else
              class="qr-loading"
              role="status"
              aria-live="polite"
            >
              <div class="qr-loading-spinner" />
            </div>
          </div>
        </div>

        <p class="member-code tabular-nums" aria-label="會員編號">{{ member?.member_code }}</p>

        <p v-if="isQrOffline" class="offline-hint" role="status" aria-live="polite">
          離線模式 - 使用快取資料
        </p>

        <!-- Progress dots - Apple Watch style -->
        <div
          class="progress-dots"
          role="timer"
          :aria-label="`剩餘 ${timeRemaining} 秒`"
          aria-live="polite"
        >
          <span
            v-for="i in 10"
            :key="i"
            class="dot"
            :class="{ active: i <= Math.ceil(timeRemaining / 18) }"
          />
          <span class="time-hint tabular-nums">{{ formatTime(timeRemaining) }}</span>
        </div>

        <button
          class="refresh-btn"
          type="button"
          aria-label="立即刷新 QR Code"
          @click="handleManualRefresh"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          重新整理
        </button>
      </div>
    </section>

    <!-- Contract Status - Inset Grouped List -->
    <section class="list-section" aria-labelledby="status-section-title">
      <h3 id="status-section-title" class="list-section-header">會籍狀態</h3>

      <div class="list-inset-grouped">
        <NuxtLink to="/contracts" class="list-row">
          <span class="list-icon green">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span class="list-title">會員狀態</span>
          <span
            class="list-value"
            :class="{
              'value-success': member?.member_status === 'ACTIVE',
              'value-error': member?.member_status === 'EXPIRED'
            }"
          >
            {{ member?.member_status === 'ACTIVE' ? '有效會員' : '已到期' }}
          </span>
          <svg class="list-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M1 1l5.5 5.5L1 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </NuxtLink>
        <NuxtLink to="/contracts" class="list-row">
          <span class="list-icon blue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <span class="list-title">合約資訊</span>
          <span class="list-value">{{ contractStatusText }}</span>
          <svg class="list-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M1 1l5.5 5.5L1 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </NuxtLink>
      </div>
    </section>

    <!-- Quick Actions - Bento Grid Style -->
    <nav class="quick-actions-section" aria-label="快速操作">
      <h3 class="list-section-header">快速操作</h3>
      <div class="quick-actions-grid">
        <NuxtLink to="/bookings" class="bento-action-card">
          <div class="bento-action-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div class="bento-action-content">
            <span class="bento-action-title">預約課程</span>
            <span class="bento-action-sub">團課與教練預約</span>
          </div>
          <svg class="bento-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M1 1l5.5 5.5L1 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </NuxtLink>

        <NuxtLink to="/contracts" class="bento-action-card">
          <div class="bento-action-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div class="bento-action-content">
            <span class="bento-action-title">我的合約</span>
            <span class="bento-action-sub">會籍方案與期限</span>
          </div>
          <svg class="bento-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M1 1l5.5 5.5L1 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </NuxtLink>

        <NuxtLink to="/fitness" class="bento-action-card">
          <div class="bento-action-icon pink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div class="bento-action-content">
            <span class="bento-action-title">健身追蹤</span>
            <span class="bento-action-sub">運動紀錄與身體數據</span>
          </div>
          <svg class="bento-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M1 1l5.5 5.5L1 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<style scoped>
/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.entry-page {
  padding: 24px 0;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
  position: relative;
}

/* Pull-to-refresh */
.pull-indicator {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(-40px);
  z-index: 10;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.pull-indicator.visible {
  opacity: 1;
}

.pull-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
}

.pull-spinner.spinning {
  animation: pullSpin 0.8s linear infinite;
}

@keyframes pullSpin {
  to { transform: rotate(360deg); }
}

/* iOS Large Title Header */
.header {
  padding: 0 16px;
  margin-bottom: 24px;
}

.greeting {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.4px;
  margin-bottom: 4px;
}

.branch {
  font-size: 15px;
  color: var(--color-text-secondary);
}

/* QR Section - Apple Wallet Holographic Luxury Card */
.qr-section {
  padding: 0 16px;
  margin-bottom: 24px;
}

.qr-card {
  background: linear-gradient(160deg, rgba(32, 32, 36, 0.95), rgba(18, 18, 20, 0.98));
  border-radius: 24px;
  padding: 24px 20px 28px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.6),
              inset 0 1px 0 rgba(255, 255, 255, 0.25);
  position: relative;
  overflow: hidden;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
}

:root.theme-light .qr-card {
  background: linear-gradient(160deg, #ffffff, #f5f5f7);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.pass-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 4px;
}

.pass-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pass-brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary, #0071e3);
  box-shadow: 0 0 10px var(--color-primary, #0071e3);
}

.pass-brand-text {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--color-text-secondary, #8e8e93);
}

.pass-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(52, 199, 89, 0.12);
  border: 1px solid rgba(52, 199, 89, 0.25);
}

.pass-beacon {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34c759;
  box-shadow: 0 0 8px #34c759;
  animation: beaconPulse 2s infinite ease-in-out;
}

@keyframes beaconPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.3); }
}

.pass-status-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #34c759;
}

.qr-container-wrap {
  position: relative;
  display: inline-flex;
  padding: 8px;
  margin-bottom: 16px;
}

.reticle-corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 113, 227, 0.6);
  pointer-events: none;
  transition: all 0.3s ease;
}

.reticle-corner.top-left {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
  border-top-left-radius: 6px;
}

.reticle-corner.top-right {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
  border-top-right-radius: 6px;
}

.reticle-corner.bottom-left {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
  border-bottom-left-radius: 6px;
}

.reticle-corner.bottom-right {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
  border-bottom-right-radius: 6px;
}

.qr-card:hover .reticle-corner {
  border-color: #34c759;
  box-shadow: 0 0 8px rgba(52, 199, 89, 0.4);
}

.qr-container {
  display: inline-flex;
  padding: 16px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 0 0 0.5px rgba(0, 0, 0, 0.08);
}

.qr-image {
  display: block;
  width: 200px;
  height: 200px;
}

.qr-loading {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.member-code {
  font-family: 'SF Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #ffffff);
  letter-spacing: 2px;
  margin-bottom: 16px;
}

.offline-hint {
  font-size: 12px;
  font-weight: 500;
  color: #ff9500;
  background: rgba(255, 149, 0, 0.1);
  padding: 4px 12px;
  border-radius: 12px;
  display: inline-block;
  margin-bottom: 12px;
}

/* Progress dots - Apple Watch style */
.progress-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 20px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  transition: background 0.2s ease, transform 0.2s ease;
}

:root.theme-light .dot {
  background: rgba(0, 0, 0, 0.12);
}

.dot.active {
  background: var(--color-primary, #0071e3);
  box-shadow: 0 0 6px var(--color-primary, #0071e3);
  transform: scale(1.2);
}

.time-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-left: 8px;
  min-width: 32px;
  font-weight: 600;
}

/* Refresh button */
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, #0071e3);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  -webkit-tap-highlight-color: transparent;
}

:root.theme-light .refresh-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

.refresh-btn:hover {
  background: rgba(0, 113, 227, 0.15);
  transform: translateY(-1px);
}

.refresh-btn:active {
  transform: scale(0.96);
}

/* Inset Grouped List Styles */
.list-section {
  margin-bottom: 24px;
}

.list-section-header {
  padding: 8px 36px 8px 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.list-inset-grouped {
  margin: 0 16px;
  background: var(--color-surface, #1c1c1e);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.list-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  min-height: 48px;
  gap: 12px;
  text-decoration: none;
  color: var(--color-text);
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.list-row:hover {
  background: var(--color-surface-secondary, rgba(255, 255, 255, 0.04));
}

.list-row:active {
  background: rgba(255, 255, 255, 0.08);
}

.list-row:not(:last-child) {
  border-bottom: 0.5px solid var(--color-divider, rgba(255, 255, 255, 0.06));
}

.list-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.list-icon svg {
  color: white;
}

.list-icon.blue { background: linear-gradient(135deg, #007aff, #0051a8); }
.list-icon.green { background: linear-gradient(135deg, #34c759, #248a3d); }
.list-icon.orange { background: linear-gradient(135deg, #ff9500, #c97500); }
.list-icon.purple { background: linear-gradient(135deg, #af52de, #7e3b9f); }
.list-icon.pink { background: linear-gradient(135deg, #ff2d55, #bd1f3d); }

.list-title {
  flex: 1;
  font-size: 16px;
  font-weight: 500;
}

.list-value {
  font-size: 15px;
  color: var(--color-text-secondary);
}

.value-success {
  color: var(--color-success, #34c759);
  font-weight: 600;
}

.value-error {
  color: var(--color-error, #ff3b30);
  font-weight: 600;
}

.list-chevron {
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

/* Quick Actions Bento Grid */
.quick-actions-section {
  margin-bottom: 28px;
  padding: 0 16px;
}

.quick-actions-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bento-action-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--color-surface, #1c1c1e);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  text-decoration: none;
  color: var(--color-text, #ffffff);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  -webkit-tap-highlight-color: transparent;
}

.bento-action-card:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 113, 227, 0.35);
  box-shadow: 0 8px 24px rgba(0, 113, 227, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.bento-action-card:active {
  transform: scale(0.98);
}

.bento-action-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.bento-action-icon.orange {
  background: linear-gradient(135deg, #ff9500, #ff5e3a);
  color: white;
}

.bento-action-icon.purple {
  background: linear-gradient(135deg, #af52de, #5856d6);
  color: white;
}

.bento-action-icon.pink {
  background: linear-gradient(135deg, #ff2d55, #ff375f);
  color: white;
}

.bento-action-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bento-action-title {
  font-size: 15px;
  font-weight: 600;
}

.bento-action-sub {
  font-size: 12px;
  color: var(--color-text-secondary, #8e8e93);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bento-chevron {
  color: rgba(255, 255, 255, 0.3);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.bento-action-card:hover .bento-chevron {
  transform: translateX(3px);
  color: rgba(255, 255, 255, 0.7);
}
</style>
