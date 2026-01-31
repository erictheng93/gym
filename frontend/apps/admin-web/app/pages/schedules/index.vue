<template>
  <div class="shift-management">
    <!-- Header with blur effect -->
    <header class="page-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="page-title">班表管理</h1>
          <p class="page-subtitle">Shift Schedules</p>
        </div>
        <button class="btn-primary" @click="openCreateModal">
          <span class="btn-icon">+</span>
          <span>新增班表</span>
        </button>
      </div>
    </header>

    <!-- Shift Cards Grid -->
    <div class="shifts-grid">
      <div
        v-for="(shift, index) in shifts"
        :key="shift.id"
        class="shift-card"
        :style="{ animationDelay: `${index * 0.05}s` }"
      >
        <div class="card-header">
          <div class="shift-name-section">
            <h3 class="shift-name">{{ shift.name }}</h3>
            <span class="shift-status" :class="shift.status">
              {{ shift.status === 'active' ? '啟用中' : '停用' }}
            </span>
          </div>
          <div class="card-actions">
            <button class="btn-icon-ghost" title="編輯" @click="editShift(shift)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button class="btn-icon-ghost btn-danger" title="刪除" @click="deleteShift(shift.id)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>

        <div class="time-display">
          <div class="time-block">
            <span class="time-label">工作時間</span>
            <span class="time-value">{{ shift.start_time }} - {{ shift.end_time }}</span>
          </div>
          <div v-if="shift.break_start && shift.break_end" class="time-block">
            <span class="time-label">休息時間</span>
            <span class="time-value">{{ shift.break_start }} - {{ shift.break_end }}</span>
          </div>
        </div>

        <div class="flex-settings">
          <div class="setting-item">
            <span class="setting-icon">⏱</span>
            <div class="setting-content">
              <span class="setting-label">寬限時間</span>
              <span class="setting-value">{{ shift.grace_period_minutes || 0 }} 分鐘</span>
            </div>
          </div>
          <div class="setting-item">
            <span class="setting-icon">🚀</span>
            <div class="setting-content">
              <span class="setting-label">早退容許</span>
              <span class="setting-value">{{ shift.early_leave_minutes || 0 }} 分鐘</span>
            </div>
          </div>
        </div>

        <div class="days-display">
          <span class="days-label">適用日期</span>
          <div class="days-chips">
            <span
              v-for="day in allDays"
              :key="day.value"
              class="day-chip"
              :class="{ active: shift.applicable_days?.includes(day.value) }"
            >
              {{ day.label }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="shifts.length === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <h3 class="empty-title">尚無班表</h3>
      <p class="empty-description">建立第一個班表以開始管理員工排班</p>
      <button class="btn-secondary" @click="openCreateModal">新增班表</button>
    </div>

    <!-- Create/Edit Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click="closeModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2 class="modal-title">{{ editingShift ? '編輯班表' : '新增班表' }}</h2>
            <button class="btn-close" @click="closeModal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form class="modal-form" @submit.prevent="saveShift">
            <div class="form-group">
              <label class="form-label">班表名稱</label>
              <input
                v-model="formData.name"
                type="text"
                class="form-input"
                placeholder="例如：早班、晚班"
                required
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">開始時間</label>
                <input v-model="formData.start_time" type="time" class="form-input" required />
              </div>
              <div class="form-group">
                <label class="form-label">結束時間</label>
                <input v-model="formData.end_time" type="time" class="form-input" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">休息開始</label>
                <input v-model="formData.break_start" type="time" class="form-input" />
              </div>
              <div class="form-group">
                <label class="form-label">休息結束</label>
                <input v-model="formData.break_end" type="time" class="form-input" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">寬限時間（分鐘）</label>
              <div class="slider-container">
                <input
                  v-model.number="formData.grace_period_minutes"
                  type="range"
                  min="0"
                  max="30"
                  step="5"
                  class="form-slider"
                />
                <input
                  v-model.number="formData.grace_period_minutes"
                  type="number"
                  min="0"
                  max="30"
                  class="form-input-small"
                />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">早退容許時間（分鐘）</label>
              <div class="slider-container">
                <input
                  v-model.number="formData.early_leave_minutes"
                  type="range"
                  min="0"
                  max="30"
                  step="5"
                  class="form-slider"
                />
                <input
                  v-model.number="formData.early_leave_minutes"
                  type="number"
                  min="0"
                  max="30"
                  class="form-input-small"
                />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">加班起算時間</label>
              <input v-model="formData.overtime_start_after" type="time" class="form-input" />
            </div>

            <div class="form-group">
              <label class="form-label">適用星期</label>
              <div class="days-selector">
                <button
                  v-for="day in allDays"
                  :key="day.value"
                  type="button"
                  class="day-selector-btn"
                  :class="{ active: formData.applicable_days.includes(day.value) }"
                  @click="toggleDay(day.value)"
                >
                  {{ day.label }}
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">狀態</label>
              <select v-model="formData.status" class="form-select">
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>

            <div class="form-actions">
              <button type="button" class="btn-secondary" @click="closeModal">取消</button>
              <button type="submit" class="btn-primary">
                {{ editingShift ? '更新' : '新增' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface ShiftSchedule {
  id: string
  name: string
  start_time: string
  end_time: string
  break_start?: string
  break_end?: string
  grace_period_minutes: number
  early_leave_minutes: number
  overtime_start_after?: string
  applicable_days: string[]
  status: 'active' | 'inactive'
  is_default: boolean
}

const allDays = [
  { label: '一', value: 'MON' },
  { label: '二', value: 'TUE' },
  { label: '三', value: 'WED' },
  { label: '四', value: 'THU' },
  { label: '五', value: 'FRI' },
  { label: '六', value: 'SAT' },
  { label: '日', value: 'SUN' },
]

const shifts = ref<ShiftSchedule[]>([])
const showModal = ref(false)
const editingShift = ref<ShiftSchedule | null>(null)
const formData = ref({
  name: '',
  start_time: '09:00',
  end_time: '18:00',
  break_start: '',
  break_end: '',
  grace_period_minutes: 10,
  early_leave_minutes: 0,
  overtime_start_after: '',
  applicable_days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  status: 'active' as 'active' | 'inactive',
})

const API_BASE = 'http://localhost:8055'

async function fetchShifts() {
  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(`${API_BASE}/items/shift_schedules`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()
    shifts.value = data.data || []
  } catch (error) {
    console.error('Failed to fetch shifts:', error)
  }
}

function openCreateModal() {
  editingShift.value = null
  formData.value = {
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    break_start: '',
    break_end: '',
    grace_period_minutes: 10,
    early_leave_minutes: 0,
    overtime_start_after: '',
    applicable_days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    status: 'active',
  }
  showModal.value = true
}

function editShift(shift: ShiftSchedule) {
  editingShift.value = shift
  formData.value = {
    name: shift.name,
    start_time: shift.start_time,
    end_time: shift.end_time,
    break_start: shift.break_start || '',
    break_end: shift.break_end || '',
    grace_period_minutes: shift.grace_period_minutes,
    early_leave_minutes: shift.early_leave_minutes,
    overtime_start_after: shift.overtime_start_after || '',
    applicable_days: shift.applicable_days || [],
    status: shift.status,
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingShift.value = null
}

function toggleDay(day: string) {
  const index = formData.value.applicable_days.indexOf(day)
  if (index > -1) {
    formData.value.applicable_days.splice(index, 1)
  } else {
    formData.value.applicable_days.push(day)
  }
}

async function saveShift() {
  try {
    const token = localStorage.getItem('auth_token')
    const url = editingShift.value
      ? `${API_BASE}/items/shift_schedules/${editingShift.value.id}`
      : `${API_BASE}/items/shift_schedules`

    const response = await fetch(url, {
      method: editingShift.value ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formData.value),
    })

    if (response.ok) {
      useToast().success(editingShift.value ? MESSAGES.SUCCESS.SCHEDULE_UPDATED : MESSAGES.SUCCESS.SCHEDULE_CREATED)
      await fetchShifts()
      closeModal()
    }
  } catch (error) {
    console.error('Failed to save shift:', error)
    useToast().error(editingShift.value ? MESSAGES.ERRORS.SCHEDULE_UPDATE_FAILED : MESSAGES.ERRORS.SCHEDULE_CREATE_FAILED)
  }
}

async function deleteShift(id: string) {
  const { confirm } = useConfirm()
  const confirmed = await confirm({
    title: '刪除班表',
    message: '確定要刪除此班表嗎？此操作無法復原。',
    type: 'danger'
  })

  if (!confirmed) return

  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(`${API_BASE}/items/shift_schedules/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (response.ok) {
      useToast().success(MESSAGES.SUCCESS.SCHEDULE_DELETED)
      await fetchShifts()
    }
  } catch (error) {
    console.error('Failed to delete shift:', error)
    useToast().error(MESSAGES.ERRORS.SCHEDULE_DELETE_FAILED)
  }
}

onMounted(() => {
  fetchShifts()
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');

.shift-management {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
  padding: 2rem;
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #e5e5e5;
}

/* Header */
.page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  margin-bottom: 3rem;
  padding: 1.5rem 2rem;
  background: rgba(26, 26, 26, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  animation: slideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #ffffff 0%, #a1a1a1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.page-subtitle {
  font-size: 0.875rem;
  color: #737373;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Primary Button */
.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #0A84FF 0%, #64D2FF 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(10, 132, 255, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(10, 132, 255, 0.4);
}

.btn-icon {
  font-size: 1.25rem;
  line-height: 1;
}

/* Shifts Grid */
.shifts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.shift-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 1.75rem;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  position: relative;
  overflow: hidden;
}

.shift-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #0A84FF, #64D2FF);
  opacity: 0;
  transition: opacity 0.3s;
}

.shift-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.shift-card:hover::before {
  opacity: 1;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.shift-name-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.shift-name {
  font-size: 1.375rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  letter-spacing: -0.01em;
}

.shift-status {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.shift-status.active {
  background: rgba(52, 199, 89, 0.15);
  color: #34C759;
}

.shift-status.inactive {
  background: rgba(255, 59, 48, 0.15);
  color: #FF3B30;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon-ghost {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #a1a1a1;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon-ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.15);
}

.btn-icon-ghost.btn-danger:hover {
  background: rgba(255, 59, 48, 0.15);
  color: #FF3B30;
  border-color: rgba(255, 59, 48, 0.3);
}

/* Time Display */
.time-display {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.time-block {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.time-label {
  font-size: 0.8125rem;
  color: #737373;
  font-weight: 500;
}

.time-value {
  font-size: 1rem;
  color: #ffffff;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Flex Settings */
.flex-settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.setting-icon {
  font-size: 1.25rem;
}

.setting-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.setting-label {
  font-size: 0.75rem;
  color: #737373;
}

.setting-value {
  font-size: 0.875rem;
  color: #ffffff;
  font-weight: 600;
}

/* Days Display */
.days-display {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.days-label {
  font-size: 0.8125rem;
  color: #737373;
  font-weight: 500;
}

.days-chips {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.day-chip {
  padding: 0.375rem 0.75rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.03);
  color: #737373;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s;
}

.day-chip.active {
  background: rgba(10, 132, 255, 0.15);
  color: #64D2FF;
  border-color: rgba(10, 132, 255, 0.3);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  animation: fadeIn 0.6s;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  opacity: 0.3;
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 0.5rem;
}

.empty-description {
  font-size: 0.9375rem;
  color: #737373;
  margin-bottom: 2rem;
}

.btn-secondary {
  padding: 0.75rem 1.5rem;
  background: rgba(255, 255, 255, 0.05);
  color: #e5e5e5;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s;
  padding: 2rem;
}

.modal-container {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2rem 2rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
}

.btn-close {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 10px;
  color: #a1a1a1;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.modal-form {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #e5e5e5;
}

.form-input,
.form-select {
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #ffffff;
  font-size: 0.9375rem;
  font-family: inherit;
  transition: all 0.2s;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  border-color: #0A84FF;
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.form-slider {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #0A84FF, #64D2FF);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(10, 132, 255, 0.4);
}

.form-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #0A84FF, #64D2FF);
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 8px rgba(10, 132, 255, 0.4);
}

.form-input-small {
  width: 80px;
  padding: 0.625rem 0.75rem;
}

.days-selector {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
}

.day-selector-btn {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #737373;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.day-selector-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e5e5e5;
}

.day-selector-btn.active {
  background: linear-gradient(135deg, #0A84FF, #64D2FF);
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(10, 132, 255, 0.3);
}

.form-actions {
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
}

.form-actions button {
  flex: 1;
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scrollbar Styling */
.modal-container::-webkit-scrollbar {
  width: 8px;
}

.modal-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
}

.modal-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
