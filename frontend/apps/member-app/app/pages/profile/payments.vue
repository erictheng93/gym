<script lang="ts">
const paymentDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

const currencyFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})
</script>

<script setup lang="ts">
import type { MemberPayment, PaymentType } from '~/composables/usePayments'
import { PAYMENT_METHOD_LABELS, getPaymentStatusDisplay } from '~/composables/usePayments'

definePageMeta({
  middleware: 'auth'
})

const { handleError } = useApiError()
const { payments, summary, isLoading, hasMore, fetchPayments, loadMore } = usePayments()

const loadFirstPage = async () => {
  try {
    await fetchPayments()
  } catch (error) {
    handleError(error, { fallbackMessage: '無法載入付款紀錄' })
  }
}

const loadNextPage = async () => {
  try {
    await loadMore()
  } catch (error) {
    handleError(error, { fallbackMessage: '無法載入付款紀錄' })
  }
}

onMounted(() => {
  loadFirstPage()
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '-'
  return paymentDateFormatter.format(d)
}

const formatAmount = (amount: number, type: PaymentType) => {
  const formatted = currencyFormatter.format(amount)
  return type === 'REFUND' ? `-${formatted}` : formatted
}

const methodLabels = PAYMENT_METHOD_LABELS

// Group payments by month
const groupedPayments = computed(() => {
  const groups: Record<string, MemberPayment[]> = {}

  for (const payment of payments.value) {
    const date = payment.paymentDate ? new Date(payment.paymentDate) : new Date()
    const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`

    const group = groups[monthKey]
    if (group) {
      group.push(payment)
    } else {
      groups[monthKey] = [payment]
    }
  }

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
            {{ formatAmount(summary.totalPaid, 'INCOME') }}
          </span>
        </div>
        <div v-if="summary.totalRefunded > 0" class="summary-row">
          <span class="summary-label">退款金額</span>
          <span class="summary-value refund">
            {{ formatAmount(summary.totalRefunded, 'REFUND') }}
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
              <div class="payment-icon" :class="payment.type.toLowerCase()">
                <svg v-if="payment.type === 'INCOME'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                  {{ payment.planName || '其他款項' }}
                </div>
                <div class="payment-details">
                  <span class="payment-date">{{ formatDate(payment.paymentDate) }}</span>
                  <span v-if="payment.paymentMethod" class="payment-method">
                    {{ methodLabels[payment.paymentMethod] || payment.paymentMethod }}
                  </span>
                </div>
              </div>

              <div class="payment-side">
                <div
                  class="payment-amount"
                  :class="[payment.type.toLowerCase(), { inactive: payment.status !== 'COMPLETED' }]"
                >
                  {{ formatAmount(payment.amount, payment.type) }}
                </div>
                <span
                  class="status-badge"
                  :class="getPaymentStatusDisplay(payment.status, payment.type).tone"
                  data-testid="payment-status"
                >
                  {{ getPaymentStatusDisplay(payment.status, payment.type).label }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          v-if="hasMore"
          class="load-more-btn"
          :disabled="isLoading"
          @click="loadNextPage"
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

.payment-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.payment-amount {
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}

.payment-amount.inactive {
  color: var(--color-text-tertiary);
  text-decoration: line-through;
}

.status-badge {
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.status-badge.success {
  color: var(--color-success);
  background-color: color-mix(in srgb, var(--color-success) 14%, transparent);
}

.status-badge.warning {
  color: var(--color-warning);
  background-color: color-mix(in srgb, var(--color-warning) 14%, transparent);
}

.status-badge.error {
  color: var(--color-error);
  background-color: color-mix(in srgb, var(--color-error) 14%, transparent);
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
