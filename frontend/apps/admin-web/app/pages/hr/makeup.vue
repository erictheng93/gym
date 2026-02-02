<script setup lang="ts">
/**
 * 補打卡申請頁面
 */
import { PAGES } from '~/constants'
import type { MakeupRequest, MakeupApprovalLog } from '~/types/schema'

definePageMeta({
  middleware: 'auth'
})

const { currentEmployee, checkAuth } = useAuth()
const {
  makeupRequests,
  pendingMakeupApprovals,
  isMakeupLoading,
  makeupTotalCount,
  fetchMakeupRequests,
  fetchPendingMakeupApprovals,
  applyMakeup,
  reviewMakeup,
  cancelMakeup,
  fetchMakeupApprovalHistory
} = useMakeupRequests()

const activeTab = ref<'my-requests' | 'approve'>('my-requests')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = 10

// 申請表單
const applyForm = ref({
  targetDate: '',
  makeupType: 'BOTH' as 'CHECK_IN' | 'CHECK_OUT' | 'BOTH',
  requestedCheckIn: '',
  requestedCheckOut: '',
  reason: ''
})

const isSubmitting = ref(false)
const showApplyModal = ref(false)
const showHistoryModal = ref(false)
const showReviewModal = ref(false)
const selectedHistory = ref<MakeupApprovalLog[]>([])
const reviewData = ref<{ requestId: string; action: 'APPROVE' | 'REJECT'; employeeName: string } | null>(null)
const reviewNotes = ref('')
const isReviewing = ref(false)

// 補打卡類型選項
const makeupTypeOptions = [
  { value: 'CHECK_IN', label: PAGES.HR.MAKEUP.CHECK_IN, color: '#34c759' },
  { value: 'CHECK_OUT', label: PAGES.HR.MAKEUP.CHECK_OUT, color: '#ff9500' },
  { value: 'BOTH', label: PAGES.HR.MAKEUP.BOTH, color: '#007aff' }
]

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'PENDING', label: PAGES.HR.MAKEUP.PENDING_APPROVAL },
  { value: 'APPROVED', label: PAGES.HR.MAKEUP.APPROVED },
  { value: 'REJECTED', label: PAGES.HR.MAKEUP.REJECTED },
  { value: 'CANCELLED', label: PAGES.HR.MAKEUP.CANCELLED }
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
    fetchMakeupRequests({
      employeeId: currentEmployee.value.id,
      status: selectedStatus.value || undefined,
      page: currentPage.value,
      limit: pageSize
    }),
    fetchPendingMakeupApprovals(currentEmployee.value.id)
  ])
}

// 監聽篩選條件變化
watch([selectedStatus, currentPage], () => {
  if (currentEmployee.value?.id) {
    fetchMakeupRequests({
      employeeId: currentEmployee.value.id,
      status: selectedStatus.value || undefined,
      page: currentPage.value,
      limit: pageSize
    })
  }
})

// 取得類型標籤
const getMakeupTypeLabel = (type: string) => {
  return makeupTypeOptions.find(o => o.value === type)?.label || type
}

const getMakeupTypeColor = (type: string) => {
  return makeupTypeOptions.find(o => o.value === type)?.color || '#8e8e93'
}

// 取得狀態 Badge
const getStatusBadgeConfig = (status: string): { label: string; variant: 'success' | 'warning' | 'error' | 'default' } => {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
    PENDING: { label: PAGES.HR.MAKEUP.PENDING_APPROVAL, variant: 'warning' },
    APPROVED: { label: PAGES.HR.MAKEUP.APPROVED, variant: 'success' },
    REJECTED: { label: PAGES.HR.MAKEUP.REJECTED, variant: 'error' },
    CANCELLED: { label: PAGES.HR.MAKEUP.CANCELLED, variant: 'default' }
  }
  return map[status] || { label: status, variant: 'default' }
}

// 格式化日期
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short'
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

const formatTime = (timeStr: string | null) => {
  if (!timeStr) return '--:--'
  return timeStr.substring(0, 5)
}

// 取得今天之前的最大日期
const maxDate = computed(() => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toISOString().split('T')[0]
})

// 提交申請
const handleApply = async () => {
  if (!currentEmployee.value?.id || !currentEmployee.value?.branch_id || isSubmitting.value) return
  if (!applyForm.value.targetDate) {
    alert('請選擇補打卡日期')
    return
  }
  if (!applyForm.value.reason.trim()) {
    alert('請輸入補打卡原因')
    return
  }

  // 驗證時間
  if ((applyForm.value.makeupType === 'CHECK_IN' || applyForm.value.makeupType === 'BOTH') && !applyForm.value.requestedCheckIn) {
    alert('請輸入上班時間')
    return
  }
  if ((applyForm.value.makeupType === 'CHECK_OUT' || applyForm.value.makeupType === 'BOTH') && !applyForm.value.requestedCheckOut) {
    alert('請輸入下班時間')
    return
  }

  isSubmitting.value = true
  try {
    await applyMakeup({
      employeeId: currentEmployee.value.id,
      branchId: currentEmployee.value.branch_id,
      targetDate: applyForm.value.targetDate,
      makeupType: applyForm.value.makeupType,
      requestedCheckIn: applyForm.value.requestedCheckIn || undefined,
      requestedCheckOut: applyForm.value.requestedCheckOut || undefined,
      reason: applyForm.value.reason
    })

    // 重置表單
    applyForm.value = {
      targetDate: '',
      makeupType: 'BOTH',
      requestedCheckIn: '',
      requestedCheckOut: '',
      reason: ''
    }

    showApplyModal.value = false
    useToast().success(MESSAGES.SUCCESS.MAKEUP_CREATED)
    await loadData()
  } catch (error) {
    console.error('Apply makeup failed:', error)
    useToast().error(MESSAGES.ERRORS.MAKEUP_CREATE_FAILED)
  } finally {
    isSubmitting.value = false
  }
}

// 取消申請
const handleCancel = async (requestId: string) => {
  if (!currentEmployee.value?.id) return

  const { confirm } = useConfirm()
  const confirmed = await confirm({
    title: '取消補打卡申請',
    message: '確定要取消此補打卡申請嗎？此操作將通知相關人員。',
    type: 'warning'
  })

  if (!confirmed) return

  try {
    await cancelMakeup(requestId, currentEmployee.value.id)
    useToast().success(MESSAGES.SUCCESS.MAKEUP_CANCELLED)
    await loadData()
  } catch (error: unknown) {
    console.error('Cancel makeup failed:', error)
    const errorMessage = error instanceof Error ? error.message : MESSAGES.ERRORS.MAKEUP_CANCEL_FAILED
    useToast().error(errorMessage)
  }
}

// 開啟審核 Modal
const openReviewModal = (request: MakeupRequest, action: 'APPROVE' | 'REJECT') => {
  reviewData.value = {
    requestId: request.id,
    action,
    employeeName: (request.employee as { full_name: string })?.full_name || '員工'
  }
  reviewNotes.value = ''
  showReviewModal.value = true
}

// 提交審核
const submitReview = async () => {
  if (!currentEmployee.value?.id || !reviewData.value || isReviewing.value) return

  isReviewing.value = true
  try {
    await reviewMakeup(
      reviewData.value.requestId,
      currentEmployee.value.id,
      reviewData.value.action,
      reviewNotes.value || undefined
    )
    const successMessage = reviewData.value.action === 'APPROVE'
      ? MESSAGES.SUCCESS.MAKEUP_APPROVED
      : MESSAGES.SUCCESS.MAKEUP_REJECTED
    useToast().success(successMessage)
    showReviewModal.value = false
    reviewData.value = null
    reviewNotes.value = ''
    await loadData()
  } catch (error) {
    console.error('Review failed:', error)
    useToast().error(MESSAGES.ERRORS.MAKEUP_REVIEW_FAILED)
  } finally {
    isReviewing.value = false
  }
}

// 查看審核歷程
const viewHistory = async (requestId: string) => {
  selectedHistory.value = await fetchMakeupApprovalHistory(requestId)
  showHistoryModal.value = true
}

// 總頁數
const totalPages = computed(() => Math.ceil(makeupTotalCount.value / pageSize))

// 取得動作標籤
const getActionLabel = (action: string) => {
  const map: Record<string, string> = {
    SUBMIT: '提交申請',
    APPROVE: '核准',
    REJECT: '駁回',
    CANCEL: '取消'
  }
  return map[action] || action
}
</script>

<template>
  <PageContainer class="makeup-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <NuxtLink to="/hr" class="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {{ PAGES.HR.TITLE }}
        </NuxtLink>
        <h1 class="text-headline">{{ PAGES.HR.MAKEUP.TITLE }}</h1>
        <p class="text-body text-secondary">{{ PAGES.HR.MAKEUP.DESCRIPTION }}</p>
      </div>
      <button class="btn btn-primary" @click="showApplyModal = true">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" x2="12" y1="5" y2="19" />
          <line x1="5" x2="19" y1="12" y2="12" />
        </svg>
        {{ PAGES.HR.MAKEUP.APPLY_MAKEUP }}
      </button>
    </header>

    <!-- Tabs -->
    <div class="tabs-container">
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'my-requests' }]"
          @click="activeTab = 'my-requests'"
        >
          {{ PAGES.HR.MAKEUP.MY_REQUESTS }}
        </button>
        <button
          v-if="pendingMakeupApprovals.length > 0"
          :class="['tab', { active: activeTab === 'approve' }]"
          @click="activeTab = 'approve'"
        >
          {{ PAGES.HR.MAKEUP.PENDING_APPROVAL }}
          <span class="tab-badge">{{ pendingMakeupApprovals.length }}</span>
        </button>
      </div>
    </div>

    <!-- My Requests Tab -->
    <div v-if="activeTab === 'my-requests'" class="tab-content">
      <!-- Filters -->
      <div class="filters-bar">
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <span class="result-count text-secondary">
          共 {{ makeupTotalCount }} 筆
        </span>
      </div>

      <!-- Requests List -->
      <LoadingState v-if="isMakeupLoading" />

      <EmptyState
        v-else-if="makeupRequests.length === 0"
        :title="PAGES.HR.MAKEUP.NO_REQUESTS"
        icon="calendar"
        :action-label="PAGES.HR.MAKEUP.APPLY_MAKEUP"
        @action="showApplyModal = true"
      />

      <div v-else class="requests-list">
        <div
          v-for="(request, index) in makeupRequests"
          :key="request.id"
          class="request-card"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="request-header">
            <div class="request-type-badge" :style="{ background: getMakeupTypeColor(request.makeup_type) }">
              {{ getMakeupTypeLabel(request.makeup_type) }}
            </div>
            <AppBadge
              :label="getStatusBadgeConfig(request.request_status).label"
              :variant="getStatusBadgeConfig(request.request_status).variant"
            />
          </div>

          <div class="request-body">
            <div class="request-date">
              <div class="date-label">{{ PAGES.HR.MAKEUP.TARGET_DATE }}</div>
              <div class="date-value">{{ formatDate(request.target_date) }}</div>
            </div>

            <div class="request-times">
              <div v-if="request.makeup_type === 'CHECK_IN' || request.makeup_type === 'BOTH'" class="time-item">
                <span class="time-label">{{ PAGES.HR.MAKEUP.REQUESTED_CHECK_IN }}</span>
                <span class="time-value">{{ formatTime(request.requested_check_in) }}</span>
              </div>
              <div v-if="request.makeup_type === 'CHECK_OUT' || request.makeup_type === 'BOTH'" class="time-item">
                <span class="time-label">{{ PAGES.HR.MAKEUP.REQUESTED_CHECK_OUT }}</span>
                <span class="time-value">{{ formatTime(request.requested_check_out) }}</span>
              </div>
            </div>

            <p class="request-reason">{{ request.reason }}</p>

            <div class="request-meta">
              <span class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {{ formatDateTime(request.submitted_at || request.date_created) }}
              </span>
              <span v-if="request.approver" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {{ (request.approver as { full_name: string }).full_name }}
              </span>
            </div>
          </div>

          <div class="request-actions">
            <button class="action-btn" title="查看歷程" @click="viewHistory(request.id)">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            <button
              v-if="request.request_status === 'PENDING'"
              class="action-btn danger"
              title="取消申請"
              @click="handleCancel(request.id)"
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
        v-if="pendingMakeupApprovals.length === 0"
        title="目前沒有待審核的申請"
        icon="check"
      />

      <div v-else class="requests-list">
        <div
          v-for="(request, index) in pendingMakeupApprovals"
          :key="request.id"
          class="request-card approval-card"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="request-header">
            <div class="applicant-info">
              <div class="applicant-avatar">
                {{ ((request.employee as { full_name: string })?.full_name || '?')[0] }}
              </div>
              <div class="applicant-details">
                <span class="applicant-name">{{ (request.employee as { full_name: string })?.full_name }}</span>
                <span class="applicant-code">{{ (request.employee as { employee_code: string })?.employee_code }}</span>
              </div>
            </div>
            <div class="request-type-badge" :style="{ background: getMakeupTypeColor(request.makeup_type) }">
              {{ getMakeupTypeLabel(request.makeup_type) }}
            </div>
          </div>

          <div class="request-body">
            <div class="request-date">
              <div class="date-label">{{ PAGES.HR.MAKEUP.TARGET_DATE }}</div>
              <div class="date-value">{{ formatDate(request.target_date) }}</div>
            </div>

            <div class="request-times">
              <div v-if="request.makeup_type === 'CHECK_IN' || request.makeup_type === 'BOTH'" class="time-item">
                <span class="time-label">{{ PAGES.HR.MAKEUP.REQUESTED_CHECK_IN }}</span>
                <span class="time-value">{{ formatTime(request.requested_check_in) }}</span>
              </div>
              <div v-if="request.makeup_type === 'CHECK_OUT' || request.makeup_type === 'BOTH'" class="time-item">
                <span class="time-label">{{ PAGES.HR.MAKEUP.REQUESTED_CHECK_OUT }}</span>
                <span class="time-value">{{ formatTime(request.requested_check_out) }}</span>
              </div>
            </div>

            <p class="request-reason">{{ request.reason }}</p>
          </div>

          <div class="approval-actions">
            <button class="btn btn-success" @click="openReviewModal(request, 'APPROVE')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {{ PAGES.HR.MAKEUP.APPROVE }}
            </button>
            <button class="btn btn-error-outline" @click="openReviewModal(request, 'REJECT')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
              {{ PAGES.HR.MAKEUP.REJECT }}
            </button>
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
              <h3>{{ PAGES.HR.MAKEUP.APPLY_MAKEUP }}</h3>
              <button class="modal-close" @click="showApplyModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>

            <div class="modal-body">
              <!-- Target Date -->
              <div class="form-group">
                <label class="form-label">{{ PAGES.HR.MAKEUP.TARGET_DATE }}</label>
                <input
                  v-model="applyForm.targetDate"
                  type="date"
                  class="input"
                  :max="maxDate"
                />
                <p class="form-hint">只能補打過去日期的考勤紀錄</p>
              </div>

              <!-- Makeup Type -->
              <div class="form-group">
                <label class="form-label">{{ PAGES.HR.MAKEUP.MAKEUP_TYPE }}</label>
                <div class="type-selector">
                  <button
                    v-for="option in makeupTypeOptions"
                    :key="option.value"
                    :class="['type-option', { active: applyForm.makeupType === option.value }]"
                    :style="{ '--type-color': option.color }"
                    @click="applyForm.makeupType = option.value as 'CHECK_IN' | 'CHECK_OUT' | 'BOTH'"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <!-- Requested Times -->
              <div class="form-group">
                <label class="form-label">{{ PAGES.HR.MAKEUP.REQUESTED_TIME }}</label>
                <div class="time-inputs">
                  <div v-if="applyForm.makeupType === 'CHECK_IN' || applyForm.makeupType === 'BOTH'" class="time-input-group">
                    <label>{{ PAGES.HR.MAKEUP.REQUESTED_CHECK_IN }}</label>
                    <input
                      v-model="applyForm.requestedCheckIn"
                      type="time"
                      class="input"
                    />
                  </div>
                  <div v-if="applyForm.makeupType === 'CHECK_OUT' || applyForm.makeupType === 'BOTH'" class="time-input-group">
                    <label>{{ PAGES.HR.MAKEUP.REQUESTED_CHECK_OUT }}</label>
                    <input
                      v-model="applyForm.requestedCheckOut"
                      type="time"
                      class="input"
                    />
                  </div>
                </div>
              </div>

              <!-- Reason -->
              <div class="form-group">
                <label class="form-label">{{ PAGES.HR.MAKEUP.REASON }}</label>
                <textarea
                  v-model="applyForm.reason"
                  class="input textarea"
                  rows="3"
                  :placeholder="PAGES.HR.MAKEUP.REASON_PLACEHOLDER"
                ></textarea>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showApplyModal = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="isSubmitting || !applyForm.targetDate || !applyForm.reason"
                @click="handleApply"
              >
                <span v-if="isSubmitting" class="btn-spinner"></span>
                <template v-else>{{ PAGES.HR.MAKEUP.SUBMIT }}</template>
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
              <h3>{{ PAGES.HR.MAKEUP.APPROVAL_HISTORY }}</h3>
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
                  v-for="log in selectedHistory"
                  :key="log.id"
                  class="timeline-item"
                >
                  <div class="timeline-dot" :class="log.action.toLowerCase()"></div>
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <span class="timeline-action">{{ getActionLabel(log.action) }}</span>
                      <span class="timeline-time">{{ formatDateTime(log.date_created) }}</span>
                    </div>
                    <div v-if="log.actor" class="timeline-actor">
                      {{ (log.actor as { full_name: string }).full_name }}
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
              <h3>{{ reviewData.action === 'APPROVE' ? '核准' : '駁回' }}補打卡申請</h3>
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
                  <strong>{{ reviewData.employeeName }}</strong> 的補打卡申請嗎？
                </p>
              </div>

              <div class="form-group">
                <label class="form-label">審核備註（選填）</label>
                <textarea
                  v-model="reviewNotes"
                  class="input textarea"
                  rows="3"
                  :placeholder="reviewData.action === 'APPROVE' ? '例：已確認考勤紀錄' : '例：請提供相關證明'"
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
.makeup-page {
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

/* Tabs */
.tabs-container {
  margin-bottom: var(--space-xl);
  animation: sectionAppear 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes sectionAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
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

/* Requests List */
.requests-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.request-card {
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

.request-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.request-type-badge {
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.request-body {
  margin-bottom: var(--space-md);
}

.request-date {
  margin-bottom: var(--space-md);
}

.date-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-xs);
}

.date-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.request-times {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-md);
}

.time-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.time-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.time-value {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
}

.request-reason {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.request-meta {
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

.request-actions {
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
.approval-card .request-header {
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

.form-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-xs);
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

.time-inputs {
  display: flex;
  gap: var(--space-lg);
}

.time-input-group {
  flex: 1;
}

.time-input-group label {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-xs);
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

@keyframes spin {
  to { transform: rotate(360deg); }
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

/* Responsive */
@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-lg);
  }

  .page-header .btn {
    width: 100%;
  }

  .request-times {
    flex-direction: column;
    gap: var(--space-sm);
  }

  .request-meta {
    flex-direction: column;
    gap: var(--space-sm);
  }

  .approval-actions {
    flex-direction: column;
  }

  .approval-actions .btn {
    width: 100%;
  }

  .time-inputs {
    flex-direction: column;
  }
}
</style>
