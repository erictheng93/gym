<script setup lang="ts">
import { readItems } from '@directus/sdk'
import type { Contract } from '@gym-nexus/shared/types'
import { useDirectus } from '@gym-nexus/shared/composables'

definePageMeta({
  middleware: 'auth'
})

const directus = useDirectus()
const { member } = useMemberAuth()

const contracts = ref<Array<Contract & { plan?: { name: string, plan_type: string } }>>([])
const isLoading = ref(true)

const fetchContracts = async () => {
  if (!member.value) return

  try {
    isLoading.value = true
    const result = await directus.request(
      readItems('contracts', {
        filter: {
          member_id: { _eq: member.value.id }
        },
        fields: [
          'id', 'contract_no', 'contract_status', 'start_date', 'end_date',
          'remaining_counts', 'total_amount', 'payment_status',
          'plan.name', 'plan.plan_type'
        ],
        sort: ['-start_date']
      })
    )
    contracts.value = result as typeof contracts.value
  } catch (error) {
    console.error('Failed to fetch contracts:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchContracts()
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '有效',
  PAUSED: '暫停中',
  EXPIRED: '已到期',
  TERMINATED: '已終止'
}

const paymentLabels: Record<string, string> = {
  UNPAID: '未付款',
  PARTIAL: '部分付款',
  PAID: '已付清'
}
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
        :class="{ active: contract.contract_status === 'ACTIVE' }"
      >
        <div class="contract-header">
          <h3 class="contract-plan">{{ contract.plan?.name || '方案' }}</h3>
          <span class="contract-status" :class="contract.contract_status.toLowerCase()">
            {{ statusLabels[contract.contract_status] || contract.contract_status }}
          </span>
        </div>

        <div class="contract-details">
          <div class="detail-row">
            <span class="detail-label">合約編號</span>
            <span class="detail-value">{{ contract.contract_no }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">有效期間</span>
            <span class="detail-value">
              {{ formatDate(contract.start_date) }} ~ {{ formatDate(contract.end_date) }}
            </span>
          </div>
          <div v-if="contract.plan?.plan_type === 'COUNT_BASED'" class="detail-row">
            <span class="detail-label">剩餘次數</span>
            <span class="detail-value highlight">{{ contract.remaining_counts }} 次</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">付款狀態</span>
            <span class="detail-value" :class="'payment-' + contract.payment_status.toLowerCase()">
              {{ paymentLabels[contract.payment_status] || contract.payment_status }}
            </span>
          </div>
        </div>

        <div v-if="contract.contract_status === 'ACTIVE'" class="contract-actions">
          <button class="action-btn">申請暫停</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contracts-page {
  padding: 24px 16px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
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

.contract-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contract-card {
  background-color: var(--color-surface);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid var(--color-border);
}

.contract-card.active {
  border-color: var(--color-primary);
  border-width: 2px;
}

.contract-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.contract-plan {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.contract-status {
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 20px;
}

.contract-status.active {
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.contract-status.paused {
  background-color: rgba(251, 191, 36, 0.1);
  color: #f59e0b;
}

.contract-status.expired,
.contract-status.terminated {
  background-color: rgba(107, 114, 128, 0.1);
  color: var(--color-text-secondary);
}

.contract-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.detail-value {
  font-size: 14px;
  font-weight: 500;
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

.contract-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.action-btn {
  width: 100%;
  padding: 12px;
  background-color: transparent;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.action-btn:active {
  background-color: var(--color-border);
}
</style>
