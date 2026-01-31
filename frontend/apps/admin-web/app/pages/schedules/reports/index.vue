<template>
  <div class="reports-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="page-title">出勤統計</h1>
          <p class="page-subtitle">Attendance Reports</p>
        </div>
        <div class="header-actions">
          <div class="date-range-picker">
            <input
              v-model="dateRange.start"
              type="date"
              class="date-input"
            />
            <span class="date-separator">至</span>
            <input
              v-model="dateRange.end"
              type="date"
              class="date-input"
            />
            <button class="btn-primary" @click="fetchReports">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>更新</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Stats Overview Cards -->
    <div class="stats-grid">
      <div class="stat-card late" :style="{ animationDelay: '0s' }">
        <div class="stat-icon">⏰</div>
        <div class="stat-content">
          <div class="stat-label">遲到次數</div>
          <div class="stat-value">{{ stats.lateCount }} 次</div>
          <div class="stat-detail">總計 {{ stats.lateTotalMinutes }} 分鐘</div>
        </div>
        <div class="stat-trend">
          <span class="trend-value" :class="{ negative: stats.lateTrend > 0 }">
            {{ stats.lateTrend > 0 ? '+' : '' }}{{ stats.lateTrend }}%
          </span>
        </div>
      </div>

      <div class="stat-card early-leave" :style="{ animationDelay: '0.1s' }">
        <div class="stat-icon">🚀</div>
        <div class="stat-content">
          <div class="stat-label">早退次數</div>
          <div class="stat-value">{{ stats.earlyLeaveCount }} 次</div>
          <div class="stat-detail">總計 {{ stats.earlyLeaveTotalMinutes }} 分鐘</div>
        </div>
        <div class="stat-trend">
          <span class="trend-value" :class="{ negative: stats.earlyLeaveTrend > 0 }">
            {{ stats.earlyLeaveTrend > 0 ? '+' : '' }}{{ stats.earlyLeaveTrend }}%
          </span>
        </div>
      </div>

      <div class="stat-card overtime" :style="{ animationDelay: '0.2s' }">
        <div class="stat-icon">💼</div>
        <div class="stat-content">
          <div class="stat-label">加班時數</div>
          <div class="stat-value">{{ stats.overtimeTotalHours.toFixed(1) }} 小時</div>
          <div class="stat-detail">{{ stats.overtimeCount }} 次加班</div>
        </div>
        <div class="stat-trend">
          <span class="trend-value" :class="{ positive: stats.overtimeTrend > 0 }">
            {{ stats.overtimeTrend > 0 ? '+' : '' }}{{ stats.overtimeTrend }}%
          </span>
        </div>
      </div>

      <div class="stat-card total" :style="{ animationDelay: '0.3s' }">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-label">總出勤天數</div>
          <div class="stat-value">{{ stats.totalDays }} 天</div>
          <div class="stat-detail">出勤率 {{ stats.attendanceRate }}%</div>
        </div>
        <div class="stat-trend">
          <span class="trend-value positive">
            {{ stats.attendanceRate }}%
          </span>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-section">
      <!-- Daily Trends Chart -->
      <div class="chart-card">
        <div class="chart-header">
          <h3 class="chart-title">每日趨勢</h3>
          <div class="chart-legend">
            <div class="legend-item">
              <span class="legend-dot late"></span>
              <span>遲到</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot early-leave"></span>
              <span>早退</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot overtime"></span>
              <span>加班</span>
            </div>
          </div>
        </div>
        <div class="chart-container">
          <div class="chart-bars">
            <div
              v-for="(day, index) in dailyTrends"
              :key="index"
              class="bar-group"
              :style="{ animationDelay: `${index * 0.02}s` }"
            >
              <div class="bars">
                <div
                  class="bar late"
                  :style="{ height: `${(day.late / maxValue) * 100}%` }"
                  :title="`遲到: ${day.late} 分鐘`"
                ></div>
                <div
                  class="bar early-leave"
                  :style="{ height: `${(day.earlyLeave / maxValue) * 100}%` }"
                  :title="`早退: ${day.earlyLeave} 分鐘`"
                ></div>
                <div
                  class="bar overtime"
                  :style="{ height: `${(day.overtime / maxValue) * 100}%` }"
                  :title="`加班: ${day.overtime} 小時`"
                ></div>
              </div>
              <div class="bar-label">{{ formatDateLabel(day.date) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Employee Rankings -->
      <div class="chart-card">
        <div class="chart-header">
          <h3 class="chart-title">員工排名</h3>
          <select v-model="rankingType" class="ranking-select">
            <option value="late">遲到次數</option>
            <option value="earlyLeave">早退次數</option>
            <option value="overtime">加班時數</option>
          </select>
        </div>
        <div class="rankings-list">
          <div
            v-for="(employee, index) in employeeRankings"
            :key="employee.id"
            class="ranking-item"
            :style="{ animationDelay: `${index * 0.05}s` }"
          >
            <div class="ranking-position">
              <span class="position-number" :class="{ top: index < 3 }">
                {{ index + 1 }}
              </span>
            </div>
            <div class="ranking-employee">
              <div class="employee-avatar">
                {{ employee.name?.charAt(0) || '?' }}
              </div>
              <div class="employee-details">
                <div class="employee-name">{{ employee.name }}</div>
                <div class="employee-dept">{{ employee.department || '未設定部門' }}</div>
              </div>
            </div>
            <div class="ranking-value">
              <span class="value-number">{{ employee.value }}</span>
              <span class="value-unit">{{ getRankingUnit() }}</span>
            </div>
            <div class="ranking-bar">
              <div
                class="bar-fill"
                :class="rankingType"
                :style="{ width: `${(employee.value / maxRankingValue) * 100}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detailed Records Table -->
    <div class="records-section">
      <div class="section-header">
        <h3 class="section-title">詳細記錄</h3>
        <div class="table-filters">
          <select v-model="filterEmployee" class="filter-select">
            <option value="">所有員工</option>
            <option v-for="emp in employees" :key="emp.id" :value="emp.id">
              {{ emp.name }}
            </option>
          </select>
          <select v-model="filterStatus" class="filter-select">
            <option value="">所有狀態</option>
            <option value="LATE">遲到</option>
            <option value="EARLY_LEAVE">早退</option>
            <option value="PRESENT">正常</option>
          </select>
        </div>
      </div>
      <div class="records-table-container">
        <table class="records-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>員工</th>
              <th>打卡時間</th>
              <th>退勤時間</th>
              <th>工作時數</th>
              <th>遲到</th>
              <th>早退</th>
              <th>加班</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(record, index) in filteredRecords"
              :key="record.id"
              class="record-row"
              :style="{ animationDelay: `${index * 0.02}s` }"
            >
              <td>{{ formatDate(record.attendance_date) }}</td>
              <td>
                <div class="employee-cell">
                  <div class="employee-avatar-sm">
                    {{ getEmployeeName(record.employee_id)?.charAt(0) || '?' }}
                  </div>
                  <span>{{ getEmployeeName(record.employee_id) }}</span>
                </div>
              </td>
              <td>{{ formatTime(record.check_in) }}</td>
              <td>{{ formatTime(record.check_out) }}</td>
              <td>{{ record.work_hours || 0 }}h</td>
              <td>
                <span v-if="record.late_minutes > 0" class="badge late">
                  {{ record.late_minutes }}分
                </span>
                <span v-else class="badge normal">-</span>
              </td>
              <td>
                <span v-if="record.early_leave_minutes > 0" class="badge early-leave">
                  {{ record.early_leave_minutes }}分
                </span>
                <span v-else class="badge normal">-</span>
              </td>
              <td>
                <span v-if="record.overtime_hours > 0" class="badge overtime">
                  {{ record.overtime_hours }}h
                </span>
                <span v-else class="badge normal">-</span>
              </td>
              <td>
                <span class="status-badge" :class="record.attendance_status?.toLowerCase()">
                  {{ getStatusLabel(record.attendance_status) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Attendance {
  id: string
  employee_id: string
  attendance_date: string
  check_in: string
  check_out: string
  work_hours: number
  late_minutes: number
  early_leave_minutes: number
  overtime_hours: number
  attendance_status: string
}

interface Employee {
  id: string
  name: string
  department?: string
}

interface DailyTrend {
  date: string
  late: number
  earlyLeave: number
  overtime: number
}

const API_BASE = 'http://localhost:8055'

const dateRange = ref({
  start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  end: new Date().toISOString().split('T')[0],
})

const attendances = ref<Attendance[]>([])
const employees = ref<Employee[]>([])
const filterEmployee = ref('')
const filterStatus = ref('')
const rankingType = ref<'late' | 'earlyLeave' | 'overtime'>('late')

const stats = computed(() => {
  const lateRecords = attendances.value.filter(a => a.late_minutes > 0)
  const earlyLeaveRecords = attendances.value.filter(a => a.early_leave_minutes > 0)
  const overtimeRecords = attendances.value.filter(a => a.overtime_hours > 0)

  return {
    lateCount: lateRecords.length,
    lateTotalMinutes: lateRecords.reduce((sum, a) => sum + a.late_minutes, 0),
    lateTrend: 0, // Calculate based on historical data

    earlyLeaveCount: earlyLeaveRecords.length,
    earlyLeaveTotalMinutes: earlyLeaveRecords.reduce((sum, a) => sum + a.early_leave_minutes, 0),
    earlyLeaveTrend: 0,

    overtimeCount: overtimeRecords.length,
    overtimeTotalHours: overtimeRecords.reduce((sum, a) => sum + Number(a.overtime_hours), 0),
    overtimeTrend: 0,

    totalDays: attendances.value.length,
    attendanceRate: attendances.value.length > 0
      ? Math.round((attendances.value.filter(a => a.attendance_status === 'PRESENT').length / attendances.value.length) * 100)
      : 0,
  }
})

const dailyTrends = computed((): DailyTrend[] => {
  const trendsMap = new Map<string, DailyTrend>()

  attendances.value.forEach(attendance => {
    const date = attendance.attendance_date
    if (!trendsMap.has(date)) {
      trendsMap.set(date, {
        date,
        late: 0,
        earlyLeave: 0,
        overtime: 0,
      })
    }

    const trend = trendsMap.get(date)!
    trend.late += attendance.late_minutes
    trend.earlyLeave += attendance.early_leave_minutes
    trend.overtime += Number(attendance.overtime_hours)
  })

  return Array.from(trendsMap.values()).sort((a, b) => a.date.localeCompare(b.date))
})

const maxValue = computed(() => {
  let max = 0
  dailyTrends.value.forEach(day => {
    max = Math.max(max, day.late, day.earlyLeave, day.overtime * 60) // Convert overtime hours to minutes for comparison
  })
  return max || 100
})

const employeeRankings = computed(() => {
  const rankingsMap = new Map<string, { id: string; name: string; department?: string; value: number }>()

  attendances.value.forEach(attendance => {
    const empId = attendance.employee_id
    const employee = employees.value.find(e => e.id === empId)
    if (!employee) return

    if (!rankingsMap.has(empId)) {
      rankingsMap.set(empId, {
        id: empId,
        name: employee.name,
        department: employee.department,
        value: 0,
      })
    }

    const ranking = rankingsMap.get(empId)!
    if (rankingType.value === 'late') {
      ranking.value += attendance.late_minutes > 0 ? 1 : 0
    } else if (rankingType.value === 'earlyLeave') {
      ranking.value += attendance.early_leave_minutes > 0 ? 1 : 0
    } else if (rankingType.value === 'overtime') {
      ranking.value += Number(attendance.overtime_hours)
    }
  })

  return Array.from(rankingsMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
})

const maxRankingValue = computed(() => {
  return Math.max(...employeeRankings.value.map(e => e.value), 1)
})

const filteredRecords = computed(() => {
  let records = attendances.value

  if (filterEmployee.value) {
    records = records.filter(r => r.employee_id === filterEmployee.value)
  }

  if (filterStatus.value) {
    records = records.filter(r => r.attendance_status === filterStatus.value)
  }

  return records.sort((a, b) => b.attendance_date.localeCompare(a.attendance_date))
})

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '-'
  const date = new Date(timeStr)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function getEmployeeName(employeeId: string): string {
  const employee = employees.value.find(e => e.id === employeeId)
  return employee?.name || '未知'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PRESENT: '正常',
    LATE: '遲到',
    EARLY_LEAVE: '早退',
    ABSENT: '缺勤',
    LEAVE: '請假',
    HOLIDAY: '休假',
  }
  return labels[status] || status
}

function getRankingUnit(): string {
  return rankingType.value === 'overtime' ? '小時' : '次'
}

async function fetchEmployees() {
  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(`${API_BASE}/items/employees?fields=id,name`, {
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

async function fetchReports() {
  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(
      `${API_BASE}/items/attendances?filter[attendance_date][_between]=[${dateRange.value.start},${dateRange.value.end}]&limit=-1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
    const data = await response.json()
    attendances.value = data.data || []
  } catch (error) {
    console.error('Failed to fetch reports:', error)
  }
}

onMounted(() => {
  fetchEmployees()
  fetchReports()
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');

.reports-page {
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

.date-range-picker {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.date-input {
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #ffffff;
  font-size: 0.875rem;
  font-family: inherit;
}

.date-input:focus {
  outline: none;
  border-color: #0A84FF;
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
}

.date-separator {
  color: #737373;
  font-size: 0.875rem;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: linear-gradient(135deg, #0A84FF 0%, #64D2FF 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(10, 132, 255, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(10, 132, 255, 0.4);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  opacity: 0;
  transition: opacity 0.3s;
}

.stat-card.late::before {
  background: linear-gradient(90deg, #FF3B30, #FF9500);
}

.stat-card.early-leave::before {
  background: linear-gradient(90deg, #FFCC00, #FF9500);
}

.stat-card.overtime::before {
  background: linear-gradient(90deg, #0A84FF, #64D2FF);
}

.stat-card.total::before {
  background: linear-gradient(90deg, #34C759, #30DB5B);
}

.stat-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.stat-card:hover::before {
  opacity: 1;
}

.stat-icon {
  font-size: 2.5rem;
  opacity: 0.8;
}

.stat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.stat-label {
  font-size: 0.8125rem;
  color: #737373;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #ffffff;
  line-height: 1;
}

.stat-detail {
  font-size: 0.875rem;
  color: #a1a1a1;
}

.stat-trend {
  display: flex;
  align-items: center;
}

.trend-value {
  padding: 0.375rem 0.75rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
}

.trend-value.positive {
  background: rgba(52, 199, 89, 0.15);
  color: #34C759;
}

.trend-value.negative {
  background: rgba(255, 59, 48, 0.15);
  color: #FF3B30;
}

/* Charts Section */
.charts-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
}

.chart-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 2rem;
  animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.chart-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
}

.chart-legend {
  display: flex;
  gap: 1.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #a1a1a1;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.legend-dot.late {
  background: linear-gradient(135deg, #FF3B30, #FF9500);
}

.legend-dot.early-leave {
  background: linear-gradient(135deg, #FFCC00, #FF9500);
}

.legend-dot.overtime {
  background: linear-gradient(135deg, #0A84FF, #64D2FF);
}

.chart-container {
  height: 300px;
}

.chart-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 100%;
  gap: 0.5rem;
}

.bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

.bars {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  width: 100%;
}

.bar {
  flex: 1;
  min-height: 4px;
  border-radius: 4px 4px 0 0;
  transition: all 0.3s;
  cursor: pointer;
  animation: growUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

.bar.late {
  background: linear-gradient(180deg, #FF9500, #FF3B30);
}

.bar.early-leave {
  background: linear-gradient(180deg, #FF9500, #FFCC00);
}

.bar.overtime {
  background: linear-gradient(180deg, #64D2FF, #0A84FF);
}

.bar:hover {
  opacity: 0.8;
  transform: scaleY(1.05);
}

.bar-label {
  font-size: 0.75rem;
  color: #737373;
  text-align: center;
}

/* Rankings */
.ranking-select {
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #ffffff;
  font-size: 0.875rem;
  font-family: inherit;
}

.rankings-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ranking-item {
  display: grid;
  grid-template-columns: 40px 1fr 80px;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.3s;
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

.ranking-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.ranking-position {
  display: flex;
  align-items: center;
  justify-content: center;
}

.position-number {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 700;
  color: #a1a1a1;
}

.position-number.top {
  background: linear-gradient(135deg, #0A84FF, #64D2FF);
  color: #ffffff;
}

.ranking-employee {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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
}

.employee-details {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.employee-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #ffffff;
}

.employee-dept {
  font-size: 0.8125rem;
  color: #737373;
}

.ranking-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.125rem;
}

.value-number {
  font-size: 1.25rem;
  font-weight: 700;
  color: #ffffff;
}

.value-unit {
  font-size: 0.75rem;
  color: #737373;
}

.ranking-bar {
  grid-column: 2 / 4;
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.bar-fill.late {
  background: linear-gradient(90deg, #FF3B30, #FF9500);
}

.bar-fill.earlyLeave {
  background: linear-gradient(90deg, #FFCC00, #FF9500);
}

.bar-fill.overtime {
  background: linear-gradient(90deg, #0A84FF, #64D2FF);
}

/* Records Section */
.records-section {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 2rem;
  animation: fadeInUp 1s cubic-bezier(0.16, 1, 0.3, 1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
}

.table-filters {
  display: flex;
  gap: 1rem;
}

.filter-select {
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #ffffff;
  font-size: 0.875rem;
  font-family: inherit;
}

.records-table-container {
  overflow-x: auto;
}

.records-table {
  width: 100%;
  border-collapse: collapse;
}

.records-table thead th {
  padding: 1rem;
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #737373;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.record-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s;
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

.record-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.record-row td {
  padding: 1rem;
  font-size: 0.875rem;
  color: #e5e5e5;
}

.employee-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.employee-avatar-sm {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, #0A84FF, #64D2FF);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.75rem;
}

.badge {
  padding: 0.25rem 0.625rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  display: inline-block;
}

.badge.late {
  background: rgba(255, 59, 48, 0.15);
  color: #FF3B30;
}

.badge.early-leave {
  background: rgba(255, 204, 0, 0.15);
  color: #FFCC00;
}

.badge.overtime {
  background: rgba(10, 132, 255, 0.15);
  color: #64D2FF;
}

.badge.normal {
  background: rgba(255, 255, 255, 0.05);
  color: #737373;
}

.status-badge {
  padding: 0.375rem 0.75rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  display: inline-block;
}

.status-badge.present {
  background: rgba(52, 199, 89, 0.15);
  color: #34C759;
}

.status-badge.late {
  background: rgba(255, 59, 48, 0.15);
  color: #FF3B30;
}

.status-badge.early_leave {
  background: rgba(255, 204, 0, 0.15);
  color: #FFCC00;
}

.status-badge.absent {
  background: rgba(255, 59, 48, 0.15);
  color: #FF3B30;
}

.status-badge.leave {
  background: rgba(10, 132, 255, 0.15);
  color: #64D2FF;
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

@keyframes growUp {
  from {
    height: 0;
  }
}

/* Scrollbar */
.records-table-container::-webkit-scrollbar {
  height: 8px;
}

.records-table-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}

.records-table-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.records-table-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
