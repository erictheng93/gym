<script setup lang="ts">
/**
 * 休假管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 */
import { PAGES, MESSAGES } from '~/constants'
import { useLeaveRequests } from '~/composables/hr'
import type { LeaveRequest, LeaveBalance, LeaveApprovalLog } from '~/types/schema'

definePageMeta({
  middleware: 'auth'
})

const { currentEmployee, checkAuth } = useAuth()
const {
  leaveRequests,
  leaveBalances,
  pendingApprovals,
  isLeavesLoading,
  leavesTotalCount,
  fetchLeaveBalances,
  fetchLeaveRequests,
  fetchPendingApprovals,
  applyLeave,
  reviewLeave,
  cancelLeave,
  fetchApprovalHistory
} = useLeaveRequests()

const activeTab = ref<'my-leaves' | 'apply' | 'approve' | 'balance'>('my-leaves')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = 10

// 申請表單
type LeaveType = 'SICK' | 'ANNUAL' | 'PERSONAL' | 'MATERNITY' | 'BEREAVEMENT' | 'OTHER'
const applyForm = ref({
  leaveType: 'ANNUAL' as LeaveType,
  startDate: '',
  endDate: '',
  reason: '',
  isHalfDay: false,
  halfDayType: 'AM' as 'AM' | 'PM'
})

const isSubmitting = ref(false)
const showApplyModal = ref(false)
const showHistoryModal = ref(false)
const showReviewModal = ref(false)
const selectedLeaveHistory = ref<LeaveApprovalLog[]>([])
const selectedLeaveId = ref('')
const reviewData = ref<{ leaveId: string; action: 'APPROVE' | 'REJECT'; employeeName: string } | null>(null)
const reviewNotes = ref('')
const isReviewing = ref(false)

// 假別選項
const leaveTypeOptions = [
  { value: 'ANNUAL', label: PAGES.HR.LEAVES.ANNUAL, color: '#007aff' },
  { value: 'SICK', label: PAGES.HR.LEAVES.SICK, color: '#ff3b30' },
  { value: 'PERSONAL', label: PAGES.HR.LEAVES.PERSONAL, color: '#ff9500' },
  { value: 'MATERNITY', label: PAGES.HR.LEAVES.MATERNITY, color: '#af52de' },
  { value: 'BEREAVEMENT', label: PAGES.HR.LEAVES.BEREAVEMENT, color: '#8e8e93' },
  { value: 'OTHER', label: PAGES.HR.LEAVES.OTHER, color: '#5856d6' }
]

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'PENDING', label: PAGES.HR.LEAVES.PENDING_APPROVAL },
  { value: 'APPROVED', label: PAGES.HR.LEAVES.APPROVED },
  { value: 'REJECTED', label: PAGES.HR.LEAVES.REJECTED },
  { value: 'CANCELLED', label: PAGES.HR.LEAVES.CANCELLED }
]

onMounted(async () => {
  await checkAuth()
  if (currentEmployee.value?.id) {
    await loadData()
  }
})

const loadData = async () => {
  if (!currentEmployee.value?.id) return

  await Promise.all([
    fetchLeaveBalances(currentEmployee.value.id),
    fetchLeaveRequests({
      employeeId: currentEmployee.value.id,
      status: selectedStatus.value || undefined,
      page: currentPage.value,
      limit: pageSize
    }),
    fetchPendingApprovals(currentEmployee.value.id)
  ])
}

// 監聽篩選條件變化
watch([selectedStatus, currentPage], () => {
  if (currentEmployee.value?.id) {
    fetchLeaveRequests({
      employeeId: currentEmployee.value.id,
      status: selectedStatus.value || undefined,
      page: currentPage.value,
      limit: pageSize
    })
  }
})

// 計算申請天數
const calculateDays = computed(() => {
  if (!applyForm.value.startDate || !applyForm.value.endDate) return 0
  if (applyForm.value.isHalfDay) return 0.5

  const start = new Date(applyForm.value.startDate)
  const end = new Date(applyForm.value.endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
})

// 取得假別餘額
const getBalance = (type: string) => {
  const balance = leaveBalances.value.find(b => b.leave_type === type)
  if (!balance) return { total: 0, used: 0, remaining: 0 }
  return {
    total: balance.total_days,
    used: balance.used_days,
    remaining: balance.total_days - balance.used_days - balance.pending_days
  }
}

// 取得假別標籤
const getLeaveTypeLabel = (type: string) => {
  return leaveTypeOptions.find(o => o.value === type)?.label || type
}

const getLeaveTypeColor = (type: string) => {
  return leaveTypeOptions.find(o => o.value === type)?.color || '#8e8e93'
}

// 取得狀態 Badge
const getStatusBadgeConfig = (status: string): { label: string; variant: 'success' | 'warning' | 'error' | 'default' } => {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
    PENDING: { label: PAGES.HR.LEAVES.PENDING_APPROVAL, variant: 'warning' },
    APPROVED: { label: PAGES.HR.LEAVES.APPROVED, variant: 'success' },
    REJECTED: { label: PAGES.HR.LEAVES.REJECTED, variant: 'error' },
    CANCELLED: { label: PAGES.HR.LEAVES.CANCELLED, variant: 'default' }
  }
  return map[status] || { label: status, variant: 'default' }
}

// 格式化日期
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 提交申請
const handleApply = async () => {
  if (!currentEmployee.value?.id || isSubmitting.value) return
  if (!applyForm.value.startDate || !applyForm.value.endDate) {
    alert('請選擇日期區間')
    return
  }

  isSubmitting.value = true
  try {
    await applyLeave({
      employeeId: currentEmployee.value.id,
      leaveType: applyForm.value.leaveType,
      startDate: applyForm.value.startDate,
      endDate: applyForm.value.endDate,
      reason: applyForm.value.reason,
      daysRequested: calculateDays.value,
      isHalfDay: applyForm.value.isHalfDay,
      halfDayType: applyForm.value.isHalfDay ? applyForm.value.halfDayType : undefined
    })

    // 重置表單
    applyForm.value = {
      leaveType: 'ANNUAL' as LeaveType,
      startDate: '',
      endDate: '',
      reason: '',
      isHalfDay: false,
      halfDayType: 'AM' as 'AM' | 'PM'
    }

    useToast().success(MESSAGES.SUCCESS.LEAVE_CREATED)
    showApplyModal.value = false
    activeTab.value = 'my-leaves'
    await loadData()
  } catch (error) {
    console.error('Apply leave failed:', error)
    useToast().error(MESSAGES.ERRORS.LEAVE_CREATE_FAILED)
  } finally {
    isSubmitting.value = false
  }
}

// 取消申請
const handleCancel = async (leaveId: string) => {
  if (!currentEmployee.value?.id) return

  const { confirm } = useConfirm()
  const confirmed = await confirm({
    title: '取消休假申請',
    message: '確定要取消此休假申請嗎？此操作將通知相關人員。',
    type: 'warning'
  })

  if (!confirmed) return

  try {
    await cancelLeave(leaveId, currentEmployee.value.id)
    useToast().success(MESSAGES.SUCCESS.LEAVE_CANCELLED)
    await loadData()
  } catch (error: unknown) {
    console.error('Cancel leave failed:', error)
    const errorMessage = error instanceof Error ? error.message : MESSAGES.ERRORS.LEAVE_CANCEL_FAILED
    useToast().error(errorMessage)
  }
}

// 開啟審核 Modal
const openReviewModal = (leave: LeaveRequest, action: 'APPROVE' | 'REJECT') => {
  reviewData.value = {
    leaveId: leave.id,
    action,
    employeeName: (leave.employee as { full_name: string })?.full_name || '員工'
  }
  reviewNotes.value = ''
  showReviewModal.value = true
}

// 提交審核
const submitReview = async () => {
  if (!currentEmployee.value?.id || !reviewData.value || isReviewing.value) return

  isReviewing.value = true
  try {
    await reviewLeave(
      reviewData.value.leaveId,
      currentEmployee.value.id,
      reviewData.value.action,
      reviewNotes.value || undefined
    )
    const successMessage = reviewData.value.action === 'APPROVE'
      ? MESSAGES.SUCCESS.LEAVE_APPROVED
      : MESSAGES.SUCCESS.LEAVE_REJECTED
    useToast().success(successMessage)
    showReviewModal.value = false
    reviewData.value = null
    reviewNotes.value = ''
    await loadData()
  } catch (error) {
    console.error('Review failed:', error)
    useToast().error(MESSAGES.ERRORS.LEAVE_REVIEW_FAILED)
  } finally {
    isReviewing.value = false
  }
}

// 查看審核歷程
const viewHistory = async (leaveId: string) => {
  selectedLeaveId.value = leaveId
  selectedLeaveHistory.value = await fetchApprovalHistory(leaveId)
  showHistoryModal.value = true
}

// 總頁數
const totalPages = computed(() => Math.ceil(leavesTotalCount.value / pageSize))

// 取得動作標籤
const getActionLabel = (action: string) => {
  const map: Record<string, string> = {
    SUBMIT: '提交申請',
    APPROVE: '核准',
    REJECT: '駁回',
    CANCEL: '取消',
    REVOKE: '撤回'
  }
  return map[action] || action
}
</script>

<template>
  <PageContainer class="leaves-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <NuxtLink to="/hr" class="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {{ PAGES.HR.TITLE }}
        </NuxtLink>
        <h1 class="text-headline">{{ PAGES.HR.LEAVES.TITLE }}</h1>
        <p class="text-body text-secondary">{{ PAGES.HR.LEAVES.DESCRIPTION }}</p>
      </div>
      <button class="btn btn-primary" @click="showApplyModal = true">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" x2="12" y1="5" y2="19" />
          <line x1="5" x2="19" y1="12" y2="12" />
        </svg>
        {{ PAGES.HR.LEAVES.APPLY_LEAVE }}
      </button>
    </header>

    <!-- Leave Balance Cards -->
    <section class="balance-section">
      <h2 class="section-title">{{ PAGES.HR.LEAVES.LEAVE_BALANCE }}</h2>
      <div class="balance-grid">
        <div
          v-for="option in leaveTypeOptions"
          :key="option.value"
          class="balance-card"
          :style="{ '--accent-color': option.color }"
        >
          <div class="balance-header">
            <span class="balance-type">{{ option.label }}</span>
            <div class="balance-indicator" :style="{ background: option.color }"></div>
          </div>
          <div class="balance-numbers">
            <div class="balance-remaining">
              <span class="number">{{ getBalance(option.value).remaining }}</span>
              <span class="unit">天</span>
            </div>
            <div class="balance-detail">
              <span>{{ PAGES.HR.LEAVES.TOTAL_DAYS }}: {{ getBalance(option.value).total }}</span>
              <span>{{ PAGES.HR.LEAVES.USED_DAYS }}: {{ getBalance(option.value).used }}</span>
            </div>
          </div>
          <div class="balance-bar">
            <div
              class="bar-fill"
              :style="{
                width: `${getBalance(option.value).total > 0 ? (getBalance(option.value).used / getBalance(option.value).total) * 100 : 0}%`,
                background: option.color
              }"
            ></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Tabs -->
    <div class="tabs-container">
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'my-leaves' }]"
          @click="activeTab = 'my-leaves'"
        >
          {{ PAGES.HR.LEAVES.MY_LEAVES }}
        </button>
        <button
          :class="['tab', { active: activeTab === 'approve' }]"
          @click="activeTab = 'approve'"
        >
          {{ PAGES.HR.LEAVES.PENDING_APPROVAL }}
          <span v-if="pendingApprovals.length > 0" class="tab-badge">{{ pendingApprovals.length }}</span>
        </button>
        <button
          :class="['tab', { active: activeTab === 'balance' }]"
          @click="activeTab = 'balance'"
        >
          休假餘額明細
        </button>
      </div>
    </div>

    <!-- My Leaves Tab -->
    <div v-if="activeTab === 'my-leaves'" class="tab-content">
      <!-- Filters -->
      <div class="filters-bar">
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <span class="result-count text-secondary">
          共 {{ leavesTotalCount }} 筆
        </span>
      </div>

      <!-- Leave Requests List -->
      <LoadingState v-if="isLeavesLoading" />

      <EmptyState
        v-else-if="leaveRequests.length === 0"
        :title="PAGES.HR.LEAVES.NO_LEAVES"
        icon="calendar"
        :action-label="PAGES.HR.LEAVES.APPLY_LEAVE"
        @action="showApplyModal = true"
      />

      <div v-else class="leaves-list">
        <div
          v-for="(leave, index) in leaveRequests"
          :key="leave.id"
          class="leave-card"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="leave-header">
            <div class="leave-type-badge" :style="{ background: getLeaveTypeColor(leave.leave_type) }">
              {{ getLeaveTypeLabel(leave.leave_type) }}
            </div>
            <AppBadge
              :label="getStatusBadgeConfig(leave.leave_status).label"
              :variant="getStatusBadgeConfig(leave.leave_status).variant"
            />
          </div>

          <div class="leave-body">
            <div class="leave-dates">
              <div class="date-range">
                <span class="date">{{ formatDate(leave.start_date) }}</span>
                <span class="date-separator">—</span>
                <span class="date">{{ formatDate(leave.end_date) }}</span>
              </div>
              <div class="days-count">
                {{ leave.days_requested || calculateDays }} 天
                <span v-if="leave.is_half_day" class="half-day-badge">
                  ({{ leave.half_day_type === 'AM' ? '上午' : '下午' }})
                </span>
              </div>
            </div>

            <p v-if="leave.reason" class="leave-reason">{{ leave.reason }}</p>

            <div class="leave-meta">
              <span class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {{ formatDateTime(leave.submitted_at || leave.date_created) }}
              </span>
              <span v-if="leave.approver" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {{ (leave.approver as { full_name: string }).full_name }}
              </span>
            </div>
          </div>

          <div class="leave-actions">
            <button class="action-btn" title="查看歷程" @click="viewHistory(leave.id)">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            <button
              v-if="leave.leave_status === 'PENDING'"
              class="action-btn danger"
              title="取消申請"
              @click="handleCancel(leave.id)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" x2="9" y1="9" y2="15" />
                <line x1="9" x2="15" y1="9" y2="15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <DataPagination
        v-if="totalPages > 1"
        v-model="currentPage"
        :total-pages="totalPages"
      />
    </div>

    <!-- Approve Tab -->
    <div v-if="activeTab === 'approve'" class="tab-content">
      <EmptyState
        v-if="pendingApprovals.length === 0"
        title="目前沒有待審核的申請"
        icon="check"
      />

      <div v-else class="leaves-list">
        <div
          v-for="(leave, index) in pendingApprovals"
          :key="leave.id"
          class="leave-card approval-card"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="leave-header">
            <div class="applicant-info">
              <div class="applicant-avatar">
                {{ ((leave.employee as { full_name: string })?.full_name || '?')[0] }}
              </div>
              <div class="applicant-details">
                <span class="applicant-name">{{ (leave.employee as { full_name: string })?.full_name }}</span>
                <span class="applicant-code">{{ (leave.employee as { employee_code: string })?.employee_code }}</span>
              </div>
            </div>
            <div class="leave-type-badge" :style="{ background: getLeaveTypeColor(leave.leave_type) }">
              {{ getLeaveTypeLabel(leave.leave_type) }}
            </div>
          </div>

          <div class="leave-body">
            <div class="leave-dates">
              <div class="date-range">
                <span class="date">{{ formatDate(leave.start_date) }}</span>
                <span class="date-separator">—</span>
                <span class="date">{{ formatDate(leave.end_date) }}</span>
              </div>
              <div class="days-count">{{ leave.days_requested }} 天</div>
            </div>

            <p v-if="leave.reason" class="leave-reason">{{ leave.reason }}</p>
          </div>

          <div class="approval-actions">
            <button class="btn btn-success" @click="openReviewModal(leave, 'APPROVE')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {{ PAGES.HR.LEAVES.APPROVE }}
            </button>
            <button class="btn btn-error-outline" @click="openReviewModal(leave, 'REJECT')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
              {{ PAGES.HR.LEAVES.REJECT }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Balance Detail Tab -->
    <div v-if="activeTab === 'balance'" class="tab-content">
      <div class="balance-detail-section">
        <h3 class="section-subtitle">{{ new Date().getFullYear() }} 年度休假統計</h3>

        <div class="balance-table">
          <div class="table-header">
            <div class="table-cell">假別</div>
            <div class="table-cell">年度總額</div>
            <div class="table-cell">已使用</div>
            <div class="table-cell">待審核</div>
            <div class="table-cell">剩餘</div>
            <div class="table-cell">使用率</div>
          </div>
          <div
            v-for="option in leaveTypeOptions"
            :key="option.value"
            class="table-row"
          >
            <div class="table-cell">
              <div class="type-badge-sm" :style="{ background: option.color }">
                {{ option.label }}
              </div>
            </div>
            <div class="table-cell">{{ getBalance(option.value).total }} 天</div>
            <div class="table-cell">{{ getBalance(option.value).used }} 天</div>
            <div class="table-cell">
              {{ leaveBalances.find(b => b.leave_type === option.value)?.pending_days || 0 }} 天
            </div>
            <div class="table-cell">
              <strong :style="{ color: getBalance(option.value).remaining < 1 ? '#ff3b30' : 'inherit' }">
                {{ getBalance(option.value).remaining }} 天
              </strong>
            </div>
            <div class="table-cell">
              <div class="usage-bar">
                <div
                  class="usage-fill"
                  :style="{
                    width: `${getBalance(option.value).total > 0 ? (getBalance(option.value).used / getBalance(option.value).total) * 100 : 0}%`,
                    background: option.color
                  }"
                ></div>
                <span class="usage-text">
                  {{ getBalance(option.value).total > 0 ? Math.round((getBalance(option.value).used / getBalance(option.value).total) * 100) : 0 }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="balance-summary">
          <div class="summary-card">
            <div class="summary-icon" style="background: rgba(0, 122, 255, 0.1); color: #007aff;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            </div>
            <div class="summary-content">
              <span class="summary-label">年度總額</span>
              <span class="summary-value">{{ leaveBalances.reduce((sum, b) => sum + b.total_days, 0) }} 天</span>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-icon" style="background: rgba(52, 199, 89, 0.1); color: #34c759;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div class="summary-content">
              <span class="summary-label">已使用</span>
              <span class="summary-value">{{ leaveBalances.reduce((sum, b) => sum + b.used_days, 0) }} 天</span>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-icon" style="background: rgba(255, 149, 0, 0.1); color: #ff9500;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div class="summary-content">
              <span class="summary-label">待審核</span>
              <span class="summary-value">{{ leaveBalances.reduce((sum, b) => sum + b.pending_days, 0) }} 天</span>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-icon" style="background: rgba(88, 86, 214, 0.1); color: #5856d6;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div class="summary-content">
              <span class="summary-label">剩餘可用</span>
              <span class="summary-value">
                {{ leaveBalances.reduce((sum, b) => sum + (b.total_days - b.used_days - b.pending_days), 0) }} 天
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Apply Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showApplyModal" class="modal-overlay" @click.self="showApplyModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3>{{ PAGES.HR.LEAVES.APPLY_LEAVE }}</h3>
              <button class="modal-close" @click="showApplyModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>

            <div class="modal-body">
              <!-- Leave Type -->
              <div class="form-group">
                <label class="form-label">{{ PAGES.HR.LEAVES.SELECT_LEAVE_TYPE }}</label>
                <div class="type-selector">
                  <button
                    v-for="option in leaveTypeOptions"
                    :key="option.value"
                    :class="['type-option', { active: applyForm.leaveType === option.value }]"
                    :style="{ '--type-color': option.color }"
                    @click="applyForm.leaveType = option.value as LeaveType"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <div class="type-balance">
                  剩餘 {{ getBalance(applyForm.leaveType).remaining }} 天
                </div>
              </div>

              <!-- Date Range -->
              <div class="form-group">
                <label class="form-label">{{ PAGES.HR.LEAVES.SELECT_DATE_RANGE }}</label>
                <div class="date-inputs">
                  <input
                    v-model="applyForm.startDate"
                    type="date"
                    class="input"
                    :min="new Date().toISOString().split('T')[0]"
                  />
                  <span class="date-to">至</span>
                  <input
                    v-model="applyForm.endDate"
                    type="date"
                    class="input"
                    :min="applyForm.startDate || new Date().toISOString().split('T')[0]"
                  />
                </div>
              </div>

              <!-- Half Day -->
              <div class="form-group">
                <label class="checkbox-label">
                  <input v-model="applyForm.isHalfDay" type="checkbox" class="checkbox" />
                  <span>半天假</span>
                </label>
                <div v-if="applyForm.isHalfDay" class="half-day-options">
                  <label :class="['radio-label', { active: applyForm.halfDayType === 'AM' }]">
                    <input v-model="applyForm.halfDayType" type="radio" value="AM" />
                    上午
                  </label>
                  <label :class="['radio-label', { active: applyForm.halfDayType === 'PM' }]">
                    <input v-model="applyForm.halfDayType" type="radio" value="PM" />
                    下午
                  </label>
                </div>
              </div>

              <!-- Days Summary -->
              <div v-if="calculateDays > 0" class="days-summary">
                <span>申請天數：</span>
                <strong>{{ calculateDays }} 天</strong>
              </div>

              <!-- Reason -->
              <div class="form-group">
                <label class="form-label">{{ PAGES.HR.LEAVES.REASON }}</label>
                <textarea
                  v-model="applyForm.reason"
                  class="input textarea"
                  rows="3"
                  placeholder="請輸入請假原因..."
                ></textarea>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showApplyModal = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="isSubmitting || !applyForm.startDate || !applyForm.endDate"
                @click="handleApply"
              >
                <span v-if="isSubmitting" class="btn-spinner"></span>
                <template v-else>{{ PAGES.HR.LEAVES.SUBMIT }}</template>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- History Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showHistoryModal" class="modal-overlay" @click.self="showHistoryModal = false">
          <div class="modal-content modal-sm">
            <div class="modal-header">
              <h3>{{ PAGES.HR.LEAVES.APPROVAL_HISTORY }}</h3>
              <button class="modal-close" @click="showHistoryModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>

            <div class="modal-body">
              <div class="timeline">
                <div
                  v-for="log in selectedLeaveHistory"
                  :key="log.id"
                  class="timeline-item"
                >
                  <div class="timeline-dot" :class="log.action.toLowerCase()"></div>
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <span class="timeline-action">{{ getActionLabel(log.action) }}</span>
                      <span class="timeline-time">{{ formatDateTime(log.date_created) }}</span>
                    </div>
                    <div v-if="log.action_by" class="timeline-actor">
                      {{ typeof log.action_by === 'object' ? (log.action_by as { full_name: string }).full_name : '系統' }}
                    </div>
                    <p v-if="log.notes" class="timeline-notes">{{ log.notes }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Review Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showReviewModal && reviewData" class="modal-overlay" @click.self="showReviewModal = false">
          <div class="modal-content modal-sm">
            <div class="modal-header">
              <h3>{{ reviewData.action === 'APPROVE' ? '核准' : '駁回' }}休假申請</h3>
              <button class="modal-close" @click="showReviewModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>

            <div class="modal-body">
              <div class="review-confirmation">
                <div
                  class="review-icon"
                  :class="reviewData.action === 'APPROVE' ? 'approve' : 'reject'"
                >
                  <svg v-if="reviewData.action === 'APPROVE'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" x2="6" y1="6" y2="18" />
                    <line x1="6" x2="18" y1="6" y2="18" />
                  </svg>
                </div>
                <p class="review-message">
                  確定要{{ reviewData.action === 'APPROVE' ? '核准' : '駁回' }}
                  <strong>{{ reviewData.employeeName }}</strong> 的休假申請嗎？
                </p>
              </div>

              <div class="form-group">
                <label class="form-label">審核備註（選填）</label>
                <textarea
                  v-model="reviewNotes"
                  class="input textarea"
                  rows="3"
                  :placeholder="reviewData.action === 'APPROVE' ? '例：請注意工作交接' : '例：請重新選擇日期'"
                ></textarea>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showReviewModal = false">取消</button>
              <button
                :class="['btn', reviewData.action === 'APPROVE' ? 'btn-success' : 'btn-error']"
                :disabled="isReviewing"
                @click="submitReview"
              >
                <span v-if="isReviewing" class="btn-spinner"></span>
                <template v-else>確認{{ reviewData.action === 'APPROVE' ? '核准' : '駁回' }}</template>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </PageContainer>
</template>

<style scoped>
.leaves-page {
  max-width: 1000px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  animation: fadeIn 0.6s var(--ease-out) backwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  margin-bottom: var(--space-md);
  transition: opacity var(--duration-fast);
}

.back-link:hover {
  opacity: 0.7;
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

/* Balance Section */
.balance-section {
  margin-bottom: var(--space-2xl);
  animation: sectionAppear 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes sectionAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: var(--space-lg);
  color: var(--color-text-primary);
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg);
}

.balance-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
}

.balance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.balance-type {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.balance-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.balance-numbers {
  margin-bottom: var(--space-md);
}

.balance-remaining {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}

.balance-remaining .number {
  font-size: 36px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1;
}

.balance-remaining .unit {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.balance-detail {
  display: flex;
  gap: var(--space-md);
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.balance-bar {
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.5s var(--ease-out);
}

/* Tabs */
.tabs-container {
  margin-bottom: var(--space-xl);
  animation: sectionAppear 0.6s var(--ease-out) 0.15s backwards;
}

.tabs {
  display: flex;
  gap: var(--space-sm);
  background: var(--color-bg-secondary);
  padding: var(--space-xs);
  border-radius: var(--radius-lg);
}

.tab {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.tab:hover {
  color: var(--color-text-primary);
}

.tab.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.tab-badge {
  background: var(--color-error);
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-full);
}

/* Tab Content */
.tab-content {
  animation: contentAppear 0.4s var(--ease-out);
}

@keyframes contentAppear {
  from {
    opacity: 0;
  }
}

/* Filters */
.filters-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.filter-select {
  min-width: 140px;
}

.result-count {
  font-size: 14px;
}

/* Leaves List */
.leaves-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.leave-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  animation: cardAppear 0.4s var(--ease-out) backwards;
}

@keyframes cardAppear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.leave-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.leave-type-badge {
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.leave-body {
  margin-bottom: var(--space-md);
}

.leave-dates {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.date-range {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.date {
  font-weight: 500;
  color: var(--color-text-primary);
}

.date-separator {
  color: var(--color-text-tertiary);
}

.days-count {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.half-day-badge {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.leave-reason {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.leave-meta {
  display: flex;
  gap: var(--space-lg);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.leave-actions {
  display: flex;
  gap: var(--space-xs);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-divider);
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.action-btn.danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

/* Approval Card */
.approval-card .leave-header {
  flex-wrap: wrap;
  gap: var(--space-md);
}

.applicant-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.applicant-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #5856d6, #af52de);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

.applicant-details {
  display: flex;
  flex-direction: column;
}

.applicant-name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.applicant-code {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.approval-actions {
  display: flex;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

.btn-success {
  background: #34c759;
  color: white;
}

.btn-success:hover {
  background: #30d158;
}

.btn-error-outline {
  background: transparent;
  border: 1px solid var(--color-error);
  color: var(--color-error);
}

.btn-error-outline:hover {
  background: rgba(255, 59, 48, 0.1);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: var(--space-lg);
}

.modal-content {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-sm {
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--color-divider);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.modal-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast);
}

.modal-close:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.modal-body {
  padding: var(--space-xl);
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  border-top: 1px solid var(--color-divider);
}

/* Form */
.form-group {
  margin-bottom: var(--space-xl);
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
}

.type-selector {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.type-option {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.type-option:hover {
  border-color: var(--type-color);
  color: var(--type-color);
}

.type-option.active {
  background: var(--type-color);
  border-color: var(--type-color);
  color: white;
}

.type-balance {
  margin-top: var(--space-sm);
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.date-inputs {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.date-inputs .input {
  flex: 1;
}

.date-to {
  color: var(--color-text-tertiary);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent);
}

.half-day-options {
  display: flex;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.radio-label {
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all var(--duration-fast);
}

.radio-label input {
  display: none;
}

.radio-label.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.days-summary {
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  text-align: center;
  margin-bottom: var(--space-xl);
}

.days-summary strong {
  color: var(--color-accent);
  font-size: 18px;
}

.textarea {
  resize: vertical;
  min-height: 80px;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Timeline */
.timeline {
  position: relative;
  padding-left: var(--space-xl);
}

.timeline::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--color-border);
}

.timeline-item {
  position: relative;
  padding-bottom: var(--space-lg);
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-dot {
  position: absolute;
  left: -22px;
  top: 4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border);
}

.timeline-dot.submit {
  background: #007aff;
  border-color: #007aff;
}

.timeline-dot.approve {
  background: #34c759;
  border-color: #34c759;
}

.timeline-dot.reject {
  background: #ff3b30;
  border-color: #ff3b30;
}

.timeline-dot.cancel {
  background: #8e8e93;
  border-color: #8e8e93;
}

.timeline-content {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xs);
}

.timeline-action {
  font-weight: 600;
  color: var(--color-text-primary);
}

.timeline-time {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.timeline-actor {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.timeline-notes {
  font-size: 13px;
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* Review Modal */
.review-confirmation {
  text-align: center;
  margin-bottom: var(--space-xl);
}

.review-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

.review-icon.approve {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.review-icon.reject {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
}

.review-message {
  font-size: 15px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.review-message strong {
  color: var(--color-text-primary);
}

.btn-error {
  background: var(--color-error);
  color: white;
}

.btn-error:hover {
  background: #e6352a;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s var(--ease-out);
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s var(--ease-out);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(20px);
}

/* Balance Detail Tab */
.balance-detail-section {
  animation: contentAppear 0.4s var(--ease-out);
}

.section-subtitle {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-xl);
}

.balance-table {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  margin-bottom: var(--space-2xl);
}

.table-header {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr 1.5fr;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.table-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr 1.5fr;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--color-divider);
  transition: background var(--duration-fast);
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: var(--color-bg-secondary);
}

.table-cell {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--color-text-primary);
}

.type-badge-sm {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.usage-bar {
  position: relative;
  flex: 1;
  height: 24px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.usage-fill {
  height: 100%;
  border-radius: var(--radius-md);
  transition: width 0.5s var(--ease-out);
}

.usage-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.balance-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-lg);
}

.summary-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.summary-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.summary-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.summary-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Responsive */
@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-lg);
  }

  .page-header .btn {
    width: 100%;
  }

  .balance-grid {
    grid-template-columns: 1fr;
  }

  .leave-dates {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
  }

  .leave-meta {
    flex-direction: column;
    gap: var(--space-sm);
  }

  .approval-actions {
    flex-direction: column;
  }

  .approval-actions .btn {
    width: 100%;
  }

  .date-inputs {
    flex-direction: column;
  }

  .date-to {
    display: none;
  }

  .table-header,
  .table-row {
    grid-template-columns: 1fr;
    gap: var(--space-sm);
  }

  .table-cell {
    justify-content: space-between;
  }

  .table-cell::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--color-text-secondary);
    font-size: 12px;
  }

  .balance-summary {
    grid-template-columns: 1fr;
  }
}
</style>
