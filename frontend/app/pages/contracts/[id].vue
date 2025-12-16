<script setup lang="ts">
import { createItem } from '@directus/sdk'
import type { ContractLog } from '~/types/directus'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const directus = useDirectus()
const { getContract, updateContract } = useContracts()
const { fetchPayments, payments } = usePayments()

const contract = ref<Awaited<ReturnType<typeof getContract>> | null>(null)
const isLoading = ref(true)

const showPauseModal = ref(false)
const showResumeModal = ref(false)
const showTransferModal = ref(false)
const isProcessing = ref(false)

const pauseForm = reactive({
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  reason: ''
})

const transferForm = reactive({
  targetMemberId: '',
  reason: ''
})

const contractId = computed(() => route.params.id as string)

const loadContract = async () => {
  isLoading.value = true
  try {
    contract.value = await getContract(contractId.value)
    await fetchPayments({ contractId: contractId.value })
  } catch (error) {
    console.error('Failed to load contract:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(loadContract)

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const formatCurrency = (amount: number | null) => {
  return `NT$ ${(amount || 0).toLocaleString()}`
}

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    DRAFT: { label: '草稿', class: '' },
    ACTIVE: { label: '有效', class: 'badge-success' },
    PAUSED: { label: '暫停中', class: 'badge-warning' },
    EXPIRED: { label: '已過期', class: 'badge-error' },
    TERMINATED: { label: '已終止', class: 'badge-error' }
  }
  return map[status] || { label: status, class: '' }
}

const getPaymentStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    UNPAID: { label: '未付款', class: 'badge-error' },
    PARTIAL: { label: '部分付款', class: 'badge-warning' },
    PAID: { label: '已付清', class: 'badge-success' }
  }
  return map[status] || { label: status, class: '' }
}

const getPlanTypeLabel = (type: string) => {
  return type === 'TIME_BASED' ? '期限制' : '計次制'
}

const getLogTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    PAUSE: '暫停',
    EXTENSION: '延期',
    TRANSFER: '轉讓'
  }
  return map[type] || type
}

// 暫停合約
const handlePause = async () => {
  if (!contract.value || !pauseForm.startDate || !pauseForm.endDate) return

  isProcessing.value = true
  try {
    // 計算暫停天數
    const start = new Date(pauseForm.startDate)
    const end = new Date(pauseForm.endDate)
    const daysAffected = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

    // 建立異動紀錄
    await directus.request(createItem('contract_logs', {
      contract_id: contract.value.id,
      log_type: 'PAUSE',
      start_date: pauseForm.startDate,
      end_date: pauseForm.endDate,
      days_affected: daysAffected,
      reason: pauseForm.reason
    } as Partial<ContractLog>))

    // 計算新的結束日期
    const originalEnd = new Date(contract.value.end_date!)
    const newEndDate = new Date(originalEnd.getTime() + daysAffected * 24 * 60 * 60 * 1000)

    // 更新合約狀態
    await updateContract(contract.value.id, {
      contract_status: 'PAUSED',
      end_date: newEndDate.toISOString().split('T')[0]
    })

    showPauseModal.value = false
    await loadContract()
  } catch (error) {
    console.error('Failed to pause contract:', error)
  } finally {
    isProcessing.value = false
  }
}

// 恢復合約
const handleResume = async () => {
  if (!contract.value) return

  isProcessing.value = true
  try {
    await updateContract(contract.value.id, {
      contract_status: 'ACTIVE'
    })

    showResumeModal.value = false
    await loadContract()
  } catch (error) {
    console.error('Failed to resume contract:', error)
  } finally {
    isProcessing.value = false
  }
}

// 檢查是否可以暫停
const canPause = computed(() => {
  if (!contract.value) return false
  return contract.value.contract_status === 'ACTIVE' && contract.value.plan?.allow_pause
})

// 檢查是否可以恢復
const canResume = computed(() => {
  if (!contract.value) return false
  return contract.value.contract_status === 'PAUSED'
})

// 檢查是否可以轉讓
const canTransfer = computed(() => {
  if (!contract.value) return false
  return ['ACTIVE', 'PAUSED'].includes(contract.value.contract_status) && contract.value.plan?.allow_transfer
})
</script>

<template>
  <div class="contract-detail-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">載入中...</p>
    </div>

    <template v-else-if="contract">
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          返回
        </button>
        <div class="header-actions">
          <button v-if="canPause" class="btn btn-secondary" @click="showPauseModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>
            </svg>
            暫停合約
          </button>
          <button v-if="canResume" class="btn btn-primary" @click="showResumeModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
            恢復合約
          </button>
          <button v-if="canTransfer" class="btn btn-ghost" @click="showTransferModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/><path d="M16 21h5v-5"/><path d="M8 21H3v-5"/>
            </svg>
            轉讓合約
          </button>
        </div>
      </header>

      <!-- Contract Hero -->
      <section class="contract-hero glass-card">
        <div class="hero-header">
          <div class="contract-badge-large">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
              <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
            </svg>
          </div>
          <div class="hero-info">
            <div class="hero-title-row">
              <code class="contract-no-large">{{ contract.contract_no }}</code>
              <span :class="['badge badge-large', getStatusBadge(contract.contract_status).class]">
                {{ getStatusBadge(contract.contract_status).label }}
              </span>
            </div>
            <h2 class="plan-name-large">{{ contract.plan?.name || '—' }}</h2>
          </div>
        </div>

        <div class="hero-stats">
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatCurrency(contract.total_amount) }}</span>
            <span class="hero-stat-label">合約金額</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatDate(contract.start_date) }}</span>
            <span class="hero-stat-label">開始日期</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatDate(contract.end_date) }}</span>
            <span class="hero-stat-label">結束日期</span>
          </div>
          <div class="hero-stat">
            <span :class="['badge', getPaymentStatusBadge(contract.payment_status).class]">
              {{ getPaymentStatusBadge(contract.payment_status).label }}
            </span>
            <span class="hero-stat-label">付款狀態</span>
          </div>
        </div>
      </section>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Member Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            會員資訊
          </h3>
          <div class="member-info-card">
            <div class="member-avatar-large">{{ contract.member?.full_name?.[0] || '?' }}</div>
            <div class="member-details">
              <h4 class="member-name-large">{{ contract.member?.full_name }}</h4>
              <code class="member-code">{{ contract.member?.member_code }}</code>
              <div class="member-contact">
                <span v-if="contract.member?.phone">{{ contract.member.phone }}</span>
                <span v-if="contract.member?.email" class="text-tertiary">{{ contract.member.email }}</span>
              </div>
            </div>
            <NuxtLink :to="`/members/${contract.member?.id}`" class="view-member-btn btn btn-ghost btn-small">
              查看會員
            </NuxtLink>
          </div>
        </section>

        <!-- Plan Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
            </svg>
            方案資訊
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>方案類型</label>
              <span>{{ getPlanTypeLabel(contract.plan?.plan_type || '') }}</span>
            </div>
            <div class="info-item">
              <label>方案期限</label>
              <span>{{ contract.plan?.duration_months ? `${contract.plan.duration_months} 個月` : '—' }}</span>
            </div>
            <div class="info-item">
              <label>允許暫停</label>
              <span :class="contract.plan?.allow_pause ? 'text-success' : 'text-error'">
                {{ contract.plan?.allow_pause ? '是' : '否' }}
              </span>
            </div>
            <div class="info-item">
              <label>允許轉讓</label>
              <span :class="contract.plan?.allow_transfer ? 'text-success' : 'text-error'">
                {{ contract.plan?.allow_transfer ? '是' : '否' }}
              </span>
            </div>
            <div v-if="contract.plan?.plan_type === 'COUNT_BASED'" class="info-item">
              <label>剩餘次數</label>
              <span class="count-remaining">{{ contract.remaining_counts || 0 }} / {{ contract.plan?.class_counts || 0 }}</span>
            </div>
          </div>
        </section>

        <!-- Contract Details -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
            </svg>
            合約詳情
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>簽約日期</label>
              <span>{{ formatDate(contract.sign_date) }}</span>
            </div>
            <div class="info-item">
              <label>原始結束日</label>
              <span>{{ formatDate(contract.original_end_date) }}</span>
            </div>
            <div class="info-item">
              <label>所屬分店</label>
              <span>{{ contract.branch?.name || '—' }}</span>
            </div>
            <div class="info-item">
              <label>負責業務</label>
              <span>{{ contract.sales_person?.full_name || '—' }}</span>
            </div>
          </div>
          <div v-if="contract.notes" class="notes-section">
            <label>備註</label>
            <p>{{ contract.notes }}</p>
          </div>
        </section>

        <!-- Signature -->
        <section v-if="contract.digital_signature" class="detail-card card signature-card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            電子簽名
          </h3>
          <div class="signature-preview">
            <img :src="contract.digital_signature" alt="電子簽名" />
          </div>
        </section>
      </div>

      <!-- Contract Logs -->
      <section v-if="contract.logs && contract.logs.length > 0" class="logs-section">
        <h2 class="section-title">合約異動紀錄</h2>
        <div class="logs-timeline">
          <div v-for="log in contract.logs" :key="log.id" class="log-item card">
            <div class="log-type-badge" :class="`log-${log.log_type.toLowerCase()}`">
              {{ getLogTypeLabel(log.log_type) }}
            </div>
            <div class="log-content">
              <div class="log-dates">
                <span>{{ formatDate(log.start_date) }}</span>
                <span v-if="log.end_date"> → {{ formatDate(log.end_date) }}</span>
              </div>
              <p v-if="log.days_affected" class="log-days">影響天數：{{ log.days_affected }} 天</p>
              <p v-if="log.reason" class="log-reason text-secondary">{{ log.reason }}</p>
            </div>
            <div class="log-date text-caption text-tertiary">
              {{ formatDate(log.date_created) }}
            </div>
          </div>
        </div>
      </section>

      <!-- Payments -->
      <section class="payments-section">
        <div class="section-header">
          <h2 class="section-title">付款紀錄</h2>
          <NuxtLink :to="`/payments/new?contract=${contract.id}`" class="btn btn-primary btn-small">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/><path d="M12 5v14"/>
            </svg>
            新增收款
          </NuxtLink>
        </div>

        <div v-if="payments.length === 0" class="empty-payments card">
          <p class="text-secondary">尚無付款紀錄</p>
        </div>

        <div v-else class="payments-list">
          <div v-for="payment in payments" :key="payment.id" class="payment-item card">
            <div class="payment-type" :class="payment.payment_type === 'INCOME' ? 'payment-income' : 'payment-refund'">
              {{ payment.payment_type === 'INCOME' ? '收款' : '退款' }}
            </div>
            <div class="payment-info">
              <span class="payment-amount">{{ formatCurrency(payment.amount) }}</span>
              <span class="payment-method text-secondary">{{ payment.payment_method || '—' }}</span>
            </div>
            <div class="payment-date text-secondary">{{ formatDate(payment.payment_date) }}</div>
          </div>
        </div>
      </section>
    </template>

    <!-- Pause Modal -->
    <Teleport to="body">
      <div v-if="showPauseModal" class="modal-overlay" @click.self="showPauseModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-warning">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>
            </svg>
          </div>
          <h3 class="modal-title">暫停合約</h3>
          <p class="modal-desc text-secondary">暫停期間將自動延長合約結束日期</p>

          <div class="modal-form">
            <div class="input-group">
              <label class="input-label">暫停開始日</label>
              <input v-model="pauseForm.startDate" type="date" class="input" />
            </div>
            <div class="input-group">
              <label class="input-label">暫停結束日</label>
              <input v-model="pauseForm.endDate" type="date" class="input" />
            </div>
            <div class="input-group">
              <label class="input-label">原因</label>
              <textarea v-model="pauseForm.reason" class="input" rows="3" placeholder="請輸入暫停原因..."></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showPauseModal = false">取消</button>
            <button class="btn btn-warning" :disabled="isProcessing || !pauseForm.endDate" @click="handlePause">
              {{ isProcessing ? '處理中...' : '確定暫停' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Resume Modal -->
    <Teleport to="body">
      <div v-if="showResumeModal" class="modal-overlay" @click.self="showResumeModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-success">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
          </div>
          <h3 class="modal-title">恢復合約</h3>
          <p class="modal-desc text-secondary">確定要恢復此合約嗎？</p>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showResumeModal = false">取消</button>
            <button class="btn btn-primary" :disabled="isProcessing" @click="handleResume">
              {{ isProcessing ? '處理中...' : '確定恢復' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Transfer Modal -->
    <Teleport to="body">
      <div v-if="showTransferModal" class="modal-overlay" @click.self="showTransferModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-accent">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
            </svg>
          </div>
          <h3 class="modal-title">轉讓合約</h3>
          <p class="modal-desc text-secondary">此功能即將推出</p>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showTransferModal = false">關閉</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.contract-detail-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
}

.loading-spinner-large {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
  animation: fadeDown 0.5s var(--ease-out);
}

@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-10px); }
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.back-btn:hover {
  background: var(--color-accent-light);
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

/* Contract Hero */
.contract-hero {
  padding: var(--space-2xl);
  margin-bottom: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.hero-header {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-xl);
  border-bottom: 1px solid var(--color-divider);
}

.contract-badge-large {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hero-info {
  flex: 1;
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

.contract-no-large {
  font-family: var(--font-mono);
  font-size: 14px;
  padding: 4px 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.badge-large {
  font-size: 14px;
  padding: 6px 14px;
}

.plan-name-large {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-xl);
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.hero-stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.hero-stat-label {
  font-size: 13px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.detail-card {
  padding: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.detail-card:nth-child(1) { animation-delay: 0.15s; }
.detail-card:nth-child(2) { animation-delay: 0.2s; }
.detail-card:nth-child(3) { animation-delay: 0.25s; }
.detail-card:nth-child(4) { animation-delay: 0.3s; }

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-lg);
}

.card-title svg {
  color: var(--color-accent);
}

/* Member Info Card */
.member-info-card {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.member-avatar-large {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 600;
  flex-shrink: 0;
}

.member-details {
  flex: 1;
}

.member-name-large {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: var(--space-xs);
}

.member-code {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.member-contact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-sm);
  font-size: 14px;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.info-item label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.info-item span {
  font-size: 15px;
  color: var(--color-text-primary);
}

.text-success { color: var(--color-success); }
.text-error { color: var(--color-error); }

.count-remaining {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-accent);
}

/* Notes Section */
.notes-section {
  margin-top: var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

.notes-section label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: var(--space-sm);
}

.notes-section p {
  font-size: 15px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

/* Signature Preview */
.signature-card {
  grid-column: 1 / -1;
}

.signature-preview {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  text-align: center;
}

.signature-preview img {
  max-width: 100%;
  max-height: 200px;
}

/* Logs Section */
.logs-section {
  margin-bottom: var(--space-2xl);
  animation: fadeUp 0.6s var(--ease-out) 0.35s backwards;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: var(--space-lg);
}

.logs-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-lg);
  padding: var(--space-lg);
}

.log-type-badge {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
  flex-shrink: 0;
}

.log-pause {
  background: rgba(255, 159, 10, 0.15);
  color: var(--color-warning);
}

.log-extension {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.log-transfer {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.log-content {
  flex: 1;
}

.log-dates {
  font-weight: 500;
  margin-bottom: var(--space-xs);
}

.log-days {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.log-reason {
  font-size: 14px;
  margin-top: var(--space-sm);
}

/* Payments Section */
.payments-section {
  animation: fadeUp 0.6s var(--ease-out) 0.4s backwards;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.payments-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.payment-item {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
}

.payment-type {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
}

.payment-income {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.payment-refund {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.payment-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.payment-amount {
  font-weight: 600;
  font-family: var(--font-mono);
}

.payment-method {
  font-size: 13px;
}

.empty-payments {
  padding: var(--space-xl);
  text-align: center;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s var(--ease-out);
}

@keyframes fadeIn {
  from { opacity: 0; }
}

.modal-content {
  width: 100%;
  max-width: 440px;
  padding: var(--space-xl);
  margin: var(--space-lg);
  text-align: center;
  animation: modalIn 0.3s var(--ease-spring);
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95); }
}

.modal-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

.modal-icon-warning {
  background: rgba(255, 159, 10, 0.15);
  color: var(--color-warning);
}

.modal-icon-success {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.modal-icon-accent {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: var(--space-sm);
}

.modal-desc {
  font-size: 15px;
  margin-bottom: var(--space-xl);
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  text-align: left;
  margin-bottom: var(--space-xl);
}

.modal-form .input {
  width: 100%;
}

.modal-form textarea {
  resize: vertical;
  min-height: 80px;
}

.modal-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
}

.btn-warning {
  background: var(--color-warning);
  color: #000;
}

/* Responsive */
@media (max-width: 768px) {
  .hero-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .member-info-card {
    flex-direction: column;
    text-align: center;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .header-actions .btn {
    flex: 1;
  }
}
</style>
