<script lang="ts">
const contractDateFormatter = new Intl.DateTimeFormat('zh-TW')
</script>

<script setup lang="ts">
import { CONTRACT_STATUS_LABELS, CONTRACT_PAYMENT_STATUS_LABELS } from '~/composables/useMemberContracts'

definePageMeta({
  middleware: 'auth'
})

const { handleError } = useApiError()
const { contracts, isLoading, fetchContracts } = useMemberContracts()

const loadContracts = async () => {
  try {
    await fetchContracts()
  } catch (error) {
    handleError(error, { fallbackMessage: '無法載入合約資料' })
  }
}

onMounted(() => {
  loadContracts()
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '-'
  return contractDateFormatter.format(d)
}

const statusLabels = CONTRACT_STATUS_LABELS
const paymentLabels = CONTRACT_PAYMENT_STATUS_LABELS
</script>

<template>
  <div class="contracts-page">
    <header class="page-header">
      <h1 class="page-title">我的合約</h1>
    </header>

    <div v-if="isLoading" class="loading">
      <p>載入中...</p>
    </div>

    <div v-else-if="contracts.length === 0" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p>目前沒有合約記錄</p>
    </div>

    <div v-else class="contract-list">
      <div
        v-for="contract in contracts"
        :key="contract.id"
        class="contract-card"
        :class="{
          active: contract.status === 'ACTIVE',
          paused: contract.status === 'PAUSED'
        }"
      >
        <div class="contract-header">
          <h3 class="contract-plan">{{ contract.planName || '方案' }}</h3>
          <span class="contract-status" :class="contract.status.toLowerCase()">
            {{ statusLabels[contract.status] || contract.status }}
          </span>
        </div>

        <div class="contract-details">
          <div class="detail-row">
            <span class="detail-label">合約編號</span>
            <span class="detail-value">{{ contract.contractNo }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">有效期間</span>
            <span class="detail-value">
              {{ formatDate(contract.startDate) }} ~ {{ formatDate(contract.endDate) }}
            </span>
          </div>
          <div v-if="contract.planType === 'COUNT_BASED'" class="detail-row">
            <span class="detail-label">剩餘次數</span>
            <span class="detail-value highlight">{{ contract.remainingCounts }} 次</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">付款狀態</span>
            <span class="detail-value" :class="'payment-' + contract.paymentStatus.toLowerCase()">
              {{ paymentLabels[contract.paymentStatus] || contract.paymentStatus }}
            </span>
          </div>
        </div>

        <p v-if="contract.status === 'ACTIVE' || contract.status === 'PAUSED'" class="contract-hint">
          如需暫停或恢復合約，請洽櫃檯協助。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contracts-page {
  padding: 24px 0;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

.page-header {
  padding: 0 16px;
  margin-bottom: 20px;
}

.page-title {
  font-size: 34px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.4px;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 48px 16px;
  color: var(--color-text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: 0 16px;
  padding: 64px 24px;
  background-color: var(--color-background);
  border-radius: 12px;
  text-align: center;
  box-shadow:
    0 0 0 0.5px var(--color-border),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.theme-dark .empty-state {
  background-color: var(--color-surface);
}

.empty-state svg {
  color: var(--color-text-secondary);
}

.empty-state p {
  color: var(--color-text-secondary);
  font-size: 15px;
}

.contract-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px;
}

.contract-card {
  background-color: var(--color-background);
  border-radius: 12px;
  padding: 16px;
  box-shadow:
    0 0 0 0.5px var(--color-border),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.theme-dark .contract-card {
  background-color: var(--color-surface);
}

.contract-card.active {
  box-shadow:
    0 0 0 2px var(--color-primary),
    0 2px 8px rgba(52, 199, 89, 0.15);
}

.contract-card.paused {
  box-shadow:
    0 0 0 2px #ff9500,
    0 2px 8px rgba(255, 149, 0, 0.15);
}

.contract-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.contract-plan {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}

.contract-status {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
}

.contract-status.active {
  background-color: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.contract-status.paused {
  background-color: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.contract-status.expired,
.contract-status.cancelled,
.contract-status.transferred {
  background-color: rgba(142, 142, 147, 0.12);
  color: #8e8e93;
}

.contract-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.detail-label {
  font-size: 15px;
  color: var(--color-text-secondary);
}

.detail-value {
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text);
}

.detail-value.highlight {
  color: var(--color-primary);
  font-weight: 600;
}

.payment-paid {
  color: var(--color-success);
}

.payment-partial {
  color: #f59e0b;
}

.payment-unpaid {
  color: var(--color-error);
}

.contract-hint {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
