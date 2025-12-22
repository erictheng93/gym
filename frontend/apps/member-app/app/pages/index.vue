<script setup lang="ts">
import QRCode from 'qrcode'

definePageMeta({
  middleware: 'auth'
})

const { member } = useMemberAuth()

const qrCodeDataUrl = ref('')
const qrExpiry = ref<Date | null>(null)
const timeRemaining = ref(0)

// 生成入場 QR Code
const generateQRCode = async () => {
  if (!member.value) return

  // QR Code 有效期 30 秒
  const expiry = new Date(Date.now() + 30 * 1000)
  qrExpiry.value = expiry

  // QR Code 內容: member_code + timestamp + signature (簡化版)
  const payload = JSON.stringify({
    m: member.value.member_code,
    t: expiry.getTime(),
    c: member.value.activeContract?.id || null
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
  } catch (err) {
    console.error('Failed to generate QR code:', err)
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

// 初始化
onMounted(() => {
  generateQRCode()

  // 每秒更新倒數
  const timer = setInterval(updateCountdown, 1000)

  onUnmounted(() => {
    clearInterval(timer)
  })
})

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
  <div class="entry-page">
    <!-- Header -->
    <header class="header">
      <h1 class="greeting">{{ member?.full_name || '會員' }}，您好</h1>
      <p class="branch">{{ member?.branch_name || '健身房' }}</p>
    </header>

    <!-- Push Notification Banner -->
    <PushPermissionBanner />

    <!-- QR Code Card -->
    <div class="qr-card">
      <div class="qr-container">
        <img
          v-if="qrCodeDataUrl"
          :src="qrCodeDataUrl"
          alt="入場 QR Code"
          class="qr-image"
        />
        <div v-else class="qr-loading">
          載入中...
        </div>
      </div>

      <div class="qr-info">
        <p class="member-code">{{ member?.member_code }}</p>
        <p class="expiry-text">
          <span class="countdown" :class="{ warning: timeRemaining <= 10 }">
            {{ timeRemaining }}
          </span>
          秒後自動刷新
        </p>
      </div>

      <button class="refresh-btn" @click="generateQRCode">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        立即刷新
      </button>
    </div>

    <!-- Contract Status -->
    <div class="status-card">
      <div class="status-row">
        <span class="status-label">會籍狀態</span>
        <span
          class="status-value"
          :class="{
            'status-active': member?.member_status === 'ACTIVE',
            'status-expired': member?.member_status === 'EXPIRED'
          }"
        >
          {{ member?.member_status === 'ACTIVE' ? '有效' : '已到期' }}
        </span>
      </div>
      <div class="status-row">
        <span class="status-label">合約資訊</span>
        <span class="status-value">{{ contractStatusText }}</span>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <NuxtLink to="/bookings" class="action-card">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>預約課程</span>
      </NuxtLink>
      <NuxtLink to="/contracts" class="action-card">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span>我的合約</span>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.entry-page {
  padding: 24px 16px;
}

.header {
  margin-bottom: 24px;
}

.greeting {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}

.branch {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.qr-card {
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
  border-radius: 24px;
  padding: 32px 24px;
  text-align: center;
  margin-bottom: 20px;
}

.qr-container {
  background-color: white;
  border-radius: 16px;
  padding: 16px;
  display: inline-block;
  margin-bottom: 16px;
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
  color: var(--color-text-secondary);
}

.qr-info {
  margin-bottom: 16px;
}

.member-code {
  font-size: 18px;
  font-weight: 600;
  color: white;
  margin-bottom: 8px;
  letter-spacing: 2px;
}

.expiry-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.countdown {
  font-weight: 700;
  color: white;
}

.countdown.warning {
  color: #fbbf24;
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.refresh-btn:active {
  background-color: rgba(255, 255, 255, 0.3);
}

.status-card {
  background-color: var(--color-surface);
  border-radius: 16px;
  padding: 16px 20px;
  margin-bottom: 20px;
  border: 1px solid var(--color-border);
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.status-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.status-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.status-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.status-active {
  color: var(--color-success);
}

.status-expired {
  color: var(--color-error);
}

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  text-decoration: none;
  color: var(--color-text);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.action-card:active {
  transform: scale(0.98);
}

.action-card svg {
  color: var(--color-primary);
}

.action-card span {
  font-size: 14px;
  font-weight: 500;
}
</style>
