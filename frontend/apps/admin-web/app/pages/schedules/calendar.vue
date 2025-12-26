<template>
  <div class="calendar-management">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="page-title">排班日曆</h1>
          <p class="page-subtitle">Employee Shift Calendar</p>
        </div>
        <div class="header-actions">
          <button @click="previousMonth" class="btn-nav">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div class="month-display">
            <span class="month-year">{{ currentMonthYear }}</span>
          </div>
          <button @click="nextMonth" class="btn-nav">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button @click="showAssignModal = true" class="btn-primary">
            <span class="btn-icon">+</span>
            <span>批量排班</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Shift Legend -->
    <div class="shift-legend">
      <div class="legend-title">班表圖例</div>
      <div class="legend-items">
        <div
          v-for="(shift, index) in availableShifts"
          :key="shift.id"
          class="legend-item"
        >
          <span class="legend-color" :style="{ background: shiftColors[index % shiftColors.length] }"></span>
          <span class="legend-name">{{ shift.name }}</span>
          <span class="legend-time">{{ shift.start_time }} - {{ shift.end_time }}</span>
        </div>
      </div>
    </div>

    <!-- Employee List Sidebar -->
    <div class="layout-container">
      <aside class="employees-sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">員工列表</h3>
          <input
            v-model="employeeSearch"
            type="text"
            placeholder="搜尋員工..."
            class="search-input"
          />
        </div>
        <div class="employee-list">
          <div
            v-for="employee in filteredEmployees"
            :key="employee.id"
            class="employee-card"
            draggable="true"
            @dragstart="startDragEmployee($event, employee)"
          >
            <div class="employee-avatar">
              {{ employee.name?.charAt(0) || '?' }}
            </div>
            <div class="employee-info">
              <div class="employee-name">{{ employee.name }}</div>
              <div class="employee-role">{{ employee.job_title?.name || '未設定職位' }}</div>
            </div>
            <div class="drag-handle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </div>
          </div>
        </div>
      </aside>

      <!-- Calendar Grid -->
      <main class="calendar-container">
        <div class="calendar-grid">
          <!-- Weekday Headers -->
          <div class="calendar-header">
            <div v-for="day in weekDays" :key="day" class="weekday-cell">
              {{ day }}
            </div>
          </div>

          <!-- Calendar Days -->
          <div class="calendar-body">
            <div
              v-for="(day, index) in calendarDays"
              :key="index"
              class="day-cell"
              :class="{
                'other-month': !day.isCurrentMonth,
                'today': day.isToday,
                'selected': isDateSelected(day.date),
              }"
              @click="toggleDateSelection(day.date)"
              @dragover.prevent
              @drop="handleDrop($event, day.date)"
            >
              <div class="day-number">{{ day.day }}</div>
              <div class="day-shifts">
                <div
                  v-for="assignment in getAssignmentsForDate(day.date)"
                  :key="assignment.id"
                  class="shift-assignment"
                  :style="{ background: getShiftColor(assignment.shift_schedule_id) }"
                  @click.stop
                >
                  <span class="assignment-name">{{ getEmployeeName(assignment.employee_id) }}</span>
                  <span class="assignment-shift">{{ getShiftName(assignment.shift_schedule_id) }}</span>
                  <button
                    @click.stop="removeAssignment(assignment.id)"
                    class="remove-btn"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Selection Info -->
        <div v-if="selectedDates.length > 0" class="selection-info">
          <span class="selection-text">已選擇 {{ selectedDates.length }} 個日期</span>
          <button @click="clearSelection" class="btn-text">清除選擇</button>
          <button @click="showBatchAssignModal = true" class="btn-primary-sm">批量指派</button>
        </div>
      </main>
    </div>

    <!-- Batch Assign Modal -->
    <Teleport to="body">
      <div v-if="showBatchAssignModal" class="modal-overlay" @click="showBatchAssignModal = false">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2 class="modal-title">批量指派班表</h2>
            <button @click="showBatchAssignModal = false" class="btn-close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form @submit.prevent="batchAssignShifts" class="modal-form">
            <div class="form-group">
              <label class="form-label">選擇員工</label>
              <select v-model="batchAssignData.employee_id" class="form-select" required>
                <option value="">請選擇員工</option>
                <option v-for="emp in employees" :key="emp.id" :value="emp.id">
                  {{ emp.name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">選擇班表</label>
              <select v-model="batchAssignData.shift_schedule_id" class="form-select" required>
                <option value="">請選擇班表</option>
                <option v-for="shift in availableShifts" :key="shift.id" :value="shift.id">
                  {{ shift.name }} ({{ shift.start_time }} - {{ shift.end_time }})
                </option>
              </select>
            </div>

            <div class="selected-dates-preview">
              <div class="preview-label">將指派至以下日期：</div>
              <div class="dates-list">
                <span v-for="date in selectedDates" :key="date" class="date-chip">
                  {{ formatDate(date) }}
                </span>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" @click="showBatchAssignModal = false" class="btn-secondary">取消</button>
              <button type="submit" class="btn-primary">確認指派</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Employee {
  id: string
  name: string
  job_title?: {
    name: string
  }
}

interface ShiftSchedule {
  id: string
  name: string
  start_time: string
  end_time: string
}

interface EmployeeShift {
  id: string
  employee_id: string
  shift_schedule_id: string
  effective_date: string
}

interface CalendarDay {
  date: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
}

const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const shiftColors = [
  'linear-gradient(135deg, #0A84FF, #64D2FF)',
  'linear-gradient(135deg, #FF9500, #FFCC00)',
  'linear-gradient(135deg, #34C759, #30DB5B)',
  'linear-gradient(135deg, #AF52DE, #BF5AF2)',
  'linear-gradient(135deg, #FF2D55, #FF375F)',
  'linear-gradient(135deg, #5E5CE6, #7D7AFF)',
]

const currentDate = ref(new Date())
const employeeSearch = ref('')
const employees = ref<Employee[]>([])
const availableShifts = ref<ShiftSchedule[]>([])
const employeeShifts = ref<EmployeeShift[]>([])
const selectedDates = ref<string[]>([])
const showBatchAssignModal = ref(false)
const showAssignModal = ref(false)
const draggedEmployee = ref<Employee | null>(null)
const batchAssignData = ref({
  employee_id: '',
  shift_schedule_id: '',
})

const API_BASE = 'http://localhost:8500'

const currentMonthYear = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth() + 1
  return `${year} 年 ${month} 月`
})

const calendarDays = computed((): CalendarDay[] => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const prevMonthLastDay = new Date(year, month, 0)

  const days: CalendarDay[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Previous month days
  const firstDayOfWeek = firstDay.getDay()
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay.getDate() - i
    const date = new Date(year, month - 1, day)
    days.push({
      date: formatDateISO(date),
      day,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  // Current month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const date = new Date(year, month, i)
    days.push({
      date: formatDateISO(date),
      day: i,
      isCurrentMonth: true,
      isToday: formatDateISO(date) === formatDateISO(today),
    })
  }

  // Next month days
  const remainingDays = 42 - days.length // 6 weeks * 7 days
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i)
    days.push({
      date: formatDateISO(date),
      day: i,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  return days
})

const filteredEmployees = computed(() => {
  if (!employeeSearch.value) return employees.value
  return employees.value.filter(emp =>
    emp.name.toLowerCase().includes(employeeSearch.value.toLowerCase())
  )
})

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function previousMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
  fetchEmployeeShifts()
}

function nextMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
  fetchEmployeeShifts()
}

function getAssignmentsForDate(date: string): EmployeeShift[] {
  return employeeShifts.value.filter(shift => shift.effective_date === date)
}

function getEmployeeName(employeeId: string): string {
  const employee = employees.value.find(e => e.id === employeeId)
  return employee?.name || '未知'
}

function getShiftName(shiftId: string): string {
  const shift = availableShifts.value.find(s => s.id === shiftId)
  return shift?.name || ''
}

function getShiftColor(shiftId: string): string {
  const index = availableShifts.value.findIndex(s => s.id === shiftId)
  return shiftColors[index % shiftColors.length]
}

function isDateSelected(date: string): boolean {
  return selectedDates.value.includes(date)
}

function toggleDateSelection(date: string) {
  const index = selectedDates.value.indexOf(date)
  if (index > -1) {
    selectedDates.value.splice(index, 1)
  } else {
    selectedDates.value.push(date)
  }
}

function clearSelection() {
  selectedDates.value = []
}

function startDragEmployee(event: DragEvent, employee: Employee) {
  draggedEmployee.value = employee
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
  }
}

async function handleDrop(event: DragEvent, date: string) {
  event.preventDefault()
  if (!draggedEmployee.value) return

  // Show shift selection modal or use default shift
  if (availableShifts.value.length === 0) {
    alert('請先建立班表')
    return
  }

  // For simplicity, assign the first available shift
  // In production, you'd want to show a modal to select the shift
  const shiftId = availableShifts.value[0].id

  await assignShift(draggedEmployee.value.id, shiftId, date)
  draggedEmployee.value = null
}

async function assignShift(employeeId: string, shiftId: string, date: string) {
  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(`${API_BASE}/items/employee_shifts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        employee_id: employeeId,
        shift_schedule_id: shiftId,
        effective_date: date,
      }),
    })

    if (response.ok) {
      await fetchEmployeeShifts()
    }
  } catch (error) {
    console.error('Failed to assign shift:', error)
  }
}

async function batchAssignShifts() {
  try {
    const token = localStorage.getItem('auth_token')

    // Create assignments for all selected dates
    const assignments = selectedDates.value.map(date => ({
      employee_id: batchAssignData.value.employee_id,
      shift_schedule_id: batchAssignData.value.shift_schedule_id,
      effective_date: date,
    }))

    await Promise.all(
      assignments.map(assignment =>
        fetch(`${API_BASE}/items/employee_shifts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(assignment),
        })
      )
    )

    useToast().success(MESSAGES.SUCCESS.SCHEDULE_ASSIGNED)
    await fetchEmployeeShifts()
    showBatchAssignModal.value = false
    clearSelection()
    batchAssignData.value = { employee_id: '', shift_schedule_id: '' }
  } catch (error) {
    console.error('Failed to batch assign shifts:', error)
    useToast().error(MESSAGES.ERRORS.SCHEDULE_ASSIGN_FAILED)
  }
}

async function removeAssignment(id: string) {
  const { confirm } = useConfirm()
  const confirmed = await confirm({
    title: '移除排班',
    message: '確定要移除此排班嗎？',
    type: 'warning'
  })

  if (!confirmed) return

  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(`${API_BASE}/items/employee_shifts/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (response.ok) {
      useToast().success('排班已移除')
      await fetchEmployeeShifts()
    }
  } catch (error) {
    console.error('Failed to remove assignment:', error)
    useToast().error('移除排班失敗，請稍後再試')
  }
}

async function fetchEmployees() {
  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(`${API_BASE}/items/employees?fields=id,name,job_title.name`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()
    employees.value = data.data || []
  } catch (error) {
    console.error('Failed to fetch employees:', error)
  }
}

async function fetchShifts() {
  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(`${API_BASE}/items/shift_schedules?filter[status][_eq]=active`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()
    availableShifts.value = data.data || []
  } catch (error) {
    console.error('Failed to fetch shifts:', error)
  }
}

async function fetchEmployeeShifts() {
  try {
    const token = localStorage.getItem('auth_token')
    const year = currentDate.value.getFullYear()
    const month = currentDate.value.getMonth()
    const startDate = new Date(year, month, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const response = await fetch(
      `${API_BASE}/items/employee_shifts?filter[effective_date][_between]=[${startDate},${endDate}]`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
    const data = await response.json()
    employeeShifts.value = data.data || []
  } catch (error) {
    console.error('Failed to fetch employee shifts:', error)
  }
}

onMounted(() => {
  fetchEmployees()
  fetchShifts()
  fetchEmployeeShifts()
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');

.calendar-management {
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
  margin-bottom: 2rem;
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
  gap: 2rem;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-nav {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #e5e5e5;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-nav:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.month-display {
  padding: 0.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.month-year {
  font-size: 1rem;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
}

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
  white-space: nowrap;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(10, 132, 255, 0.4);
}

.btn-primary-sm {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #0A84FF 0%, #64D2FF 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-icon {
  font-size: 1.25rem;
  line-height: 1;
}

/* Shift Legend */
.shift-legend {
  margin-bottom: 2rem;
  padding: 1.5rem 2rem;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  animation: fadeIn 0.8s;
}

.legend-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #737373;
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.legend-color {
  width: 32px;
  height: 16px;
  border-radius: 8px;
}

.legend-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #ffffff;
}

.legend-time {
  font-size: 0.8125rem;
  color: #737373;
}

/* Layout */
.layout-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 2rem;
  animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Employees Sidebar */
.employees-sidebar {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 1.5rem;
  height: fit-content;
  max-height: calc(100vh - 300px);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  margin-bottom: 1.5rem;
}

.sidebar-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 1rem 0;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #ffffff;
  font-size: 0.875rem;
  font-family: inherit;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  border-color: #0A84FF;
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
}

.employee-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.employee-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  cursor: grab;
  transition: all 0.2s;
}

.employee-card:active {
  cursor: grabbing;
}

.employee-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateX(4px);
}

.employee-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #0A84FF, #64D2FF);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 1rem;
  flex-shrink: 0;
}

.employee-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.employee-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #ffffff;
}

.employee-role {
  font-size: 0.8125rem;
  color: #737373;
}

.drag-handle {
  color: #737373;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.employee-card:hover .drag-handle {
  opacity: 1;
}

/* Calendar */
.calendar-container {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 2rem;
}

.calendar-grid {
  margin-bottom: 1.5rem;
}

.calendar-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  margin-bottom: 1px;
}

.weekday-cell {
  padding: 1rem;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: #737373;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.calendar-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  overflow: hidden;
}

.day-cell {
  min-height: 120px;
  padding: 0.75rem;
  background: rgba(26, 26, 26, 0.6);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.day-cell:hover {
  background: rgba(255, 255, 255, 0.05);
}

.day-cell.other-month {
  opacity: 0.4;
}

.day-cell.today {
  background: rgba(10, 132, 255, 0.1);
  border: 2px solid rgba(10, 132, 255, 0.3);
}

.day-cell.selected {
  background: rgba(10, 132, 255, 0.15);
  border: 2px solid rgba(10, 132, 255, 0.5);
}

.day-number {
  font-size: 0.875rem;
  font-weight: 600;
  color: #e5e5e5;
  margin-bottom: 0.5rem;
}

.day-shifts {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.shift-assignment {
  padding: 0.5rem 0.625rem;
  border-radius: 8px;
  font-size: 0.75rem;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.375rem;
  transition: all 0.2s;
  cursor: default;
}

.shift-assignment:hover {
  transform: scale(1.02);
}

.assignment-name {
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assignment-shift {
  font-size: 0.6875rem;
  opacity: 0.8;
}

.remove-btn {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
}

.shift-assignment:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: rgba(255, 59, 48, 0.8);
}

/* Selection Info */
.selection-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: rgba(10, 132, 255, 0.1);
  border: 1px solid rgba(10, 132, 255, 0.3);
  border-radius: 14px;
}

.selection-text {
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #64D2FF;
}

.btn-text {
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  color: #e5e5e5;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-text:hover {
  background: rgba(255, 255, 255, 0.05);
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
  max-width: 500px;
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

.form-select:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  border-color: #0A84FF;
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
}

.selected-dates-preview {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.preview-label {
  font-size: 0.8125rem;
  color: #737373;
  margin-bottom: 0.75rem;
}

.dates-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.date-chip {
  padding: 0.375rem 0.75rem;
  background: rgba(10, 132, 255, 0.15);
  border: 1px solid rgba(10, 132, 255, 0.3);
  border-radius: 8px;
  color: #64D2FF;
  font-size: 0.8125rem;
  font-weight: 600;
}

.form-actions {
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
}

.form-actions button {
  flex: 1;
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

/* Scrollbar */
.employee-list::-webkit-scrollbar {
  width: 6px;
}

.employee-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 3px;
}

.employee-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.employee-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
