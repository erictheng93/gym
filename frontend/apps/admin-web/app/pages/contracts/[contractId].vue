<script lang="ts">
import { STATUS, LABELS } from '~/constants'

const contractDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const contractCurrencyFormatter = new Intl.NumberFormat('zh-TW')

const CONTRACT_STATUS_BADGE_MAP: Record<string, { label: string; class: string }> = {
  DRAFT: { label: STATUS.CONTRACT.DRAFT, class: '' },
  ACTIVE: { label: STATUS.CONTRACT.ACTIVE, class: 'badge-success' },
  PAUSED: { label: STATUS.CONTRACT.PAUSED, class: 'badge-warning' },
  EXPIRED: { label: STATUS.CONTRACT.EXPIRED, class: 'badge-error' },
  CANCELLED: { label: STATUS.CONTRACT.CANCELLED, class: 'badge-error' },
  TRANSFERRED: { label: STATUS.CONTRACT.TRANSFERRED, class: '' }
}

const PAYMENT_STATUS_BADGE_MAP: Record<string, { label: string; class: string }> = {
  UNPAID: { label: STATUS.PAYMENT.UNPAID, class: 'badge-error' },
  PARTIAL: { label: STATUS.PAYMENT.PARTIAL, class: 'badge-warning' },
  PAID: { label: STATUS.PAYMENT.PAID, class: 'badge-success' }
}

/** A payment row's status → label + design-system status color */
const PAYMENT_RECORD_BADGE_MAP: Record<string, { label: string; class: string }> = {
  PENDING: { label: STATUS.PAYMENT_RECORD.PENDING, class: 'badge-warning' },
  COMPLETED: { label: STATUS.PAYMENT_RECORD.COMPLETED, class: 'badge-success' },
  FAILED: { label: STATUS.PAYMENT_RECORD.FAILED, class: 'badge-error' }
}

const PAYMENT_METHOD_LABEL_MAP: Record<string, string> = LABELS.PAYMENT_METHOD

const LOG_TYPE_LABEL_MAP: Record<string, string> = {
  PAUSE: LABELS.LOG_TYPE.PAUSE,
  RESUME: LABELS.LOG_TYPE.RESUME,
  EXTEND: LABELS.LOG_TYPE.EXTENSION,
  EXTENSION: LABELS.LOG_TYPE.EXTENSION,
  TRANSFER: LABELS.LOG_TYPE.TRANSFER,
  CANCEL: LABELS.LOG_TYPE.CANCEL,
  RENEWAL: LABELS.LOG_TYPE.RENEWAL,
  CLASS_USED: LABELS.LOG_TYPE.CLASS_USED
}
</script>

<script setup lang="ts">
import type { PaymentMethod } from '~/types/schema'
import type { ContractDetail } from '~/composables/useContracts'
import type { ApiMember } from '~/composables/useMembers'
import { MESSAGES, PAGES } from '~/constants'
import { validateUUIDParam } from '~/utils/validation'

definePageMeta({
  middleware: 'auth',
  validate: validateUUIDParam('contractId')
})

const route = useRoute()
const router = useRouter()
const {
  getContract,
  activateContract,
  pauseContract,
  resumeContract,
  extendContract,
  cancelContract,
  transferContract,
  renewContract,
  signContract
} = useContracts()
const { confirm } = useConfirm()
const { user } = useAuth()
const { searchMembers } = useMembers()
const { fetchPayments, payments } = usePayments()

const contract = ref<ContractDetail | null>(null)
const isLoading = ref(true)

const showPauseModal = ref(false)
const showResumeModal = ref(false)
const showTerminateModal = ref(false)
const showExtendModal = ref(false)
const showTransferModal = ref(false)
const showSignModal = ref(false)
const isProcessing = ref(false)

const pauseForm = reactive({
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  reason: ''
})

const terminateForm = reactive({
  reason: '',
  refundAmount: 0,
  refundMethod: 'CASH' as PaymentMethod
})

const extendForm = reactive({
  days: 0,
  reason: ''
})

const transferForm = reactive({
  search: '',
  member: null as ApiMember | null,
  fee: 0,
  feeMethod: 'CASH' as PaymentMethod,
  reason: ''
})
const transferResults = ref<ApiMember[]>([])
const hasSearchedRecipient = ref(false)

const signatureImage = ref('')

const contractId = computed(() => route.params.contractId as string)

const loadContract = async () => {
  isLoading.value = true
  try {
    // getContract / fetchPayments show their own error toasts
    const [contractData] = await Promise.all([
      getContract(contractId.value, true),
      fetchPayments({ contractId: contractId.value }, true)
    ])
    contract.value = contractData
  } finally {
    isLoading.value = false
  }
}

onMounted(loadContract)

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—'
  return contractDateFormatter.format(new Date(dateStr))
}

const formatCurrency = (amount: number | null) => {
  return `NT$ ${contractCurrencyFormatter.format(amount || 0)}`
}

const getStatusBadge = (status: string) => {
  return CONTRACT_STATUS_BADGE_MAP[status] || { label: status, class: '' }
}

const getPaymentRecordBadge = (status: string) => {
  return PAYMENT_RECORD_BADGE_MAP[status] || { label: status, class: '' }
}

const getPaymentMethodLabel = (method: string | null) => (method ? PAYMENT_METHOD_LABEL_MAP[method] || method : '—')

const getPaymentStatusBadge = (status: string) => {
  return PAYMENT_STATUS_BADGE_MAP[status] || { label: status, class: '' }
}

const getPlanTypeLabel = (type: string) => {
  return type === 'TIME_BASED' ? LABELS.CONTRACT_TYPE.TIME_BASED : LABELS.CONTRACT_TYPE.COUNT_BASED
}

const getLogTypeLabel = (type: string) => {
  return LOG_TYPE_LABEL_MAP[type] || type
}

/** Runs one contract action; on failure the composable has already shown the backend's reason */
const runAction = async (action: () => Promise<unknown>, successMessage: string, onSuccess?: () => void) => {
  isProcessing.value = true
  try {
    if (await action()) {
      onSuccess?.()
      useToast().success(successMessage)
      await loadContract()
    }
  } finally {
    isProcessing.value = false
  }
}

// 暫停合約（日期驗證、天數計算與延長到期日都由後端處理）
const isPauseRangeValid = computed(() =>
  !!pauseForm.startDate && !!pauseForm.endDate && pauseForm.endDate > pauseForm.startDate
)

const handlePause = async () => {
  if (!contract.value || !isPauseRangeValid.value) return
  const id = contract.value.id
  await runAction(
    () => pauseContract(id, {
      startDate: pauseForm.startDate,
      endDate: pauseForm.endDate,
      reason: pauseForm.reason || undefined
    }),
    MESSAGES.SUCCESS.CONTRACT_PAUSED,
    () => { showPauseModal.value = false }
  )
}

// 恢復合約（POST /contracts/:id/resume，後端同一 transaction 寫入異動紀錄）
const handleResume = async () => {
  if (!contract.value) return
  const id = contract.value.id
  await runAction(() => resumeContract(id), MESSAGES.SUCCESS.CONTRACT_RESUMED, () => {
    showResumeModal.value = false
  })
}

// 啟用草稿合約（金流只付部分金額時不會自動啟用，由櫃台確認後手動啟用；須先完成會員簽名）
const handleActivate = async () => {
  if (!contract.value || !isSigned.value) return

  const confirmed = await confirm({
    title: PAGES.CONTRACTS.ACTIVATE_CONTRACT,
    message: '請確認款項已收妥。啟用後會員即可報到使用。',
    confirmText: PAGES.CONTRACTS.ACTIVATE_CONTRACT,
    type: 'info',
    confirmVariant: 'primary'
  })
  if (!confirmed) return

  const id = contract.value.id
  await runAction(() => activateContract(id), MESSAGES.SUCCESS.CONTRACT_ACTIVATED)
}

const status = computed(() => contract.value?.status)

// 檢查是否可以啟用（後端要求已簽名）
const canActivate = computed(() => status.value === 'DRAFT')
const isSigned = computed(() => !!contract.value?.digitalSignature)

// 簽名：草稿可重簽；有效/暫停中的合約只能補簽一次（例如轉讓取得的合約），不可覆蓋
const canSign = computed(() =>
  status.value === 'DRAFT' || ((status.value === 'ACTIVE' || status.value === 'PAUSED') && !isSigned.value)
)

// 與後端一致：轉讓限店長以上
const isManager = computed(() => ['super_admin', 'admin', 'manager'].includes(user.value?.role ?? ''))

// 檢查是否可以暫停
const canPause = computed(() => status.value === 'ACTIVE' && !!contract.value?.plan?.allowPause)

// 檢查是否可以恢復
const canResume = computed(() => status.value === 'PAUSED')

// 轉讓：限有效合約、方案允許轉讓、店長以上（docs/product-decisions.md #2）
const canTransfer = computed(() =>
  status.value === 'ACTIVE' && !!contract.value?.plan?.allowTransfer && isManager.value
)

// 檢查是否可以終止（POST /contracts/:id/cancel 接受 DRAFT / ACTIVE / PAUSED）
const canTerminate = computed(() => status.value === 'DRAFT' || status.value === 'ACTIVE' || status.value === 'PAUSED')

// 檢查是否可以延期
const canExtend = computed(() => status.value === 'ACTIVE' || status.value === 'PAUSED')

// 續約：有效或已到期的合約（docs/product-decisions.md #3）
const canRenew = computed(() => status.value === 'ACTIVE' || status.value === 'EXPIRED')

// 預覽延期後的結束日（實際日期以後端計算為準；用 UTC 避免時區位移）
const extendedEndDate = computed(() => {
  if (!contract.value?.endDate || !extendForm.days || extendForm.days <= 0) return ''
  const end = new Date(`${contract.value.endDate}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + extendForm.days)
  return end.toISOString().slice(0, 10)
})

const isExtendValid = computed(() => Number.isInteger(extendForm.days) && extendForm.days > 0)

// 終止合約：狀態、異動紀錄與退款由後端在同一個 transaction 完成，任何一步失敗都不會留下部分結果。
// 可退金額上限以後端計算為準（已收 − 已退）；前端先擋超過已收金額的輸入。
const isRefundValid = computed(() =>
  terminateForm.refundAmount >= 0 && terminateForm.refundAmount <= (contract.value?.paidAmount ?? 0)
)

const handleTerminate = async () => {
  if (!contract.value || !isRefundValid.value) return
  const id = contract.value.id
  await runAction(
    () => cancelContract(id, {
      reason: terminateForm.reason.trim() || undefined,
      refund: terminateForm.refundAmount > 0
        ? { amount: terminateForm.refundAmount, paymentMethod: terminateForm.refundMethod }
        : null
    }),
    MESSAGES.SUCCESS.CONTRACT_TERMINATED,
    () => {
      showTerminateModal.value = false
      terminateForm.reason = ''
      terminateForm.refundAmount = 0
      terminateForm.refundMethod = 'CASH'
    }
  )
}

// 延期合約（POST /contracts/:id/extend）
const handleExtend = async () => {
  if (!contract.value || !isExtendValid.value) return
  const id = contract.value.id
  await runAction(
    () => extendContract(id, { days: extendForm.days, reason: extendForm.reason.trim() || undefined }),
    MESSAGES.SUCCESS.CONTRACT_EXTENDED,
    () => {
      showExtendModal.value = false
      extendForm.days = 0
      extendForm.reason = ''
    }
  )
}

// 轉讓：搜尋受讓會員（排除原會員），選填手續費
const searchRecipients = async () => {
  const query = transferForm.search.trim()
  if (!query) return
  const rows = await searchMembers(query, 8)
  transferResults.value = rows.filter(m => m.id !== contract.value?.memberId)
  hasSearchedRecipient.value = true
}

const isTransferFeeValid = computed(() => transferForm.fee >= 0)

const openTransferModal = () => {
  transferForm.search = ''
  transferForm.member = null
  transferForm.fee = 0
  transferForm.feeMethod = 'CASH'
  transferForm.reason = ''
  transferResults.value = []
  hasSearchedRecipient.value = false
  showTransferModal.value = true
}

const handleTransfer = async () => {
  if (!contract.value || !transferForm.member || !isTransferFeeValid.value) return
  const id = contract.value.id
  isProcessing.value = true
  try {
    const result = await transferContract(id, {
      toMemberId: transferForm.member.id,
      ...(transferForm.fee > 0 ? { fee: transferForm.fee, paymentMethod: transferForm.feeMethod } : {}),
      reason: transferForm.reason.trim() || undefined
    })
    if (result) {
      showTransferModal.value = false
      useToast().success(MESSAGES.SUCCESS.CONTRACT_TRANSFERRED)
      router.push(`/contracts/${result.contract.id}`)
    }
  } finally {
    isProcessing.value = false
  }
}

// 續約：預覽起始日（以後端為準）＝舊合約到期日隔天；已到期則為今天
const renewStartDate = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  const end = contract.value?.endDate
  if (!end || status.value === 'EXPIRED' || end < today) return today
  const next = new Date(`${end}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
})

const handleRenew = async () => {
  if (!contract.value) return
  const confirmed = await confirm({
    title: PAGES.CONTRACTS.RENEW_CONTRACT,
    message: `${PAGES.CONTRACTS.RENEW_CONFIRM_MESSAGE}${PAGES.CONTRACTS.RENEW_START_DATE}：${formatDate(renewStartDate.value)}，${PAGES.CONTRACTS.RENEW_AMOUNT}：${formatCurrency(contract.value.plan?.price ?? 0)}`,
    confirmText: PAGES.CONTRACTS.CONFIRM_RENEW,
    type: 'info',
    confirmVariant: 'primary'
  })
  if (!confirmed) return

  const id = contract.value.id
  isProcessing.value = true
  try {
    const renewed = await renewContract(id)
    if (renewed) {
      useToast().success(MESSAGES.SUCCESS.CONTRACT_RENEWED)
      // 前往新草稿：套用優惠券、簽名後啟用
      router.push(`/contracts/${renewed.id}`)
    }
  } finally {
    isProcessing.value = false
  }
}

// 會員簽名（POST /contracts/:id/signature）
const openSignModal = () => {
  signatureImage.value = ''
  showSignModal.value = true
}

const handleSaveSignature = async () => {
  if (!contract.value || !signatureImage.value) return
  const id = contract.value.id
  const image = signatureImage.value
  await runAction(() => signContract(id, image), MESSAGES.SUCCESS.CONTRACT_SIGNED, () => {
    showSignModal.value = false
  })
}

// 打開延期 Modal
const openExtendModal = () => {
  extendForm.days = 0
  extendForm.reason = ''
  showExtendModal.value = true
}

// 打開終止 Modal
const openTerminateModal = () => {
  terminateForm.reason = ''
  terminateForm.refundAmount = 0
  terminateForm.refundMethod = 'CASH'
  showTerminateModal.value = true
}
</script>

<template>
  <div class="contract-detail-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <template v-else-if="contract">
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {{ MESSAGES.ACTIONS.BACK }}
        </button>
        <div class="header-actions">
          <button
            v-if="canActivate"
            class="btn btn-primary"
            :disabled="isProcessing || !isSigned"
            :title="isSigned ? undefined : PAGES.CONTRACTS.SIGN_REQUIRED_TO_ACTIVATE"
            @click="handleActivate"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
            </svg>
            {{ PAGES.CONTRACTS.ACTIVATE_CONTRACT }}
          </button>
          <button v-if="canPause" class="btn btn-secondary" @click="showPauseModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" />
            </svg>
            {{ PAGES.CONTRACTS.PAUSE_CONTRACT }}
          </button>
          <button v-if="canResume" class="btn btn-primary" @click="showResumeModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            {{ PAGES.CONTRACTS.RESUME_CONTRACT }}
          </button>
          <button v-if="canExtend" class="btn btn-ghost" @click="openExtendModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M16 16h2" /><path d="M16 12h2" />
            </svg>
            {{ PAGES.CONTRACTS.EXTEND_CONTRACT }}
          </button>
          <button v-if="canTransfer" class="btn btn-ghost" :disabled="isProcessing" @click="openTransferModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /><path d="M16 21h5v-5" /><path d="M8 21H3v-5" />
            </svg>
            {{ PAGES.CONTRACTS.TRANSFER_CONTRACT }}
          </button>
          <button v-if="canRenew" class="btn btn-ghost" :disabled="isProcessing" @click="handleRenew">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
            </svg>
            {{ PAGES.CONTRACTS.RENEW_CONTRACT }}
          </button>
          <button v-if="canTerminate" class="btn btn-danger" @click="openTerminateModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
            </svg>
            {{ PAGES.CONTRACTS.TERMINATE_CONTRACT }}
          </button>
        </div>
      </header>

      <!-- Contract Hero -->
      <section class="contract-hero glass-card">
        <div class="hero-header">
          <div class="contract-badge-large">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
          </div>
          <div class="hero-info">
            <div class="hero-title-row">
              <code class="contract-no-large">{{ contract.contractNo }}</code>
              <span :class="['badge badge-large', getStatusBadge(contract.status).class]">
                {{ getStatusBadge(contract.status).label }}
              </span>
            </div>
            <h2 class="plan-name-large">{{ contract.plan?.name || '—' }}</h2>
          </div>
        </div>

        <div class="hero-stats">
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatCurrency(contract.totalAmount) }}</span>
            <span class="hero-stat-label">{{ PAGES.CONTRACTS.CONTRACT_AMOUNT }}</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatDate(contract.startDate) }}</span>
            <span class="hero-stat-label">{{ PAGES.CONTRACTS.START_DATE }}</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatDate(contract.endDate) }}</span>
            <span class="hero-stat-label">{{ PAGES.CONTRACTS.END_DATE }}</span>
          </div>
          <div class="hero-stat">
            <span :class="['badge', getPaymentStatusBadge(contract.paymentStatus).class]">
              {{ getPaymentStatusBadge(contract.paymentStatus).label }}
            </span>
            <span class="hero-stat-label">{{ PAGES.CONTRACTS.PAYMENT_STATUS }}</span>
          </div>
        </div>
      </section>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Member Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            {{ PAGES.CONTRACTS.MEMBER_INFO }}
          </h3>
          <div class="member-info-card">
            <div class="member-avatar-large">{{ contract.member?.fullName?.[0] || '?' }}</div>
            <div class="member-details">
              <h4 class="member-name-large">{{ contract.member?.fullName }}</h4>
              <code class="member-code">{{ contract.member?.memberCode }}</code>
              <div class="member-contact">
                <span v-if="contract.member?.phone">{{ contract.member.phone }}</span>
                <span v-if="contract.member?.email" class="text-tertiary">{{ contract.member.email }}</span>
              </div>
            </div>
            <NuxtLink :to="`/members/${contract.member?.id}`" class="view-member-btn btn btn-ghost btn-small">
              {{ PAGES.CONTRACTS.VIEW_MEMBER }}
            </NuxtLink>
          </div>
        </section>

        <!-- Plan Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" />
            </svg>
            {{ PAGES.CONTRACTS.PLAN_INFO }}
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.PLAN_TYPE }}</label>
              <span>{{ getPlanTypeLabel(contract.plan?.planType || '') }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.PLAN_DURATION }}</label>
              <span>{{ contract.plan?.durationMonths ? `${contract.plan.durationMonths} ${PAGES.CONTRACTS.MONTHS}` : '—' }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.ALLOW_PAUSE }}</label>
              <span :class="contract.plan?.allowPause ? 'text-success' : 'text-error'">
                {{ contract.plan?.allowPause ? LABELS.YES : LABELS.NO }}
              </span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.ALLOW_TRANSFER }}</label>
              <span :class="contract.plan?.allowTransfer ? 'text-success' : 'text-error'">
                {{ contract.plan?.allowTransfer ? LABELS.YES : LABELS.NO }}
              </span>
            </div>
            <div v-if="contract.plan?.planType === 'COUNT_BASED'" class="info-item">
              <label>{{ PAGES.CONTRACTS.REMAINING_COUNTS }}</label>
              <span class="count-remaining">{{ contract.remainingCounts || 0 }} / {{ contract.plan?.classCounts || 0 }}</span>
            </div>
          </div>
        </section>

        <!-- Contract Details -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
            </svg>
            {{ PAGES.CONTRACTS.CONTRACT_DETAILS }}
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.SIGN_DATE }}</label>
              <span>{{ formatDate(contract.signDate) }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.ORIGINAL_END_DATE }}</label>
              <span>{{ formatDate(contract.originalEndDate) }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.BRANCH }}</label>
              <span>{{ contract.branch?.name || '—' }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.SALES_PERSON }}</label>
              <span>{{ contract.salesPerson?.fullName || '—' }}</span>
            </div>
          </div>
          <div v-if="contract.notes" class="notes-section">
            <label>{{ MESSAGES.FORM.NOTES }}</label>
            <p>{{ contract.notes }}</p>
          </div>
        </section>

        <!-- Signature -->
        <section v-if="isSigned || canSign" class="detail-card card signature-card" data-testid="signature-card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            {{ PAGES.CONTRACTS.E_SIGNATURE }}
          </h3>
          <div v-if="contract.signatureUrl" class="signature-preview">
            <img :src="contract.signatureUrl" :alt="PAGES.CONTRACTS.E_SIGNATURE" />
          </div>
          <p v-else-if="isSigned" class="signature-status text-success">{{ PAGES.CONTRACTS.SIGNED }}</p>
          <p v-else class="signature-status text-secondary">
            {{ PAGES.CONTRACTS.NOT_SIGNED }}<template v-if="canActivate">：{{ PAGES.CONTRACTS.SIGN_REQUIRED_TO_ACTIVATE }}</template>
          </p>
          <button v-if="canSign" class="btn btn-secondary btn-small signature-action" @click="openSignModal">
            {{ isSigned ? PAGES.CONTRACTS.RESIGN_CONTRACT : PAGES.CONTRACTS.SIGN_CONTRACT }}
          </button>
        </section>
      </div>

      <!-- Contract Logs -->
      <section v-if="contract.logs && contract.logs.length > 0" class="logs-section">
        <h2 class="section-title">{{ PAGES.CONTRACTS.CHANGE_LOG }}</h2>
        <div class="logs-timeline">
          <div v-for="log in contract.logs" :key="log.id" class="log-item card">
            <div class="log-type-badge" :class="`log-${log.logType.toLowerCase()}`">
              {{ getLogTypeLabel(log.logType) }}
            </div>
            <div class="log-content">
              <div class="log-dates">
                <span>{{ formatDate(log.startDate) }}</span>
                <span v-if="log.endDate && log.endDate !== log.startDate"> → {{ formatDate(log.endDate) }}</span>
              </div>
              <p v-if="log.daysAffected" class="log-days">{{ PAGES.CONTRACTS.DAYS_AFFECTED }}：{{ log.daysAffected }} {{ PAGES.CONTRACTS.DAYS_UNIT }}</p>
              <p v-if="log.reason" class="log-reason text-secondary">{{ log.reason }}</p>
              <!-- 經辦資訊 -->
              <div v-if="log.createdByName" class="log-meta">
                <span class="log-operator">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  {{ log.createdByName }}
                </span>
              </div>
            </div>
            <div class="log-date text-caption text-tertiary">
              {{ formatDate(log.dateCreated) }}
            </div>
          </div>
        </div>
      </section>

      <!-- Payments -->
      <section class="payments-section">
        <div class="section-header">
          <h2 class="section-title">{{ PAGES.CONTRACTS.PAYMENT_RECORDS }}</h2>
          <!-- the payment form loads contracts per member, so it needs both ids -->
          <NuxtLink
            :to="{ path: '/payments/new', query: { contract: contractId, member: contract.member?.id } }"
            class="btn btn-primary btn-small"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            {{ PAGES.CONTRACTS.ADD_PAYMENT }}
          </NuxtLink>
        </div>

        <div v-if="payments.length === 0" class="empty-payments card">
          <p class="text-secondary">{{ PAGES.CONTRACTS.NO_PAYMENTS }}</p>
        </div>

        <div v-else class="payments-list">
          <div
            v-for="payment in payments"
            :key="payment.id"
            class="payment-item card"
            :class="{ 'payment-not-received': payment.status !== 'COMPLETED' }"
          >
            <div class="payment-type" :class="payment.type === 'INCOME' ? 'payment-income' : 'payment-refund'">
              {{ payment.type === 'INCOME' ? LABELS.PAYMENT_TYPE.INCOME : LABELS.PAYMENT_TYPE.REFUND }}
            </div>
            <div class="payment-info">
              <span class="payment-amount">{{ formatCurrency(payment.amount) }}</span>
              <span class="payment-method text-secondary">{{ getPaymentMethodLabel(payment.paymentMethod) }}</span>
            </div>
            <span :class="['badge', getPaymentRecordBadge(payment.status).class]" data-testid="payment-record-status">
              {{ getPaymentRecordBadge(payment.status).label }}
            </span>
            <div class="payment-date text-secondary">{{ formatDate(payment.paymentDate) }}</div>
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
              <rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" />
            </svg>
          </div>
          <h3 class="modal-title">{{ PAGES.CONTRACTS.PAUSE_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.PAUSE_HINT }}</p>

          <div class="modal-form">
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.PAUSE_START }}</label>
              <input v-model="pauseForm.startDate" type="date" class="input" />
            </div>
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.PAUSE_END }}</label>
              <input v-model="pauseForm.endDate" type="date" class="input" :min="pauseForm.startDate" />
            </div>
            <div class="input-group">
              <label class="input-label">{{ MESSAGES.FORM.REASON }}</label>
              <textarea v-model="pauseForm.reason" class="input" rows="3" :placeholder="PAGES.CONTRACTS.PAUSE_REASON_PLACEHOLDER"></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showPauseModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button class="btn btn-warning" :disabled="isProcessing || !isPauseRangeValid" @click="handlePause">
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_PAUSE }}
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
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </div>
          <h3 class="modal-title">{{ PAGES.CONTRACTS.RESUME_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.CONFIRM_RESUME_QUESTION }}</p>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showResumeModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button class="btn btn-primary" :disabled="isProcessing" @click="handleResume">
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_RESUME }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Transfer Modal -->
    <Teleport to="body">
      <div v-if="showTransferModal" class="modal-overlay" @click.self="showTransferModal = false">
        <div class="modal-content glass-card">
          <h3 class="modal-title">{{ PAGES.CONTRACTS.TRANSFER_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.TRANSFER_HINT }}</p>

          <div class="modal-form">
            <div v-if="transferForm.member" class="transfer-selected" data-testid="transfer-selected">
              <div>
                <span class="input-label">{{ PAGES.CONTRACTS.TRANSFER_SELECTED }}</span>
                <p class="transfer-member-name">{{ transferForm.member.fullName }}
                  <code class="member-code">{{ transferForm.member.memberCode }}</code>
                </p>
              </div>
              <button class="btn btn-ghost btn-small" @click="transferForm.member = null">{{ PAGES.CONTRACTS.TRANSFER_CHANGE_MEMBER }}</button>
            </div>
            <div v-else class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.SEARCH_TARGET_MEMBER }}</label>
              <div class="transfer-search">
                <input
                  v-model="transferForm.search"
                  type="search"
                  class="input"
                  data-testid="transfer-search"
                  :placeholder="PAGES.CONTRACTS.SEARCH_MEMBER_PLACEHOLDER"
                  @keydown.enter.prevent="searchRecipients"
                />
                <button class="btn btn-secondary" :disabled="!transferForm.search.trim()" @click="searchRecipients">{{ MESSAGES.FORM.SEARCH }}</button>
              </div>
              <ul v-if="transferResults.length" class="transfer-results">
                <li v-for="m in transferResults" :key="m.id">
                  <button class="transfer-result" data-testid="transfer-result" @click="transferForm.member = m">
                    <span>{{ m.fullName }}</span>
                    <span class="text-tertiary">{{ m.memberCode }} · {{ m.phone || PAGES.CONTRACTS.NO_PHONE }}</span>
                  </button>
                </li>
              </ul>
              <p v-else-if="hasSearchedRecipient" class="text-secondary">{{ PAGES.CONTRACTS.NO_MEMBER_FOUND }}</p>
            </div>

            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.TRANSFER_FEE }}</label>
              <input v-model.number="transferForm.fee" type="number" min="0" class="input" data-testid="transfer-fee" />
              <span class="input-hint text-tertiary">{{ PAGES.CONTRACTS.TRANSFER_FEE_HINT }}</span>
            </div>
            <div v-if="transferForm.fee > 0" class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.TRANSFER_FEE_METHOD }}</label>
              <select v-model="transferForm.feeMethod" class="input" data-testid="transfer-fee-method">
                <option v-for="(label, method) in LABELS.PAYMENT_METHOD" :key="method" :value="method">{{ label }}</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.TRANSFER_REASON }}</label>
              <textarea v-model="transferForm.reason" class="input" rows="2" :placeholder="PAGES.CONTRACTS.TRANSFER_REASON_PLACEHOLDER"></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showTransferModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button
              class="btn btn-primary"
              data-testid="confirm-transfer"
              :disabled="isProcessing || !transferForm.member || !isTransferFeeValid"
              @click="handleTransfer"
            >
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_TRANSFER }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Signature Modal -->
    <Teleport to="body">
      <div v-if="showSignModal" class="modal-overlay" @click.self="showSignModal = false">
        <div class="modal-content glass-card modal-wide">
          <h3 class="modal-title">{{ PAGES.CONTRACTS.SIGN_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.SIGN_INSTRUCTION }}</p>
          <LazySignaturePad v-model="signatureImage" />
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showSignModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button
              class="btn btn-primary"
              data-testid="save-signature"
              :disabled="isProcessing || !signatureImage"
              @click="handleSaveSignature"
            >
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.SAVE_SIGNATURE }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Terminate Modal -->
    <Teleport to="body">
      <div v-if="showTerminateModal" class="modal-overlay" @click.self="showTerminateModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-error">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
            </svg>
          </div>
          <h3 class="modal-title">{{ PAGES.CONTRACTS.TERMINATE_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.TERMINATE_HINT }}</p>

          <div class="modal-form">
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.TERMINATE_REASON }}</label>
              <textarea
                v-model="terminateForm.reason"
                class="input"
                rows="3"
                :placeholder="PAGES.CONTRACTS.TERMINATE_REASON_PLACEHOLDER"
              ></textarea>
            </div>
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.REFUND_AMOUNT }}</label>
              <div class="amount-input">
                <span class="currency">NT$</span>
                <input
                  v-model.number="terminateForm.refundAmount"
                  type="number"
                  class="input"
                  min="0"
                  :max="contract?.paidAmount || 0"
                />
              </div>
              <span v-if="isRefundValid" class="input-hint text-tertiary">
                {{ PAGES.CONTRACTS.NO_REFUND }}：0 · {{ PAGES.CONTRACTS.REFUND_MAX }} {{ formatCurrency(contract?.paidAmount ?? 0) }}
              </span>
              <span v-else class="input-hint text-error" data-testid="refund-error">
                {{ PAGES.CONTRACTS.REFUND_EXCEEDS_PAID }} {{ formatCurrency(contract?.paidAmount ?? 0) }}
              </span>
            </div>
            <div v-if="terminateForm.refundAmount > 0" class="input-group">
              <label class="input-label">{{ PAGES.PAYMENTS.PAYMENT_METHOD }}</label>
              <select v-model="terminateForm.refundMethod" class="input">
                <option value="CASH">{{ LABELS.PAYMENT_METHOD.CASH }}</option>
                <option value="CREDIT_CARD">{{ LABELS.PAYMENT_METHOD.CREDIT_CARD }}</option>
                <option value="LINE_PAY">{{ LABELS.PAYMENT_METHOD.LINE_PAY }}</option>
                <option value="BANK_TRANSFER">{{ LABELS.PAYMENT_METHOD.BANK_TRANSFER }}</option>
              </select>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showTerminateModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button class="btn btn-danger" :disabled="isProcessing || !isRefundValid" @click="handleTerminate">
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_TERMINATE }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Extend Modal -->
    <Teleport to="body">
      <div v-if="showExtendModal" class="modal-overlay" @click.self="showExtendModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-accent">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M16 16h2" /><path d="M16 12h2" />
            </svg>
          </div>
          <h3 class="modal-title">{{ PAGES.CONTRACTS.EXTEND_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.EXTEND_HINT }}</p>

          <div class="modal-form">
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.EXTEND_DAYS }}</label>
              <input
                v-model.number="extendForm.days"
                type="number"
                class="input"
                min="1"
                :placeholder="PAGES.CONTRACTS.EXTEND_DAYS_PLACEHOLDER"
              />
            </div>
            <div v-if="extendedEndDate" class="extend-preview">
              <div class="preview-row">
                <span class="preview-label">{{ PAGES.CONTRACTS.ORIGINAL_END_DATE }}</span>
                <span class="preview-value">{{ formatDate(contract?.endDate) }}</span>
              </div>
              <div class="preview-arrow">→</div>
              <div class="preview-row">
                <span class="preview-label">{{ PAGES.CONTRACTS.NEW_END_DATE }}</span>
                <span class="preview-value highlight">{{ formatDate(extendedEndDate) }}</span>
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.EXTEND_REASON }}</label>
              <textarea
                v-model="extendForm.reason"
                class="input"
                rows="2"
                :placeholder="PAGES.CONTRACTS.EXTEND_REASON_PLACEHOLDER"
              ></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showExtendModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button
              class="btn btn-primary"
              :disabled="isProcessing || !isExtendValid"
              @click="handleExtend"
            >
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_EXTEND }}
            </button>
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
  background: linear-gradient(135deg, #007aff, #00c7be);
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
  background: linear-gradient(135deg, #007aff, #5856d6);
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

/* 經辦資訊樣式 */
.log-meta {
  display: flex;
  gap: var(--space-md);
  margin-top: var(--space-sm);
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.log-operator,
.log-branch {
  display: flex;
  align-items: center;
  gap: 4px;
}

.log-operator svg,
.log-branch svg {
  opacity: 0.7;
}

/* 更多 log 類型樣式 */
.log-resume {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.log-extend {
  background: rgba(0, 122, 255, 0.15);
  color: var(--color-accent);
}

.log-cancel {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.log-renewal {
  background: rgba(88, 86, 214, 0.15);
  color: #5856d6;
}

.log-class_used {
  background: rgba(255, 159, 10, 0.15);
  color: var(--color-warning);
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

/* Open (PENDING) / failed gateway checkouts are not money received */
.payment-not-received .payment-amount {
  color: var(--color-text-tertiary);
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

/* New Action Buttons */
.btn-danger {
  background: var(--color-error);
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

.btn-accent {
  background: var(--color-accent);
  color: white;
}

.btn-accent:hover {
  background: #005bb5;
}

/* Error Modal Icon */
.modal-icon-error {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

/* Amount Input */
.amount-input {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.amount-input .currency {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.amount-input .input {
  flex: 1;
}

.input-hint {
  font-size: 12px;
  margin-top: var(--space-xs);
}

/* Extend Preview */
.extend-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  margin: var(--space-md) 0;
}

.preview-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}

.preview-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.preview-value {
  font-size: 15px;
  font-weight: 500;
}

.preview-value.highlight {
  color: var(--color-accent);
  font-size: 17px;
}

.preview-arrow {
  font-size: 20px;
  color: var(--color-text-tertiary);
}

/* Signature status + action */
.signature-status {
  margin: 0;
  font-size: 15px;
}

.signature-action {
  margin-top: 12px;
}

/* Transfer modal */
.transfer-search {
  display: flex;
  gap: var(--space-sm);
}

.transfer-search .input {
  flex: 1;
}

.transfer-results {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.transfer-result {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 200ms ease-out;
}

.transfer-result:hover {
  background: var(--color-accent-light);
}

.transfer-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: var(--color-accent-light);
}

.transfer-member-name {
  margin: 4px 0 0;
  font-weight: 600;
}

.input-hint {
  font-size: 13px;
}

.modal-wide {
  max-width: 560px;
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
