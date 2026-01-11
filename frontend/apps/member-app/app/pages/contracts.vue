<script setup lang="ts">
import { readItems } from '@directus/sdk'
import type { Contract } from '@gym-nexus/shared/types'
import { useDirectus } from '@gym-nexus/shared/composables'

definePageMeta({
  middleware: 'auth'
})

const config = useRuntimeConfig()
const apiUrl = config.public.directusUrl

const directus = useDirectus()
const { member, accessToken } = useMemberAuth()

const contracts = ref<Array<Contract & { plan?: { name: string, plan_type: string } }>>([])
const isLoading = ref(true)

// Pause modal state
const showPauseModal = ref(false)
const selectedContract = ref<Contract | null>(null)
const pauseReason = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

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
  } catch {
    // Failed to fetch contracts
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

// Open pause modal
const openPauseModal = (contract: Contract) => {
  selectedContract.value = contract
  pauseReason.value = ''
  errorMessage.value = ''
  showPauseModal.value = true
}

// Close pause modal
const closePauseModal = () => {
  showPauseModal.value = false
  selectedContract.value = null
  pauseReason.value = ''
  errorMessage.value = ''
}

// Submit pause request
const submitPause = async () => {
  if (!selectedContract.value || !accessToken.value) return

  if (pauseReason.value.trim().length < 5) {
    errorMessage.value = '請輸入暫停原因（至少 5 個字）'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/gym/contracts/${selectedContract.value.id}/pause`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
      body: {
        reason: pauseReason.value.trim(),
      },
    })

    if (response.success) {
      successMessage.value = response.message
      closePauseModal()
      await fetchContracts()

      // Clear success message after 3 seconds
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    } else {
      errorMessage.value = response.message || '操作失敗'
    }
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'data' in error) {
      const fetchError = error as { data?: { message?: string } }
      errorMessage.value = fetchError.data?.message || '操作失敗，請稍後再試'
    } else {
      errorMessage.value = '操作失敗，請稍後再試'
    }
  } finally {
    isSubmitting.value = false
  }
}

// Resume contract
const resumeContract = async (contract: Contract) => {
  if (!accessToken.value) return

  if (!confirm('確定要恢復此合約嗎？暫停期間將自動順延合約到期日。')) {
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<{
      success: boolean
      message: string
      new_end_date?: string
      days_extended?: number
    }>(`${apiUrl}/gym/contracts/${contract.id}/resume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
    })

    if (response.success) {
      successMessage.value = response.message
      await fetchContracts()

      // Clear success message after 3 seconds
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    } else {
      errorMessage.value = response.message || '操作失敗'
    }
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'data' in error) {
      const fetchError = error as { data?: { message?: string } }
      errorMessage.value = fetchError.data?.message || '操作失敗，請稍後再試'
    } else {
      errorMessage.value = '操作失敗，請稍後再試'
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="contracts-page">
    <header class="page-header">
      <h1 class="page-title">我的合約</h1>
    </header>

    <!-- Success/Error Messages -->
    <div v-if="successMessage" class="message success">
      {{ successMessage }}
    </div>
    <div v-if="errorMessage && !showPauseModal" class="message error">
      {{ errorMessage }}
    </div>

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
          active: contract.contract_status === 'ACTIVE',
          paused: contract.contract_status === 'PAUSED'
        }"
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

        <div v-if="contract.contract_status === 'ACTIVE' || contract.contract_status === 'PAUSED'" class="contract-actions">
          <button
            v-if="contract.contract_status === 'ACTIVE'"
            class="action-btn pause"
            :disabled="isSubmitting"
            @click="openPauseModal(contract)"
          >
            申請暫停
          </button>
          <button
            v-else-if="contract.contract_status === 'PAUSED'"
            class="action-btn resume"
            :disabled="isSubmitting"
            @click="resumeContract(contract)"
          >
            恢復合約
          </button>
        </div>
      </div>
    </div>

    <!-- Pause Modal -->
    <Teleport to="body">
      <div v-if="showPauseModal" class="modal-overlay" @click.self="closePauseModal">
        <div class="modal">
          <div class="modal-header">
            <h3>申請暫停合約</h3>
            <button class="close-btn" @click="closePauseModal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <p class="modal-info">
              暫停期間合約將無法使用，恢復後到期日將自動順延。
            </p>

            <div class="form-group">
              <label for="pauseReason">暫停原因</label>
              <textarea
                id="pauseReason"
                v-model="pauseReason"
                placeholder="請輸入暫停原因（至少 5 個字）"
                rows="3"
              />
            </div>

            <div v-if="errorMessage" class="modal-error">
              {{ errorMessage }}
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="closePauseModal">取消</button>
            <button
              class="btn-confirm"
              :disabled="isSubmitting || pauseReason.trim().length < 5"
              @click="submitPause"
            >
              {{ isSubmitting ? '處理中...' : '確認暫停' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.contracts-page {
  padding: 24px 16px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
}

.message {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  margin-bottom: 16px;
}

.message.success {
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.message.error {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
  border: 1px solid rgba(239, 68, 68, 0.2);
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

.contract-card.paused {
  border-color: #f59e0b;
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
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn.pause {
  background-color: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.action-btn.pause:active {
  background-color: var(--color-border);
}

.action-btn.resume {
  background-color: var(--color-primary);
  border: none;
  color: white;
}

.action-btn.resume:active {
  opacity: 0.9;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
}

.modal {
  background-color: var(--color-surface);
  border-radius: 20px;
  width: 100%;
  max-width: 400px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 8px;
}

.close-btn:active {
  background-color: var(--color-border);
}

.modal-body {
  padding: 20px;
}

.modal-info {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 14px;
  color: var(--color-text);
  background-color: var(--color-background);
  resize: none;
  font-family: inherit;
}

.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-group textarea::placeholder {
  color: var(--color-text-secondary);
}

.modal-error {
  margin-top: 12px;
  padding: 10px 12px;
  background-color: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-error);
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid var(--color-border);
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel {
  background-color: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.btn-cancel:active {
  background-color: var(--color-border);
}

.btn-confirm {
  background-color: #f59e0b;
  border: none;
  color: white;
}

.btn-confirm:active {
  opacity: 0.9;
}

.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
