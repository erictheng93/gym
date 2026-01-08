<script setup lang="ts">
import { createItem, readItems } from '@directus/sdk'
import type { ContractLog, Member } from '~/types/directus'
import { MESSAGES, PAGES, STATUS, LABELS, TIMING } from '~/constants'
import { validateUUIDParam } from '~/utils/validation'

definePageMeta({
  middleware: 'auth',
  validate: validateUUIDParam('contractId')
})

const route = useRoute()
const router = useRouter()
const directus = useDirectus()
const { getContract, updateContract } = useContracts()
const { fetchPayments, payments } = usePayments()
const { currentEmployee, fetchCurrentEmployee } = useAuth()

const contract = ref<Awaited<ReturnType<typeof getContract>> | null>(null)
const isLoading = ref(true)

const showPauseModal = ref(false)
const showResumeModal = ref(false)
const showTransferModal = ref(false)
const showTerminateModal = ref(false)
const showExtendModal = ref(false)
const showRenewModal = ref(false)
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

const terminateForm = reactive({
  reason: '',
  refundAmount: 0
})

const extendForm = reactive({
  days: 0,
  reason: ''
})

const renewForm = reactive({
  startDate: '',
  amount: 0
})

// 轉讓會員搜尋相關
const memberSearchQuery = ref('')
const memberSearchResults = ref<Member[]>([])
const selectedMember = ref<Member | null>(null)
const isSearching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

// 會員搜尋 (debounced)
const searchMembers = async (query: string) => {
  if (!query || query.length < 2) {
    memberSearchResults.value = []
    return
  }

  isSearching.value = true
  try {
    const data = await directus.request(
      readItems('members', {
        filter: {
          _and: [
            {
              _or: [
                { full_name: { _contains: query } },
                { member_code: { _contains: query } },
                { phone: { _contains: query } }
              ]
            },
            // 排除當前合約的會員 (member_id 是展開後的物件，需要取 .id)
            { id: { _neq: contract.value?.member_id?.id } }
          ]
        },
        fields: ['id', 'full_name', 'member_code', 'phone', 'member_status'],
        limit: 10
      })
    )
    memberSearchResults.value = data as Member[]
  } catch (error) {
    console.error('Failed to search members:', error)
    useToast().error(MESSAGES.ERRORS.MEMBER_SEARCH_FAILED)
    memberSearchResults.value = []
  } finally {
    isSearching.value = false
  }
}

// 處理搜尋輸入 (debounced)
const handleSearchInput = (event: Event) => {
  const query = (event.target as HTMLInputElement).value
  memberSearchQuery.value = query

  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    searchMembers(query)
  }, TIMING.DEBOUNCE)
}

// 選擇會員
const selectMember = (member: Member) => {
  selectedMember.value = member
  transferForm.targetMemberId = member.id
  memberSearchQuery.value = ''
  memberSearchResults.value = []
}

// 清除選擇的會員
const clearSelectedMember = () => {
  selectedMember.value = null
  transferForm.targetMemberId = ''
}

// 重置轉讓表單
const resetTransferForm = () => {
  transferForm.targetMemberId = ''
  transferForm.reason = ''
  memberSearchQuery.value = ''
  memberSearchResults.value = []
  selectedMember.value = null
}

// 打開轉讓 Modal
const openTransferModal = () => {
  resetTransferForm()
  showTransferModal.value = true
}

const contractId = computed(() => route.params.contractId as string)

const loadContract = async () => {
  isLoading.value = true
  try {
    contract.value = await getContract(contractId.value)
    await fetchPayments({ contractId: contractId.value })
    // 確保有當前員工資訊（用於記錄操作者）
    if (!currentEmployee.value) {
      await fetchCurrentEmployee()
    }
  } catch (error) {
    console.error('Failed to load contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_LOAD_FAILED)
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
    DRAFT: { label: STATUS.CONTRACT.DRAFT, class: '' },
    ACTIVE: { label: STATUS.CONTRACT.ACTIVE, class: 'badge-success' },
    PAUSED: { label: STATUS.CONTRACT.PAUSED, class: 'badge-warning' },
    EXPIRED: { label: STATUS.CONTRACT.EXPIRED, class: 'badge-error' },
    TERMINATED: { label: STATUS.CONTRACT.TERMINATED, class: 'badge-error' }
  }
  return map[status] || { label: status, class: '' }
}

const getPaymentStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    UNPAID: { label: STATUS.PAYMENT.UNPAID, class: 'badge-error' },
    PARTIAL: { label: STATUS.PAYMENT.PARTIAL, class: 'badge-warning' },
    PAID: { label: STATUS.PAYMENT.PAID, class: 'badge-success' }
  }
  return map[status] || { label: status, class: '' }
}

const getPlanTypeLabel = (type: string) => {
  return type === 'TIME_BASED' ? LABELS.CONTRACT_TYPE.TIME_BASED : LABELS.CONTRACT_TYPE.COUNT_BASED
}

const getLogTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    PAUSE: LABELS.LOG_TYPE.PAUSE,
    RESUME: LABELS.LOG_TYPE.RESUME,
    EXTEND: LABELS.LOG_TYPE.EXTENSION,
    EXTENSION: LABELS.LOG_TYPE.EXTENSION,
    TRANSFER: LABELS.LOG_TYPE.TRANSFER,
    CANCEL: LABELS.LOG_TYPE.CANCEL,
    RENEWAL: LABELS.LOG_TYPE.RENEWAL,
    CLASS_USED: LABELS.LOG_TYPE.CLASS_USED
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

    // 建立異動紀錄（包含完整資訊：經辦員工、執行分店）
    await directus.request(createItem('contract_logs', {
      contract_id: contract.value.id,
      log_type: 'PAUSE',
      start_date: pauseForm.startDate,
      end_date: pauseForm.endDate,
      days_affected: daysAffected,
      reason: pauseForm.reason,
      created_by_employee: currentEmployee.value?.id || null,
      branch_id: currentEmployee.value?.branch_id || contract.value.branch_id?.id || null
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
    useToast().success(MESSAGES.SUCCESS.CONTRACT_PAUSED)
    await loadContract()
  } catch (error) {
    console.error('Failed to pause contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_PAUSE_FAILED)
  } finally {
    isProcessing.value = false
  }
}

// 恢復合約
const handleResume = async () => {
  if (!contract.value) return

  isProcessing.value = true
  try {
    // 建立恢復異動紀錄
    await directus.request(createItem('contract_logs', {
      contract_id: contract.value.id,
      log_type: 'RESUME',
      reason: '合約恢復',
      created_by_employee: currentEmployee.value?.id || null,
      branch_id: currentEmployee.value?.branch_id || contract.value.branch_id?.id || null
    } as Partial<ContractLog>))

    // 更新合約狀態
    await updateContract(contract.value.id, {
      contract_status: 'ACTIVE'
    })

    showResumeModal.value = false
    useToast().success(MESSAGES.SUCCESS.CONTRACT_RESUMED)
    await loadContract()
  } catch (error) {
    console.error('Failed to resume contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_RESUME_FAILED)
  } finally {
    isProcessing.value = false
  }
}

// 檢查是否可以暫停
const canPause = computed(() => {
  if (!contract.value) return false
  return contract.value.contract_status === 'ACTIVE' && contract.value.plan_id?.allow_pause
})

// 檢查是否可以恢復
const canResume = computed(() => {
  if (!contract.value) return false
  return contract.value.contract_status === 'PAUSED'
})

// 檢查是否可以轉讓
const canTransfer = computed(() => {
  if (!contract.value) return false
  return ['ACTIVE', 'PAUSED'].includes(contract.value.contract_status) && contract.value.plan_id?.allow_transfer
})

// 檢查是否可以終止
const canTerminate = computed(() => {
  if (!contract.value) return false
  return ['ACTIVE', 'PAUSED', 'DRAFT'].includes(contract.value.contract_status)
})

// 檢查是否可以延期
const canExtend = computed(() => {
  if (!contract.value) return false
  return ['ACTIVE', 'PAUSED'].includes(contract.value.contract_status)
})

// 檢查是否可以續約
const canRenew = computed(() => {
  if (!contract.value) return false
  return ['ACTIVE', 'EXPIRED'].includes(contract.value.contract_status)
})

// 計算延期後的新結束日期
const extendedEndDate = computed(() => {
  if (!contract.value?.end_date || !extendForm.days) return ''
  const end = new Date(contract.value.end_date)
  end.setDate(end.getDate() + extendForm.days)
  return end.toISOString().split('T')[0]
})

// 轉讓合約
const handleTransfer = async () => {
  if (!contract.value || !transferForm.targetMemberId) return

  isProcessing.value = true
  try {
    // 建立轉讓異動紀錄 (後端 hook 會自動更新 contract.member_id)
    // 包含完整資訊：經辦員工、執行分店、原因
    await directus.request(createItem('contract_logs', {
      contract_id: contract.value.id,
      log_type: 'TRANSFER',
      original_member_id: contract.value.member_id?.id,
      target_member_id: transferForm.targetMemberId,
      reason: transferForm.reason || `轉讓給 ${selectedMember.value?.full_name}`,
      created_by_employee: currentEmployee.value?.id || null,
      branch_id: currentEmployee.value?.branch_id || contract.value.branch_id?.id || null
    } as Partial<ContractLog>))

    showTransferModal.value = false
    resetTransferForm()
    useToast().success(MESSAGES.SUCCESS.CONTRACT_TRANSFERRED)
    await loadContract()
  } catch (error) {
    console.error('Failed to transfer contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_TRANSFER_FAILED)
  } finally {
    isProcessing.value = false
  }
}

// 終止合約
const handleTerminate = async () => {
  if (!contract.value) return

  isProcessing.value = true
  try {
    // 建立終止異動紀錄
    await directus.request(createItem('contract_logs', {
      contract_id: contract.value.id,
      log_type: 'CANCEL',
      reason: terminateForm.reason || '合約終止',
      created_by_employee: currentEmployee.value?.id || null,
      branch_id: currentEmployee.value?.branch_id || contract.value.branch_id?.id || null
    } as Partial<ContractLog>))

    // 更新合約狀態為終止
    await updateContract(contract.value.id, {
      contract_status: 'TERMINATED'
    })

    // 如果有退款金額，建立退款紀錄
    if (terminateForm.refundAmount > 0) {
      await directus.request(createItem('payments', {
        contract_id: contract.value.id,
        member_id: contract.value.member_id?.id,
        amount: terminateForm.refundAmount,
        payment_type: 'REFUND',
        payment_date: new Date().toISOString().split('T')[0],
        branch_id: currentEmployee.value?.branch_id || contract.value.branch_id?.id || null,
        received_by: currentEmployee.value?.id || null,
        notes: `合約終止退款 - ${terminateForm.reason}`
      }))
    }

    showTerminateModal.value = false
    terminateForm.reason = ''
    terminateForm.refundAmount = 0
    useToast().success(MESSAGES.SUCCESS.CONTRACT_TERMINATED)
    await loadContract()
  } catch (error) {
    console.error('Failed to terminate contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_TERMINATE_FAILED)
  } finally {
    isProcessing.value = false
  }
}

// 延期合約
const handleExtend = async () => {
  if (!contract.value || !extendForm.days || extendForm.days <= 0) return

  isProcessing.value = true
  try {
    // 建立延期異動紀錄
    await directus.request(createItem('contract_logs', {
      contract_id: contract.value.id,
      log_type: 'EXTEND',
      days_affected: extendForm.days,
      reason: extendForm.reason || `延期 ${extendForm.days} 天`,
      created_by_employee: currentEmployee.value?.id || null,
      branch_id: currentEmployee.value?.branch_id || contract.value.branch_id?.id || null
    } as Partial<ContractLog>))

    // 更新合約結束日期
    await updateContract(contract.value.id, {
      end_date: extendedEndDate.value
    })

    showExtendModal.value = false
    extendForm.days = 0
    extendForm.reason = ''
    useToast().success(MESSAGES.SUCCESS.CONTRACT_EXTENDED)
    await loadContract()
  } catch (error) {
    console.error('Failed to extend contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_EXTEND_FAILED)
  } finally {
    isProcessing.value = false
  }
}

// 續約
const { createContract } = useContracts()

const handleRenew = async () => {
  if (!contract.value || !renewForm.startDate) return

  isProcessing.value = true
  try {
    // 計算新合約結束日期
    const startDate = new Date(renewForm.startDate)
    const durationMonths = contract.value.plan_id?.duration_months || 0
    startDate.setMonth(startDate.getMonth() + durationMonths)
    const newEndDate = startDate.toISOString().split('T')[0]

    // 建立續約紀錄（在舊合約上）
    await directus.request(createItem('contract_logs', {
      contract_id: contract.value.id,
      log_type: 'RENEWAL',
      reason: '續約',
      created_by_employee: currentEmployee.value?.id || null,
      branch_id: currentEmployee.value?.branch_id || contract.value.branch_id?.id || null
    } as Partial<ContractLog>))

    // 建立新合約
    const newContract = await createContract({
      member_id: contract.value.member_id?.id,
      plan_id: contract.value.plan_id?.id,
      branch_id: contract.value.branch_id?.id,
      sales_person_id: currentEmployee.value?.id || contract.value.sales_person_id,
      start_date: renewForm.startDate,
      end_date: newEndDate,
      original_end_date: newEndDate,
      sign_date: new Date().toISOString().split('T')[0],
      total_amount: renewForm.amount || contract.value.plan_id?.price || 0,
      contract_status: 'ACTIVE',
      payment_status: 'UNPAID',
      remaining_counts: contract.value.plan_id?.class_counts || null,
      notes: `續約自合約 ${contract.value.contract_no}`
    })

    showRenewModal.value = false
    renewForm.startDate = ''
    renewForm.amount = 0

    // 導航到新合約
    useToast().success(MESSAGES.SUCCESS.CONTRACT_RENEWED)
    if (newContract?.id) {
      navigateTo(`/contracts/${newContract.id}`)
    }
  } catch (error) {
    console.error('Failed to renew contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_RENEW_FAILED)
  } finally {
    isProcessing.value = false
  }
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
  showTerminateModal.value = true
}

// 打開續約 Modal
const openRenewModal = () => {
  // 預設開始日為當前合約結束日的隔天
  if (contract.value?.end_date) {
    const nextDay = new Date(contract.value.end_date)
    nextDay.setDate(nextDay.getDate() + 1)
    renewForm.startDate = nextDay.toISOString().split('T')[0]
  } else {
    renewForm.startDate = new Date().toISOString().split('T')[0]
  }
  renewForm.amount = contract.value?.plan_id?.price || 0
  showRenewModal.value = true
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
          <button v-if="canTransfer" class="btn btn-ghost" @click="openTransferModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /><path d="M16 21h5v-5" /><path d="M8 21H3v-5" />
            </svg>
            {{ PAGES.CONTRACTS.TRANSFER_CONTRACT }}
          </button>
          <button v-if="canRenew" class="btn btn-accent" @click="openRenewModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" /><path d="M12 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="m16 12 5 3-5 3v-6Z" />
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
              <code class="contract-no-large">{{ contract.contract_no }}</code>
              <span :class="['badge badge-large', getStatusBadge(contract.contract_status).class]">
                {{ getStatusBadge(contract.contract_status).label }}
              </span>
            </div>
            <h2 class="plan-name-large">{{ contract.plan_id?.name || '—' }}</h2>
          </div>
        </div>

        <div class="hero-stats">
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatCurrency(contract.total_amount) }}</span>
            <span class="hero-stat-label">{{ PAGES.CONTRACTS.CONTRACT_AMOUNT }}</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatDate(contract.start_date) }}</span>
            <span class="hero-stat-label">{{ PAGES.CONTRACTS.START_DATE }}</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value">{{ formatDate(contract.end_date) }}</span>
            <span class="hero-stat-label">{{ PAGES.CONTRACTS.END_DATE }}</span>
          </div>
          <div class="hero-stat">
            <span :class="['badge', getPaymentStatusBadge(contract.payment_status).class]">
              {{ getPaymentStatusBadge(contract.payment_status).label }}
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
            <div class="member-avatar-large">{{ contract.member_id?.full_name?.[0] || '?' }}</div>
            <div class="member-details">
              <h4 class="member-name-large">{{ contract.member_id?.full_name }}</h4>
              <code class="member-code">{{ contract.member_id?.member_code }}</code>
              <div class="member-contact">
                <span v-if="contract.member_id?.phone">{{ contract.member_id.phone }}</span>
                <span v-if="contract.member_id?.email" class="text-tertiary">{{ contract.member_id.email }}</span>
              </div>
            </div>
            <NuxtLink :to="`/members/${contract.member_id?.id}`" class="view-member-btn btn btn-ghost btn-small">
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
              <span>{{ getPlanTypeLabel(contract.plan_id?.plan_type || '') }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.PLAN_DURATION }}</label>
              <span>{{ contract.plan_id?.duration_months ? `${contract.plan_id.duration_months} ${PAGES.CONTRACTS.MONTHS}` : '—' }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.ALLOW_PAUSE }}</label>
              <span :class="contract.plan_id?.allow_pause ? 'text-success' : 'text-error'">
                {{ contract.plan_id?.allow_pause ? LABELS.YES : LABELS.NO }}
              </span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.ALLOW_TRANSFER }}</label>
              <span :class="contract.plan_id?.allow_transfer ? 'text-success' : 'text-error'">
                {{ contract.plan_id?.allow_transfer ? LABELS.YES : LABELS.NO }}
              </span>
            </div>
            <div v-if="contract.plan_id?.plan_type === 'COUNT_BASED'" class="info-item">
              <label>{{ PAGES.CONTRACTS.REMAINING_COUNTS }}</label>
              <span class="count-remaining">{{ contract.remaining_counts || 0 }} / {{ contract.plan_id?.class_counts || 0 }}</span>
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
              <span>{{ formatDate(contract.sign_date) }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.ORIGINAL_END_DATE }}</label>
              <span>{{ formatDate(contract.original_end_date) }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.BRANCH }}</label>
              <span>{{ contract.branch_id?.name || '—' }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.CONTRACTS.SALES_PERSON }}</label>
              <span>{{ contract.sales_person_id?.full_name || '—' }}</span>
            </div>
          </div>
          <div v-if="contract.notes" class="notes-section">
            <label>{{ MESSAGES.FORM.NOTES }}</label>
            <p>{{ contract.notes }}</p>
          </div>
        </section>

        <!-- Signature -->
        <section v-if="contract.digital_signature" class="detail-card card signature-card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            {{ PAGES.CONTRACTS.E_SIGNATURE }}
          </h3>
          <div class="signature-preview">
            <img :src="contract.digital_signature" :alt="PAGES.CONTRACTS.E_SIGNATURE" />
          </div>
        </section>
      </div>

      <!-- Contract Logs -->
      <section v-if="contract.logs && contract.logs.length > 0" class="logs-section">
        <h2 class="section-title">{{ PAGES.CONTRACTS.CHANGE_LOG }}</h2>
        <div class="logs-timeline">
          <div v-for="log in contract.logs" :key="log.id" class="log-item card">
            <div class="log-type-badge" :class="`log-${log.log_type.toLowerCase()}`">
              {{ getLogTypeLabel(log.log_type) }}
            </div>
            <div class="log-content">
              <!-- 轉讓特有資訊 -->
              <div v-if="log.log_type === 'TRANSFER'" class="log-transfer-info">
                <span class="transfer-from">{{ log.original_member_id?.full_name || '—' }}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
                <span class="transfer-to">{{ log.target_member_id?.full_name || '—' }}</span>
              </div>
              <!-- 暫停/延期日期 -->
              <div v-else class="log-dates">
                <span>{{ formatDate(log.start_date) }}</span>
                <span v-if="log.end_date"> → {{ formatDate(log.end_date) }}</span>
              </div>
              <p v-if="log.days_affected" class="log-days">{{ PAGES.CONTRACTS.DAYS_AFFECTED }}：{{ log.days_affected }} {{ PAGES.CONTRACTS.DAYS_UNIT }}</p>
              <p v-if="log.reason" class="log-reason text-secondary">{{ log.reason }}</p>
              <!-- 經辦資訊 -->
              <div class="log-meta">
                <span v-if="log.created_by_employee?.full_name" class="log-operator">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  {{ log.created_by_employee.full_name }}
                </span>
                <span v-if="log.branch_id?.name" class="log-branch">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  {{ log.branch_id.name }}
                </span>
              </div>
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
          <h2 class="section-title">{{ PAGES.CONTRACTS.PAYMENT_RECORDS }}</h2>
          <NuxtLink :to="`/payments/new?contract=${contract.id}`" class="btn btn-primary btn-small">
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
          <div v-for="payment in payments" :key="payment.id" class="payment-item card">
            <div class="payment-type" :class="payment.payment_type === 'INCOME' ? 'payment-income' : 'payment-refund'">
              {{ payment.payment_type === 'INCOME' ? LABELS.PAYMENT_TYPE.INCOME : LABELS.PAYMENT_TYPE.REFUND }}
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
              <input v-model="pauseForm.endDate" type="date" class="input" />
            </div>
            <div class="input-group">
              <label class="input-label">{{ MESSAGES.FORM.REASON }}</label>
              <textarea v-model="pauseForm.reason" class="input" rows="3" :placeholder="PAGES.CONTRACTS.PAUSE_REASON_PLACEHOLDER"></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showPauseModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button class="btn btn-warning" :disabled="isProcessing || !pauseForm.endDate" @click="handlePause">
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
        <div class="modal-content glass-card modal-transfer">
          <div class="modal-icon modal-icon-accent">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
            </svg>
          </div>
          <h3 class="modal-title">{{ PAGES.CONTRACTS.TRANSFER_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.TRANSFER_TO_MEMBER }}</p>

          <div class="modal-form">
            <!-- 已選會員顯示 -->
            <div v-if="selectedMember" class="selected-member">
              <div class="selected-member-info">
                <div class="selected-member-avatar">{{ selectedMember.full_name?.[0] || '?' }}</div>
                <div class="selected-member-details">
                  <span class="selected-member-name">{{ selectedMember.full_name }}</span>
                  <code class="selected-member-code">{{ selectedMember.member_code }}</code>
                </div>
              </div>
              <button class="clear-selection-btn" type="button" @click="clearSelectedMember">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <!-- 會員搜尋 -->
            <div v-else class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.SEARCH_TARGET_MEMBER }}</label>
              <div class="search-input-wrapper">
                <input
                  type="text"
                  class="input"
                  :value="memberSearchQuery"
                  :placeholder="PAGES.CONTRACTS.SEARCH_MEMBER_PLACEHOLDER"
                  @input="handleSearchInput"
                />
                <div v-if="isSearching" class="search-loading">
                  <div class="search-spinner" />
                </div>
              </div>

              <!-- 搜尋結果 -->
              <div v-if="memberSearchResults.length > 0" class="search-results">
                <button
                  v-for="member in memberSearchResults"
                  :key="member.id"
                  class="search-result-item"
                  type="button"
                  @click="selectMember(member)"
                >
                  <div class="result-avatar">{{ member.full_name?.[0] || '?' }}</div>
                  <div class="result-info">
                    <span class="result-name">{{ member.full_name }}</span>
                    <span class="result-meta">{{ member.member_code }} · {{ member.phone || PAGES.CONTRACTS.NO_PHONE }}</span>
                  </div>
                  <span :class="['result-status', member.member_status === 'ACTIVE' ? 'status-active' : '']">
                    {{ member.member_status === 'ACTIVE' ? STATUS.MEMBER.ACTIVE : member.member_status }}
                  </span>
                </button>
              </div>

              <!-- 無搜尋結果 -->
              <div v-else-if="memberSearchQuery.length >= 2 && !isSearching" class="no-results">
                {{ PAGES.CONTRACTS.NO_MEMBER_FOUND }}
              </div>
            </div>

            <!-- 轉讓原因 -->
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.TRANSFER_REASON }}</label>
              <textarea
                v-model="transferForm.reason"
                class="input"
                rows="3"
                :placeholder="PAGES.CONTRACTS.TRANSFER_REASON_PLACEHOLDER"
              ></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showTransferModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button
              class="btn btn-primary"
              :disabled="isProcessing || !transferForm.targetMemberId"
              @click="handleTransfer"
            >
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_TRANSFER }}
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
                  :max="contract?.total_amount || 0"
                />
              </div>
              <span class="input-hint text-tertiary">{{ PAGES.CONTRACTS.NO_REFUND }}：0</span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showTerminateModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button class="btn btn-danger" :disabled="isProcessing" @click="handleTerminate">
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
                <span class="preview-value">{{ formatDate(contract?.end_date) }}</span>
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
              :disabled="isProcessing || !extendForm.days || extendForm.days <= 0"
              @click="handleExtend"
            >
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_EXTEND }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Renew Modal -->
    <Teleport to="body">
      <div v-if="showRenewModal" class="modal-overlay" @click.self="showRenewModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-success">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" /><path d="M12 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="m16 12 5 3-5 3v-6Z" />
            </svg>
          </div>
          <h3 class="modal-title">{{ PAGES.CONTRACTS.RENEW_CONTRACT }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.CONTRACTS.RENEW_HINT }}</p>

          <div class="modal-form">
            <div class="renew-info">
              <div class="info-row">
                <span class="info-label">{{ PAGES.CONTRACTS.PLAN_NAME }}</span>
                <span class="info-value">{{ contract?.plan_id?.name }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">{{ PAGES.CONTRACTS.PLAN_DURATION }}</span>
                <span class="info-value">{{ contract?.plan_id?.duration_months }} {{ PAGES.CONTRACTS.MONTHS }}</span>
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.RENEW_START_DATE }}</label>
              <input
                v-model="renewForm.startDate"
                type="date"
                class="input"
              />
            </div>
            <div class="input-group">
              <label class="input-label">{{ PAGES.CONTRACTS.RENEW_AMOUNT }}</label>
              <div class="amount-input">
                <span class="currency">NT$</span>
                <input
                  v-model.number="renewForm.amount"
                  type="number"
                  class="input"
                  min="0"
                />
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showRenewModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button
              class="btn btn-primary"
              :disabled="isProcessing || !renewForm.startDate"
              @click="handleRenew"
            >
              {{ isProcessing ? MESSAGES.ACTIONS.PROCESSING : PAGES.CONTRACTS.CONFIRM_RENEW }}
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

/* 轉讓資訊樣式 */
.log-transfer-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-weight: 500;
  margin-bottom: var(--space-xs);
}

.transfer-from {
  color: var(--color-text-secondary);
}

.transfer-to {
  color: var(--color-accent);
}

.log-transfer-info svg {
  color: var(--color-text-tertiary);
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
  background: rgba(0, 113, 227, 0.15);
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

/* Transfer Modal */
.modal-transfer {
  max-width: 480px;
}

.search-input-wrapper {
  position: relative;
}

.search-loading {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.search-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--space-sm);
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background var(--duration-fast) var(--ease-out);
}

.search-result-item:hover {
  background: var(--color-bg-secondary);
}

.result-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-name {
  font-weight: 500;
  font-size: 14px;
  color: var(--color-text-primary);
}

.result-meta {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.result-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
}

.result-status.status-active {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.no-results {
  padding: var(--space-md);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.selected-member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  background: var(--color-accent-light);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-accent);
}

.selected-member-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.selected-member-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

.selected-member-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.selected-member-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text-primary);
}

.selected-member-code {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.clear-selection-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}

.clear-selection-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-error);
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

/* Renew Info */
.renew-info {
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-md);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-xs) 0;
}

.info-row:not(:last-child) {
  border-bottom: 1px solid var(--color-divider);
}

.info-label {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.info-value {
  font-weight: 500;
  font-size: 14px;
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
