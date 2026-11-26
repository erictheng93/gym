<script lang="ts">
const LEAD_DATE_FORMATTER = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—'
  return LEAD_DATE_FORMATTER.format(new Date(dateStr))
}

const STATUS_OPTIONS = [
  { value: 'NEW', label: '新建' },
  { value: 'CONTACTED', label: '已聯繫' },
  { value: 'QUALIFIED', label: '有意願' },
  { value: 'TRIAL', label: '體驗中' },
  { value: 'NEGOTIATION', label: '洽談中' },
  { value: 'CONVERTED', label: '已轉換' },
  { value: 'LOST', label: '已流失' }
] as const
</script>

<script setup lang="ts">
/**
 * 潛在客戶詳情頁面
 *
 * 顯示詳情、變更階段、指派、轉換為會員
 */
import { MESSAGES } from '~/constants'
import { validateUUIDParam } from '~/utils/validation'
import type { LeadStatus } from '~/composables/useLeads'

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
  assignLead,
  deleteLead,
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
// The backend marks a converted lead with convertedMemberId (and status CONVERTED)
const isConverted = computed(() => lead.value?.status === 'CONVERTED' || !!lead.value?.convertedMemberId)
// CONVERTED is only reachable through the convert action (it creates the member), not by hand
const statusOptions = computed(() =>
  STATUS_OPTIONS.filter(opt => opt.value !== 'CONVERTED' || lead.value?.status === 'CONVERTED')
)

// Convert modal state
const showConvertModal = ref(false)
const isConverting = ref(false)

// Status update modal
const showStatusModal = ref(false)
const newStatus = ref<LeadStatus | ''>('')
const isUpdatingStatus = ref(false)

// Assign modal
const showAssignModal = ref(false)
const newAssigneeId = ref('')
const isAssigning = ref(false)

const loadLead = async () => {
  isLoading.value = true
  try {
    // getLead shows the backend's reason itself and resolves null on failure
    lead.value = await getLead(leadId.value, true)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadLead(), fetchEmployees()])
})

// Update status
const handleUpdateStatus = async () => {
  if (!newStatus.value) return

  isUpdatingStatus.value = true
  try {
    // updateLead shows the backend's reason itself and resolves null on failure
    const updated = await updateLead(leadId.value, { status: newStatus.value as LeadStatus })
    if (!updated) return
    toast.success('狀態已更新')
    showStatusModal.value = false
    await loadLead()
  } finally {
    isUpdatingStatus.value = false
  }
}

// Assign lead
const handleAssign = async () => {
  if (!newAssigneeId.value) return

  isAssigning.value = true
  try {
    const updated = await assignLead(leadId.value, newAssigneeId.value)
    if (!updated) return
    toast.success('已成功指派')
    showAssignModal.value = false
    await loadLead()
  } finally {
    isAssigning.value = false
  }
}

// Convert to member
const handleConvert = async () => {
  isConverting.value = true
  try {
    // convertToMember shows the backend's reason itself and resolves null on failure
    const result = await convertToMember(leadId.value)
    if (!result) return
    toast.success('已成功轉換為會員')
    showConvertModal.value = false
    await router.push(`/members/${result.member.id}`)
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
    // deleteLead shows the backend's reason itself and resolves false on failure
    const deleted = await deleteLead(leadId.value)
    if (!deleted) return
    toast.success('已刪除潛在客戶')
    await router.push('/leads')
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
  newAssigneeId.value = lead.value?.assignedToId ?? ''
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
            v-if="!isConverted && lead.status !== 'LOST'"
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
          {{ lead.fullName[0] }}
        </div>
        <div class="profile-info">
          <div class="profile-header-row">
            <h1 class="text-display">{{ lead.fullName }}</h1>
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
            <span v-if="lead.source" class="meta-item source-badge" :class="`source-${lead.source.toLowerCase().replace('_', '-')}`">
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
              {{ formatDate(lead.createdAt) }} 建立
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
            <div v-if="lead.sourceDetail" class="info-item">
              <label>來源說明</label>
              <span>{{ lead.sourceDetail }}</span>
            </div>
            <div v-if="lead.convertedMember" class="info-item">
              <label>已轉換會員</label>
              <NuxtLink :to="`/members/${lead.convertedMember.id}`">
                {{ lead.convertedMember.fullName }}（{{ lead.convertedMember.memberCode }}）
              </NuxtLink>
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
            <div v-if="lead.assignedTo" class="assignee-display">
              <AppAvatar :name="lead.assignedTo.fullName" size="lg" variant="blue" />
              <div class="assignee-info">
                <span class="assignee-name">{{ lead.assignedTo.fullName }}</span>
              </div>
            </div>
            <div v-else class="no-assignee">
              <span class="text-tertiary">尚未指派</span>
            </div>
            <button class="btn btn-secondary btn-small" @click="openAssignModal">
              {{ lead.assignedTo ? '變更負責人' : '指派負責人' }}
            </button>
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
    </template>

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
                    {{ emp.fullName }}
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
                  確定要將 <strong>{{ lead?.fullName }}</strong> 轉換為正式會員嗎？
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

.source-social-media { background: rgba(225, 48, 108, 0.15); color: #e1306c; }
.source-event { background: rgba(255, 149, 0, 0.15); color: #ff9500; }
.source-ad { background: rgba(66, 103, 178, 0.15); color: #4267b2; }
.source-other { background: rgba(142, 142, 147, 0.15); color: #636366; }
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
