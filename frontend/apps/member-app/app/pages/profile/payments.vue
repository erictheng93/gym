<script setup lang="ts">
import { useFetch } from '~/composables/core/useFetch'

definePageMeta({
  middleware: 'auth'
})

const { handleError } = useApiError()

interface Payment {
  id: string
  amount: number
  payment_method: 'CASH' | 'CREDIT_CARD' | 'LINE_PAY' | 'TRANSFER' | null
  payment_date: string | null
  payment_type: 'INCOME' | 'REFUND'
  notes: string | null
  contract_id: {
    id: string
    contract_no: string
    plan_id: {
      name: string
    } | null
  } | null
}

const { readItems } = useFetch()
const { member } = useMemberAuth()

const payments = ref<Payment[]>([])
const isLoading = ref(true)
const currentPage = ref(1)
const hasMore = ref(true)
const pageSize = 20

const fetchPayments = async (loadMore = false) => {
  if (!member.value) return

  try {
    if (!loadMore) {
      isLoading.value = true
      currentPage.value = 1
    }

    const result = await readItems<Payment>('member/payments', {
      filter: {
        member_id: member.value.id
      },
      page: currentPage.value,
      limit: pageSize,
      sort: 'payment_date',
      sortOrder: 'desc'
    })

    if (loadMore) {
      payments.value = [...payments.value, ...result.data]
    } else {
      payments.value = result.data
    }

    hasMore.value = result.data.length === pageSize
  } catch (error) {
    handleError(error, { fallbackMessage: '無法載入付款紀錄' })
  } finally {
    isLoading.value = false
  }
}

const loadMore = async () => {
  currentPage.value++
  await fetchPayments(true)
}

onMounted(() => {
  fetchPayments()
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const formatAmount = (amount: number, type: 'INCOME' | 'REFUND') => {
  const formatted = new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)

  return type === 'REFUND' ? `-${formatted}` : formatted
}

const methodLabels: Record<string, string> = {
  CASH: '現金',
  CREDIT_CARD: '信用卡',
  LINE_PAY: 'LINE Pay',
  TRANSFER: '轉帳'
}

// Calculate totals
const totals = computed(() => {
  let income = 0
  let refund = 0

  payments.value.forEach(p => {
    if (p.payment_type === 'INCOME') {
      income += p.amount
    } else {
      refund += p.amount
    }
  })

  return {
    income,
    refund,
    net: income - refund
  }
})

// Group payments by month
const groupedPayments = computed(() => {
  const groups: Record<string, Payment[]> = {}

  payments.value.forEach(payment => {
    const date = payment.payment_date ? new Date(payment.payment_date) : new Date()
    const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`

    if (!groups[monthKey]) {
      groups[monthKey] = []
    }
    groups[monthKey].push(payment)
  })

  return Object.entries(groups).map(([month, items]) => ({
    month,
    items
  }))
})
</script>

<template>
  <div class="payments-page">
    <header class="page-header">
      <NuxtLink to="/profile" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">付款紀錄</h1>
    </header>

    <div v-if="isLoading && payments.length === 0" class="loading">
      <p>載入中...</p>
    </div>

    <div v-else-if="payments.length === 0" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
      <p>目前沒有付款紀錄</p>
    </div>

    <template v-else>
      <!-- Summary Card -->
      <div class="summary-card">
        <div class="summary-row">
          <span class="summary-label">累計支付</span>
          <span class="summary-value income">
            {{ formatAmount(totals.income, 'INCOME') }}
          </span>
        </div>
        <div v-if="totals.refund > 0" class="summary-row">
          <span class="summary-label">退款金額</span>
          <span class="summary-value refund">
            {{ formatAmount(totals.refund, 'REFUND') }}
          </span>
        </div>
      </div>

      <!-- Payment List -->
      <div class="payment-list">
        <div v-for="group in groupedPayments" :key="group.month" class="month-group">
          <h3 class="month-header">{{ group.month }}</h3>

          <div class="payment-items">
            <div
              v-for="payment in group.items"
              :key="payment.id"
              class="payment-card"
            >
              <div class="payment-icon" :class="payment.payment_type.toLowerCase()">
                <svg v-if="payment.payment_type === 'INCOME'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
                <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </div>

              <div class="payment-info">
                <div class="payment-plan">
                  {{ payment.contract_id?.plan_id?.name || '其他款項' }}
                </div>
                <div class="payment-details">
                  <span class="payment-date">{{ formatDate(payment.payment_date) }}</span>
                  <span v-if="payment.payment_method" class="payment-method">
                    {{ methodLabels[payment.payment_method] || payment.payment_method }}
                  </span>
                </div>
                <div v-if="payment.notes" class="payment-notes">
                  {{ payment.notes }}
                </div>
              </div>

              <div class="payment-amount" :class="payment.payment_type.toLowerCase()">
                {{ formatAmount(payment.amount, payment.payment_type) }}
              </div>
            </div>
          </div>
        </div>

        <button
          v-if="hasMore"
          class="load-more-btn"
          :disabled="isLoading"
          @click="loadMore"
        >
          {{ isLoading ? '載入中...' : '載入更多' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.payments-page {
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
  text-decoration: none;
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

.empty-state {
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

.empty-state svg {
  color: var(--color-text-secondary);
}

.empty-state p {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.summary-card {
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-row:not(:last-child) {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.summary-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
  color: white;
}

.summary-value.refund {
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
}

.payment-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.month-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.month-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding-left: 4px;
}

.payment-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.payment-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.payment-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.payment-icon.income {
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.payment-icon.refund {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
}

.payment-info {
  flex: 1;
  min-width: 0;
}

.payment-plan {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.payment-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.payment-method::before {
  content: '·';
  margin-right: 8px;
}

.payment-notes {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 6px;
  padding: 6px 10px;
  background-color: var(--color-border);
  border-radius: 6px;
}

.payment-amount {
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}

.payment-amount.income {
  color: var(--color-primary);
}

.payment-amount.refund {
  color: var(--color-error);
}

.load-more-btn {
  width: 100%;
  padding: 14px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.load-more-btn:not(:disabled):active {
  background-color: var(--color-border);
}
</style>
