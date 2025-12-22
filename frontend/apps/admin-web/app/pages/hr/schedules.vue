<script setup lang="ts">
import { MESSAGES } from '~/constants'
import type { ShiftSchedule } from '~/types/directus'

definePageMeta({
  middleware: 'auth'
})

const {
  shiftSchedules,
  isShiftLoading,
  fetchShiftSchedules,
  createShiftSchedule,
  updateShiftSchedule,
  deleteShiftSchedule
} = useHR()
const { branches, fetchBranches } = useBranches()

const selectedBranch = ref('')
const showModal = ref(false)
const isEditing = ref(false)
const isSubmitting = ref(false)
const showDeleteModal = ref(false)
const scheduleToDelete = ref<ShiftSchedule | null>(null)

const form = reactive({
  id: '',
  name: '',
  branch_id: '',
  start_time: '09:00',
  end_time: '18:00',
  break_start: '12:00',
  break_end: '13:00',
  grace_period_minutes: 15,
  early_leave_minutes: 15,
  overtime_start_after: '18:30',
  is_default: false,
  applicable_days: ['MON', 'TUE', 'WED', 'THU', 'FRI'] as string[]
})

const weekdays = [
  { value: 'MON', label: '一' },
  { value: 'TUE', label: '二' },
  { value: 'WED', label: '三' },
  { value: 'THU', label: '四' },
  { value: 'FRI', label: '五' },
  { value: 'SAT', label: '六' },
  { value: 'SUN', label: '日' }
]

onMounted(async () => {
  await Promise.all([fetchShiftSchedules(), fetchBranches()])
})

watch(selectedBranch, () => {
  fetchShiftSchedules(selectedBranch.value || undefined)
})

const filteredSchedules = computed(() => {
  if (!selectedBranch.value) return shiftSchedules.value
  return shiftSchedules.value.filter(s => s.branch_id === selectedBranch.value)
})

const resetForm = () => {
  form.id = ''
  form.name = ''
  form.branch_id = branches.value[0]?.id || ''
  form.start_time = '09:00'
  form.end_time = '18:00'
  form.break_start = '12:00'
  form.break_end = '13:00'
  form.grace_period_minutes = 15
  form.early_leave_minutes = 15
  form.overtime_start_after = '18:30'
  form.is_default = false
  form.applicable_days = ['MON', 'TUE', 'WED', 'THU', 'FRI']
}

const openCreateModal = () => {
  isEditing.value = false
  resetForm()
  showModal.value = true
}

const openEditModal = (schedule: ShiftSchedule) => {
  isEditing.value = true
  form.id = schedule.id
  form.name = schedule.name
  form.branch_id = schedule.branch_id
  form.start_time = schedule.start_time
  form.end_time = schedule.end_time
  form.break_start = schedule.break_start || ''
  form.break_end = schedule.break_end || ''
  form.grace_period_minutes = schedule.grace_period_minutes
  form.early_leave_minutes = schedule.early_leave_minutes
  form.overtime_start_after = schedule.overtime_start_after || ''
  form.is_default = schedule.is_default
  form.applicable_days = schedule.applicable_days || []
  showModal.value = true
}

const handleSubmit = async () => {
  if (!form.name || !form.branch_id) return

  isSubmitting.value = true
  try {
    const data = {
      name: form.name,
      branch_id: form.branch_id,
      start_time: form.start_time,
      end_time: form.end_time,
      break_start: form.break_start || null,
      break_end: form.break_end || null,
      grace_period_minutes: form.grace_period_minutes,
      early_leave_minutes: form.early_leave_minutes,
      overtime_start_after: form.overtime_start_after || null,
      is_default: form.is_default,
      applicable_days: form.applicable_days
    }

    if (isEditing.value) {
      await updateShiftSchedule(form.id, data)
    } else {
      await createShiftSchedule(data)
    }

    showModal.value = false
    await fetchShiftSchedules(selectedBranch.value || undefined)
  } catch (error) {
    console.error('Failed to save shift schedule:', error)
  } finally {
    isSubmitting.value = false
  }
}

const confirmDelete = (schedule: ShiftSchedule) => {
  scheduleToDelete.value = schedule
  showDeleteModal.value = true
}

const handleDelete = async () => {
  if (!scheduleToDelete.value) return

  try {
    await deleteShiftSchedule(scheduleToDelete.value.id)
    showDeleteModal.value = false
    scheduleToDelete.value = null
    await fetchShiftSchedules(selectedBranch.value || undefined)
  } catch (error) {
    console.error('Failed to delete shift schedule:', error)
  }
}

const formatTime = (time: string) => {
  return time?.substring(0, 5) || '—'
}

const getDayLabels = (days: string[]) => {
  if (!days || days.length === 0) return '—'
  if (days.length === 7) return '每天'
  if (days.length === 5 && !days.includes('SAT') && !days.includes('SUN')) return '週一至週五'
  return days.map(d => weekdays.find(w => w.value === d)?.label).filter(Boolean).join('、')
}

const toggleDay = (day: string) => {
  const index = form.applicable_days.indexOf(day)
  if (index > -1) {
    form.applicable_days.splice(index, 1)
  } else {
    form.applicable_days.push(day)
  }
}
</script>

<template>
  <div class="schedules-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <NuxtLink to="/hr" class="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          人資管理
        </NuxtLink>
        <h1 class="text-headline">班表管理</h1>
        <p class="text-body text-secondary">設定員工上下班時間與加班規則</p>
      </div>
      <div class="header-actions">
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
        <button class="btn btn-primary" @click="openCreateModal">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"/><path d="M12 5v14"/>
          </svg>
          新增班表
        </button>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isShiftLoading" class="loading-state">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredSchedules.length === 0" class="empty-state card">
      <div class="empty-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
          <line x1="16" x2="16" y1="2" y2="6"/>
          <line x1="8" x2="8" y1="2" y2="6"/>
          <line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
      </div>
      <h3>尚無班表</h3>
      <p class="text-secondary">建立班表以設定員工的工作時間</p>
      <button class="btn btn-primary mt-lg" @click="openCreateModal">新增班表</button>
    </div>

    <!-- Schedules Grid -->
    <div v-else class="schedules-grid">
      <div
        v-for="schedule in filteredSchedules"
        :key="schedule.id"
        class="schedule-card card"
      >
        <div class="schedule-header">
          <div class="schedule-title">
            <h3>{{ schedule.name }}</h3>
            <span v-if="schedule.is_default" class="badge badge-accent">預設</span>
          </div>
          <div class="schedule-actions">
            <button class="action-btn" title="編輯" @click="openEditModal(schedule)">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>
            <button class="action-btn action-btn-danger" title="刪除" @click="confirmDelete(schedule)">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="schedule-time">
          <div class="time-block">
            <span class="time-label">上班</span>
            <span class="time-value">{{ formatTime(schedule.start_time) }}</span>
          </div>
          <div class="time-separator">→</div>
          <div class="time-block">
            <span class="time-label">下班</span>
            <span class="time-value">{{ formatTime(schedule.end_time) }}</span>
          </div>
        </div>

        <div class="schedule-details">
          <div class="detail-row">
            <span class="detail-label">休息時間</span>
            <span class="detail-value">
              {{ schedule.break_start && schedule.break_end
                 ? `${formatTime(schedule.break_start)} - ${formatTime(schedule.break_end)}`
                 : '無' }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">遲到寬限</span>
            <span class="detail-value">{{ schedule.grace_period_minutes }} 分鐘</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">早退寬限</span>
            <span class="detail-value">{{ schedule.early_leave_minutes }} 分鐘</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">加班起算</span>
            <span class="detail-value">{{ schedule.overtime_start_after ? formatTime(schedule.overtime_start_after) : '不計' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">適用日</span>
            <span class="detail-value">{{ getDayLabels(schedule.applicable_days) }}</span>
          </div>
        </div>

        <div v-if="schedule.branch" class="schedule-branch">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          {{ (schedule.branch as { name: string }).name }}
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content glass-card">
          <h3 class="modal-title">{{ isEditing ? '編輯班表' : '新增班表' }}</h3>

          <form @submit.prevent="handleSubmit">
            <div class="form-grid">
              <div class="input-group full-width">
                <label class="input-label">班表名稱</label>
                <input v-model="form.name" type="text" class="input" placeholder="例：正常班、早班、晚班" required />
              </div>

              <div class="input-group">
                <label class="input-label">所屬分店</label>
                <select v-model="form.branch_id" class="input" required>
                  <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                    {{ branch.name }}
                  </option>
                </select>
              </div>

              <div class="input-group">
                <label class="input-label">
                  <input v-model="form.is_default" type="checkbox" class="checkbox" />
                  設為預設班表
                </label>
              </div>

              <div class="input-group">
                <label class="input-label">上班時間</label>
                <input v-model="form.start_time" type="time" class="input" required />
              </div>

              <div class="input-group">
                <label class="input-label">下班時間</label>
                <input v-model="form.end_time" type="time" class="input" required />
              </div>

              <div class="input-group">
                <label class="input-label">休息開始</label>
                <input v-model="form.break_start" type="time" class="input" />
              </div>

              <div class="input-group">
                <label class="input-label">休息結束</label>
                <input v-model="form.break_end" type="time" class="input" />
              </div>

              <div class="input-group">
                <label class="input-label">遲到寬限（分鐘）</label>
                <input v-model.number="form.grace_period_minutes" type="number" class="input" min="0" max="60" />
              </div>

              <div class="input-group">
                <label class="input-label">早退寬限（分鐘）</label>
                <input v-model.number="form.early_leave_minutes" type="number" class="input" min="0" max="60" />
              </div>

              <div class="input-group">
                <label class="input-label">加班起算時間</label>
                <input v-model="form.overtime_start_after" type="time" class="input" placeholder="留空表示不計加班" />
              </div>

              <div class="input-group full-width">
                <label class="input-label">適用日</label>
                <div class="weekday-selector">
                  <button
                    v-for="day in weekdays"
                    :key="day.value"
                    type="button"
                    class="weekday-btn"
                    :class="{ active: form.applicable_days.includes(day.value) }"
                    @click="toggleDay(day.value)"
                  >
                    {{ day.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="showModal = false">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="isSubmitting">
                {{ isSubmitting ? '儲存中...' : '儲存' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
        <div class="modal-content glass-card modal-small">
          <div class="modal-icon modal-icon-danger">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </div>
          <h3 class="modal-title">確定刪除？</h3>
          <p class="modal-desc text-secondary">
            即將刪除班表「{{ scheduleToDelete?.name }}」，此操作無法復原。
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showDeleteModal = false">取消</button>
            <button class="btn btn-danger" @click="handleDelete">確定刪除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.schedules-page {
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  animation: fadeInUp 0.6s var(--ease-out) backwards;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  margin-bottom: var(--space-sm);
}

.back-link:hover {
  text-decoration: underline;
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

.header-actions {
  display: flex;
  gap: var(--space-md);
  align-items: center;
}

.filter-select {
  min-width: 160px;
}

/* Loading & Empty States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
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

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-lg);
}

/* Schedules Grid */
.schedules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-lg);
}

.schedule-card {
  padding: var(--space-lg);
  animation: cardAppear 0.5s var(--ease-out) backwards;
}

@keyframes cardAppear {
  from { opacity: 0; transform: translateY(20px); }
}

.schedule-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-lg);
}

.schedule-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.schedule-title h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.badge-accent {
  background: var(--color-accent-light);
  color: var(--color-accent);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.schedule-actions {
  display: flex;
  gap: var(--space-xs);
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-accent);
}

.action-btn-danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

/* Schedule Time */
.schedule-time {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-lg);
}

.time-block {
  text-align: center;
}

.time-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-xs);
}

.time-value {
  font-size: 24px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--color-text-primary);
}

.time-separator {
  color: var(--color-text-tertiary);
  font-size: 18px;
}

/* Schedule Details */
.schedule-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.detail-label {
  color: var(--color-text-secondary);
}

.detail-value {
  font-weight: 500;
  color: var(--color-text-primary);
}

.schedule-branch {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--color-text-tertiary);
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
  z-index: 1000;
  padding: var(--space-lg);
}

.modal-content {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--space-xl);
  animation: modalIn 0.3s var(--ease-spring);
}

.modal-small {
  max-width: 400px;
  text-align: center;
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95); }
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: var(--space-xl);
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

.modal-icon-danger {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.modal-desc {
  margin-bottom: var(--space-xl);
}

/* Form */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.input-group.full-width {
  grid-column: 1 / -1;
}

.checkbox {
  margin-right: var(--space-sm);
}

/* Weekday Selector */
.weekday-selector {
  display: flex;
  gap: var(--space-sm);
}

.weekday-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-strong);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.weekday-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.weekday-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.modal-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: flex-end;
}

.btn-danger {
  background: var(--color-error);
  color: white;
}

.btn-danger:hover {
  background: #e6352a;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .schedules-grid {
    grid-template-columns: 1fr;
  }
}
</style>
