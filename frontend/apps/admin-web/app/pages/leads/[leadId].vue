<script setup lang="ts">
/**
 * 潛在客戶詳情頁面
 *
 * 顯示詳情 + 活動時間軸 + 轉換為會員
 */
import { MESSAGES } from '~/constants'
import { validateUUIDParam } from '~/utils/validation'

definePageMeta({
  middleware: 'auth',
  validate: validateUUIDParam('leadId')
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const {
  getLead,
  updateLead,
  deleteLead,
  addActivity,
  convertToMember,
  getStatusLabel,
  getStatusVariant,
  getSourceLabel
} = useLeads()
const { employees, fetchEmployees } = useEmployees()

const lead = ref<Awaited<ReturnType<typeof getLead>> | null>(null)
const isLoading = ref(true)
const isDeleting = ref(false)

const leadId = computed(() => route.params.leadId as string)

// Activity form state
const showActivityModal = ref(false)
const activityForm = ref({
  activity_type: 'CALL' as 'CALL' | 'SMS' | 'EMAIL' | 'VISIT' | 'TRIAL',
  content: '',
  result: '',
  next_action: '',
  next_action_date: ''
})
const isSubmittingActivity = ref(false)

// Convert modal state
const showConvertModal = ref(false)
const isConverting = ref(false)

// Status update modal
const showStatusModal = ref(false)
const newStatus = ref('')
const isUpdatingStatus = ref(false)

// Assign modal
const showAssignModal = ref(false)
const newAssigneeId = ref('')
const isAssigning = ref(false)

const loadLead = async () => {
  isLoading.value = true
  try {
    lead.value = await getLead(leadId.value)
  } catch (error) {
    console.error('Failed to load lead:', error)
    toast.error('載入潛在客戶資料失敗')
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadLead(), fetchEmployees()])
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Activity type options
const activityTypeOptions = [
  { value: 'CALL', label: '電話', icon: 'phone' },
  { value: 'SMS', label: '簡訊', icon: 'message' },
  { value: 'EMAIL', label: 'Email', icon: 'mail' },
  { value: 'VISIT', label: '到訪', icon: 'map-pin' },
  { value: 'TRIAL', label: '體驗', icon: 'calendar' }
]

const getActivityTypeLabel = (type: string) => {
  return activityTypeOptions.find(o => o.value === type)?.label || type
}

const getActivityTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    CALL: '#007aff',
    SMS: '#34c759',
    EMAIL: '#5856d6',
    VISIT: '#ff9500',
    TRIAL: '#af52de'
  }
  return colors[type] || '#8e8e93'
}

// Status options
const statusOptions = [
  { value: 'NEW', label: '新建' },
  { value: 'CONTACTED', label: '已聯繫' },
  { value: 'TRIAL_BOOKED', label: '已預約體驗' },
  { value: 'VISITED', label: '已到訪' },
  { value: 'CONVERTED', label: '已轉換' },
  { value: 'LOST', label: '已流失' }
]

// Add activity
const handleAddActivity = async () => {
  if (!activityForm.value.content) {
    toast.warning('請輸入活動內容')
    return
  }

  isSubmittingActivity.value = true
  try {
    await addActivity(leadId.value, {
      activity_type: activityForm.value.activity_type,
      content: activityForm.value.content,
      result: activityForm.value.result || undefined,
      next_action: activityForm.value.next_action || undefined,
      next_action_date: activityForm.value.next_action_date || undefined
    })
    toast.success('活動紀錄已新增')
    showActivityModal.value = false
    activityForm.value = {
      activity_type: 'CALL',
      content: '',
      result: '',
      next_action: '',
      next_action_date: ''
    }
    await loadLead()
  } catch (error) {
    console.error('Failed to add activity:', error)
    toast.error('新增活動紀錄失敗')
  } finally {
    isSubmittingActivity.value = false
  }
}

// Update status
const handleUpdateStatus = async () => {
  if (!newStatus.value) return

  isUpdatingStatus.value = true
  try {
    await updateLead(leadId.value, { status: newStatus.value })
    toast.success('狀態已更新')
    showStatusModal.value = false
    await loadLead()
  } catch (error) {
    console.error('Failed to update status:', error)
    toast.error('更新狀態失敗')
  } finally {
    isUpdatingStatus.value = false
  }
}

// Assign lead
const handleAssign = async () => {
  if (!newAssigneeId.value) return

  isAssigning.value = true
  try {
    await updateLead(leadId.value, { assigned_to: newAssigneeId.value })
    toast.success('已成功指派')
    showAssignModal.value = false
    await loadLead()
  } catch (error) {
    console.error('Failed to assign lead:', error)
    toast.error('指派失敗')
  } finally {
    isAssigning.value = false
  }
}

// Convert to member
const handleConvert = async () => {
  isConverting.value = true
  try {
    const result = await convertToMember(leadId.value)
    toast.success('已成功轉換為會員')
    showConvertModal.value = false
    // Navigate to new member page
    if (result?.member_id) {
      router.push(`/members/${result.member_id}`)
    }
  } catch (error) {
    console.error('Failed to convert lead:', error)
    toast.error('轉換為會員失敗')
  } finally {
    isConverting.value = false
  }
}

// Delete lead
const handleDelete = async () => {
  const confirmed = await confirm({
    title: '刪除潛在客戶',
    message: '確定要刪除此潛在客戶嗎？此操作無法復原。',
    confirmText: '確定刪除',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  isDeleting.value = true
  try {
    await deleteLead(leadId.value)
    toast.success('已刪除潛在客戶')
    router.push('/leads')
  } catch (error) {
    console.error('Failed to delete lead:', error)
    toast.error('刪除失敗')
  } finally {
    isDeleting.value = false
  }
}

// Open status modal
const openStatusModal = () => {
  if (lead.value) {
    newStatus.value = lead.value.status
  }
  showStatusModal.value = true
}

// Open assign modal
const openAssignModal = () => {
  if (lead.value?.assigned_to) {
    newAssigneeId.value = typeof lead.value.assigned_to === 'object'
      ? lead.value.assigned_to.id
      : lead.value.assigned_to
  }
  showAssignModal.value = true
}
</script>

<template>
  <div class="lead-detail-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <template v-else-if="lead">
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <div class="header-actions">
          <button
            v-if="lead.status !== 'CONVERTED' && lead.status !== 'LOST'"
            class="btn btn-primary"
            @click="showConvertModal = true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
            轉換為會員
          </button>
          <button class="btn btn-ghost btn-danger" @click="handleDelete">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            刪除
          </button>
        </div>
      </header>

      <!-- Profile Hero -->
      <section class="profile-hero glass-card">
        <div class="profile-avatar-large">
          {{ lead.name[0] }}
        </div>
        <div class="profile-info">
          <div class="profile-header-row">
            <h1 class="text-display">{{ lead.name }}</h1>
            <button class="status-badge-btn" @click="openStatusModal">
              <AppBadge
                :label="getStatusLabel(lead.status)"
                :variant="getStatusVariant(lead.status)"
                size="lg"
              />
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
          <div class="profile-meta">
            <span class="meta-item source-badge" :class="`source-${lead.source.toLowerCase().replace('_', '-')}`">
              {{ getSourceLabel(lead.source) }}
            </span>
            <span v-if="lead.branch" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              {{ lead.branch.name }}
            </span>
            <span class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
              </svg>
              {{ formatDate(lead.date_created) }} 建立
            </span>
          </div>
        </div>
      </section>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Contact Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            聯絡資訊
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>電話</label>
              <span>{{ lead.phone || '—' }}</span>
            </div>
            <div class="info-item">
              <label>Email</label>
              <span>{{ lead.email || '—' }}</span>
            </div>
          </div>
        </section>

        <!-- Assigned To -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            負責人
          </h3>
          <div class="assignee-section">
            <div v-if="lead.assigned_to" class="assignee-display">
              <AppAvatar :name="lead.assigned_to.full_name" size="lg" variant="blue" />
              <div class="assignee-info">
                <span class="assignee-name">{{ lead.assigned_to.full_name }}</span>
                <span class="assignee-code text-tertiary">{{ lead.assigned_to.employee_code }}</span>
              </div>
            </div>
            <div v-else class="no-assignee">
              <span class="text-tertiary">尚未指派</span>
            </div>
            <button class="btn btn-secondary btn-small" @click="openAssignModal">
              {{ lead.assigned_to ? '變更負責人' : '指派負責人' }}
            </button>
          </div>
        </section>

        <!-- UTM Info -->
        <section v-if="lead.utm_source || lead.utm_medium || lead.utm_campaign" class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            UTM 追蹤
          </h3>
          <div class="info-grid">
            <div v-if="lead.utm_source" class="info-item">
              <label>utm_source</label>
              <span>{{ lead.utm_source }}</span>
            </div>
            <div v-if="lead.utm_medium" class="info-item">
              <label>utm_medium</label>
              <span>{{ lead.utm_medium }}</span>
            </div>
            <div v-if="lead.utm_campaign" class="info-item full-width">
              <label>utm_campaign</label>
              <span>{{ lead.utm_campaign }}</span>
            </div>
          </div>
        </section>

        <!-- Notes -->
        <section v-if="lead.notes" class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            備註
          </h3>
          <p class="notes-content">{{ lead.notes }}</p>
        </section>
      </div>

      <!-- Activity Timeline -->
      <section class="activities-section">
        <div class="section-header">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            活動紀錄
          </h2>
          <button class="btn btn-primary" @click="showActivityModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" x2="12" y1="5" y2="19" />
              <line x1="5" x2="19" y1="12" y2="12" />
            </svg>
            新增活動
          </button>
        </div>

        <div v-if="lead.activities && lead.activities.length > 0" class="timeline">
          <div
            v-for="activity in lead.activities"
            :key="activity.id"
            class="timeline-item"
          >
            <div
              class="timeline-dot"
              :style="{ background: getActivityTypeColor(activity.activity_type) }"
            ></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="activity-type" :style="{ color: getActivityTypeColor(activity.activity_type) }">
                  {{ getActivityTypeLabel(activity.activity_type) }}
                </span>
                <span class="timeline-time">{{ formatDateTime(activity.date_created) }}</span>
              </div>
              <p class="activity-content">{{ activity.content }}</p>
              <div v-if="activity.result" class="activity-result">
                <strong>結果：</strong>{{ activity.result }}
              </div>
              <div v-if="activity.next_action" class="activity-next">
                <strong>下一步：</strong>{{ activity.next_action }}
                <span v-if="activity.next_action_date" class="next-date">
                  ({{ formatDate(activity.next_action_date) }})
                </span>
              </div>
              <div v-if="activity.created_by" class="activity-author">
                {{ activity.created_by.full_name }}
              </div>
            </div>
          </div>
        </div>
        <EmptyState
          v-else
          title="暫無活動紀錄"
          description="點擊上方按鈕新增第一筆活動紀錄"
          icon="clock"
        />
      </section>
    </template>

    <!-- Activity Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showActivityModal" class="modal-overlay" @click.self="showActivityModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3>新增活動紀錄</h3>
              <button class="modal-close" @click="showActivityModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">活動類型</label>
                <div class="type-selector">
                  <button
                    v-for="opt in activityTypeOptions"
                    :key="opt.value"
                    type="button"
                    :class="['type-option', { active: activityForm.activity_type === opt.value }]"
                    :style="{ '--type-color': getActivityTypeColor(opt.value) }"
                    @click="activityForm.activity_type = opt.value as typeof activityForm.activity_type"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">活動內容 *</label>
                <textarea
                  v-model="activityForm.content"
                  class="input textarea"
                  rows="3"
                  placeholder="描述此次聯繫或互動的內容..."
                ></textarea>
              </div>

              <div class="form-group">
                <label class="form-label">結果</label>
                <input
                  v-model="activityForm.result"
                  type="text"
                  class="input"
                  placeholder="例：已約定體驗時間"
                />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">下一步行動</label>
                  <input
                    v-model="activityForm.next_action"
                    type="text"
                    class="input"
                    placeholder="例：發送方案報價"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">預計日期</label>
                  <input
                    v-model="activityForm.next_action_date"
                    type="date"
                    class="input"
                  />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showActivityModal = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="isSubmittingActivity || !activityForm.content"
                @click="handleAddActivity"
              >
                <span v-if="isSubmittingActivity" class="btn-spinner"></span>
                {{ isSubmittingActivity ? '儲存中...' : '儲存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Status Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showStatusModal" class="modal-overlay" @click.self="showStatusModal = false">
          <div class="modal-content modal-sm">
            <div class="modal-header">
              <h3>更新狀態</h3>
              <button class="modal-close" @click="showStatusModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">選擇狀態</label>
                <select v-model="newStatus" class="input">
                  <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showStatusModal = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="isUpdatingStatus"
                @click="handleUpdateStatus"
              >
                {{ isUpdatingStatus ? '更新中...' : '確定更新' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Assign Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAssignModal" class="modal-overlay" @click.self="showAssignModal = false">
          <div class="modal-content modal-sm">
            <div class="modal-header">
              <h3>指派負責人</h3>
              <button class="modal-close" @click="showAssignModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">選擇負責人</label>
                <select v-model="newAssigneeId" class="input">
                  <option value="">請選擇</option>
                  <option v-for="emp in employees" :key="emp.id" :value="emp.id">
                    {{ emp.full_name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showAssignModal = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="isAssigning || !newAssigneeId"
                @click="handleAssign"
              >
                {{ isAssigning ? '指派中...' : '確定指派' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Convert Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showConvertModal" class="modal-overlay" @click.self="showConvertModal = false">
          <div class="modal-content modal-sm">
            <div class="modal-header">
              <h3>轉換為會員</h3>
              <button class="modal-close" @click="showConvertModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="convert-confirmation">
                <div class="convert-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <polyline points="16 11 18 13 22 9" />
                  </svg>
                </div>
                <p class="convert-message">
                  確定要將 <strong>{{ lead?.name }}</strong> 轉換為正式會員嗎？
                </p>
                <p class="convert-hint text-secondary">
                  轉換後將自動建立會員資料，此潛在客戶狀態將更新為「已轉換」。
                </p>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showConvertModal = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="isConverting"
                @click="handleConvert"
              >
                <span v-if="isConverting" class="btn-spinner"></span>
                {{ isConverting ? '轉換中...' : '確定轉換' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.lead-detail-page {
  max-width: 1000px;
  margin: 0 auto;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
  animation: fadeIn 0.6s var(--ease-out) backwards;
}

@keyframes fadeIn {
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
  gap: var(--space-md);
}

.btn-danger {
  color: var(--color-error);
}

.btn-danger:hover {
  background: rgba(255, 59, 48, 0.1);
}

/* Profile Hero */
.profile-hero {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-2xl);
  margin-bottom: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.profile-avatar-large {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #af52de, #5856d6);
  color: white;
  font-size: 32px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
}

.profile-header-row {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  margin-bottom: var(--space-md);
}

.status-badge-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.status-badge-btn svg {
  color: var(--color-text-tertiary);
}

.profile-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* Source Badge */
.source-badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.source-fb-ad { background: rgba(66, 103, 178, 0.15); color: #4267b2; }
.source-ig-ad { background: rgba(225, 48, 108, 0.15); color: #e1306c; }
.source-google-ad { background: rgba(219, 68, 55, 0.15); color: #db4437; }
.source-website { background: rgba(0, 122, 255, 0.15); color: #007aff; }
.source-walk-in { background: rgba(52, 199, 89, 0.15); color: #34c759; }
.source-referral { background: rgba(175, 82, 222, 0.15); color: #af52de; }

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
  margin-bottom: var(--space-lg);
}

.card-title svg {
  color: var(--color-accent);
}

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

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-item label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-item span {
  font-size: 15px;
  color: var(--color-text-primary);
}

/* Assignee Section */
.assignee-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.assignee-display {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.assignee-info {
  display: flex;
  flex-direction: column;
}

.assignee-name {
  font-weight: 500;
}

.assignee-code {
  font-size: 12px;
}

.no-assignee {
  padding: var(--space-md) 0;
}

/* Notes */
.notes-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}

/* Activities Section */
.activities-section {
  animation: fadeUp 0.6s var(--ease-out) 0.35s backwards;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 20px;
  font-weight: 600;
}

.section-title svg {
  color: var(--color-accent);
}

/* Timeline */
.timeline {
  position: relative;
  padding-left: var(--space-2xl);
}

.timeline::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--color-border);
}

.timeline-item {
  position: relative;
  padding-bottom: var(--space-xl);
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-dot {
  position: absolute;
  left: -24px;
  top: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 3px solid var(--color-bg-primary);
  box-shadow: 0 0 0 2px var(--color-border);
}

.timeline-content {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.activity-type {
  font-weight: 600;
  font-size: 14px;
}

.timeline-time {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.activity-content {
  font-size: 14px;
  color: var(--color-text-primary);
  margin-bottom: var(--space-md);
}

.activity-result,
.activity-next {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.next-date {
  color: var(--color-text-tertiary);
}

.activity-author {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-divider);
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

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
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

.textarea {
  resize: vertical;
  min-height: 80px;
}

/* Convert Confirmation */
.convert-confirmation {
  text-align: center;
  padding: var(--space-lg) 0;
}

.convert-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

.convert-message {
  font-size: 16px;
  margin-bottom: var(--space-md);
}

.convert-hint {
  font-size: 13px;
}

/* Button Spinner */
.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: var(--space-sm);
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
@media (max-width: 768px) {
  .profile-hero {
    flex-direction: column;
    text-align: center;
  }

  .profile-header-row {
    flex-direction: column;
    gap: var(--space-md);
  }

  .profile-meta {
    justify-content: center;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .assignee-section {
    flex-direction: column;
    gap: var(--space-lg);
  }

  .header-actions {
    flex-direction: column;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
