<script setup lang="ts">
import { readItem } from '@directus/sdk'
import { useDirectus } from '@gym-nexus/shared/composables'

definePageMeta({
  middleware: 'auth'
})

interface CheckinDetail {
  id: string
  check_time: string
  check_type: 'ENTRY' | 'EXIT'
  verification_method: string | null
  is_cross_branch: boolean
  notes: string | null
  date_created: string
  branch_id: {
    id: string
    name: string
    address: string | null
    phone: string | null
  } | null
  contract_id: {
    id: string
    contract_no: string
    contract_type: 'TIME_BASED' | 'COUNT_BASED'
    remaining_counts: number | null
    plan_id: {
      id: string
      name: string
    } | null
  } | null
  verified_by: {
    id: string
    full_name: string
  } | null
}

const route = useRoute()
const router = useRouter()
const directus = useDirectus()
const { member } = useMemberAuth()

const checkin = ref<CheckinDetail | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

const fetchCheckin = async () => {
  if (!member.value) return

  try {
    isLoading.value = true
    error.value = null

    const result = await directus.request(
      readItem('member_checkins', route.params.id as string, {
        fields: [
          'id', 'check_time', 'check_type', 'verification_method',
          'is_cross_branch', 'notes', 'date_created',
          'branch_id.id', 'branch_id.name', 'branch_id.address', 'branch_id.phone',
          'contract_id.id', 'contract_id.contract_no', 'contract_id.contract_type',
          'contract_id.remaining_counts', 'contract_id.plan_id.id', 'contract_id.plan_id.name',
          'verified_by.id', 'verified_by.full_name'
        ]
      })
    )

    // Verify this checkin belongs to the current member
    const fullResult = await directus.request(
      readItem('member_checkins', route.params.id as string, {
        fields: ['member_id']
      })
    ) as { member_id: string }

    if (fullResult.member_id !== member.value.id) {
      error.value = '無權查看此記錄'
      return
    }

    checkin.value = result as CheckinDetail
  } catch (err) {
    console.error('Failed to fetch checkin:', err)
    error.value = '無法載入入場記錄'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchCheckin()
})

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr)
  return {
    date: date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }),
    time: date.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }
}

const verificationLabels: Record<string, string> = {
  BARCODE: '條碼掃描',
  QR_CODE: 'QR Code 掃描',
  MANUAL: '人工驗證',
  FACE_ID: '人臉辨識',
  FINGERPRINT: '指紋辨識',
  BATCH: '批次簽到'
}

const verificationIcons: Record<string, string> = {
  BARCODE: 'barcode',
  QR_CODE: 'qr',
  MANUAL: 'user',
  FACE_ID: 'face',
  FINGERPRINT: 'fingerprint',
  BATCH: 'users'
}

const goBack = () => {
  router.push('/profile/checkins')
}
</script>

<template>
  <div class="checkin-detail-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h1 class="page-title">入場詳情</h1>
    </header>

    <div v-if="isLoading" class="loading">
      <p>載入中...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <p>{{ error }}</p>
      <button class="retry-btn" @click="goBack">返回列表</button>
    </div>

    <template v-else-if="checkin">
      <!-- Main Info Card -->
      <div class="main-card">
        <div class="type-badge" :class="checkin.check_type.toLowerCase()">
          <svg v-if="checkin.check_type === 'ENTRY'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>{{ checkin.check_type === 'ENTRY' ? '入場' : '離場' }}</span>
        </div>

        <div class="datetime-info">
          <div class="date">{{ formatDateTime(checkin.check_time).date }}</div>
          <div class="time">{{ formatDateTime(checkin.check_time).time }}</div>
        </div>

        <span v-if="checkin.is_cross_branch" class="cross-branch-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          跨店入場
        </span>
      </div>

      <!-- Branch Info -->
      <div class="info-section">
        <h3 class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          分店資訊
        </h3>
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">分店名稱</span>
            <span class="info-value">{{ checkin.branch_id?.name || '未知分店' }}</span>
          </div>
          <div v-if="checkin.branch_id?.address" class="info-row">
            <span class="info-label">地址</span>
            <span class="info-value">{{ checkin.branch_id.address }}</span>
          </div>
          <div v-if="checkin.branch_id?.phone" class="info-row">
            <span class="info-label">電話</span>
            <a :href="`tel:${checkin.branch_id.phone}`" class="info-value link">
              {{ checkin.branch_id.phone }}
            </a>
          </div>
        </div>
      </div>

      <!-- Verification Info -->
      <div class="info-section">
        <h3 class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          驗證資訊
        </h3>
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">驗證方式</span>
            <span class="info-value verification-badge">
              <svg v-if="verificationIcons[checkin.verification_method || ''] === 'qr'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="3" height="3" />
                <rect x="18" y="14" width="3" height="3" />
                <rect x="14" y="18" width="3" height="3" />
                <rect x="18" y="18" width="3" height="3" />
              </svg>
              <svg v-else-if="verificationIcons[checkin.verification_method || ''] === 'barcode'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 5v14" />
                <path d="M8 5v14" />
                <path d="M12 5v14" />
                <path d="M17 5v14" />
                <path d="M21 5v14" />
              </svg>
              <svg v-else-if="verificationIcons[checkin.verification_method || ''] === 'user'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {{ verificationLabels[checkin.verification_method || ''] || checkin.verification_method || '未知' }}
            </span>
          </div>
          <div v-if="checkin.verified_by" class="info-row">
            <span class="info-label">驗證人員</span>
            <span class="info-value">{{ checkin.verified_by.full_name }}</span>
          </div>
        </div>
      </div>

      <!-- Contract Info -->
      <div v-if="checkin.contract_id" class="info-section">
        <h3 class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          使用合約
        </h3>
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">合約編號</span>
            <span class="info-value">{{ checkin.contract_id.contract_no }}</span>
          </div>
          <div v-if="checkin.contract_id.plan_id" class="info-row">
            <span class="info-label">方案名稱</span>
            <span class="info-value">{{ checkin.contract_id.plan_id.name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">合約類型</span>
            <span class="info-value">
              {{ checkin.contract_id.contract_type === 'TIME_BASED' ? '期限制' : '計次制' }}
            </span>
          </div>
          <div v-if="checkin.contract_id.contract_type === 'COUNT_BASED'" class="info-row">
            <span class="info-label">剩餘次數</span>
            <span class="info-value highlight">
              {{ checkin.contract_id.remaining_counts ?? '-' }} 次
            </span>
          </div>
        </div>

        <NuxtLink :to="`/contracts`" class="view-contract-btn">
          查看合約詳情
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </NuxtLink>
      </div>

      <!-- Notes -->
      <div v-if="checkin.notes" class="info-section">
        <h3 class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </svg>
          備註
        </h3>
        <div class="notes-card">
          {{ checkin.notes }}
        </div>
      </div>

      <!-- Record Info -->
      <div class="record-info">
        <span>記錄建立於 {{ formatDateTime(checkin.date_created).date }} {{ formatDateTime(checkin.date_created).time }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.checkin-detail-page {
  padding: 16px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.loading {
  display: flex;
  justify-content: center;
  padding: 48px;
  color: var(--color-text-secondary);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 24px;
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  text-align: center;
}

.error-state svg {
  color: var(--color-error);
}

.error-state p {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.retry-btn {
  padding: 10px 20px;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

/* Main Card */
.main-card {
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
  text-align: center;
  position: relative;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.type-badge.exit {
  background-color: rgba(255, 255, 255, 0.15);
}

.datetime-info {
  color: white;
}

.datetime-info .date {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 4px;
  opacity: 0.9;
}

.datetime-info .time {
  font-size: 32px;
  font-weight: 700;
}

.cross-branch-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 6px 12px;
  background-color: rgba(251, 191, 36, 0.9);
  color: #78350f;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
}

/* Info Sections */
.info-section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
  padding-left: 4px;
}

.info-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  text-align: right;
}

.info-value.link {
  color: var(--color-primary);
  text-decoration: none;
}

.info-value.highlight {
  color: var(--color-primary);
  font-weight: 600;
}

.verification-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
  border-radius: 6px;
}

.view-contract-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px;
  margin-top: 12px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.2s ease;
}

.view-contract-btn:active {
  background-color: var(--color-border);
}

/* Notes */
.notes-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;
}

/* Record Info */
.record-info {
  text-align: center;
  padding: 16px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
