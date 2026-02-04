<template>
  <div class="apple-page">
    <!-- Page Header -->
    <header class="page-header">
      <h1 class="page-title">週行事曆</h1>
      <p class="page-subtitle">{{ formatWeekRange(currentWeekStart) }}</p>
    </header>

    <!-- Week Navigation -->
    <div class="week-nav-section">
      <div class="week-nav-card">
        <button class="nav-button" @click="previousWeek">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div class="week-display">
          <span class="week-range">{{ formatWeekLabel(currentWeekStart) }}</span>
          <button class="today-button" @click="goToToday">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
            </svg>
            今天
          </button>
        </div>

        <button class="nav-button" @click="nextWeek">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Week Stats Summary -->
    <div v-if="schedule && !loading" class="stats-section">
      <div class="stats-grid">
        <div class="stat-card stat-total">
          <div class="stat-number">{{ weekStats.total }}</div>
          <div class="stat-label">本週課程</div>
        </div>
        <div class="stat-card stat-completed">
          <div class="stat-number">{{ weekStats.completed }}</div>
          <div class="stat-label">已完成</div>
        </div>
        <div class="stat-card stat-upcoming">
          <div class="stat-number">{{ weekStats.upcoming }}</div>
          <div class="stat-label">待上課</div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="apple-spinner" />
      <p>載入行事曆中...</p>
    </div>

    <!-- Week Calendar -->
    <div v-else class="calendar-section">
      <div
        v-for="(day, index) in weekDays"
        :key="day.date"
        class="day-card stagger-item"
        :style="{ animationDelay: `${index * 0.05}s` }"
        :class="{ 'is-today': isToday(day.date) }"
      >
        <!-- Day Header -->
        <div class="day-header" :class="{ today: isToday(day.date) }">
          <div class="day-info">
            <span v-if="isToday(day.date)" class="today-indicator" />
            <span class="day-name">{{ formatDayHeader(day.date) }}</span>
          </div>
          <span class="class-count">{{ getClassCount(day.date) }} 堂課</span>
        </div>

        <!-- Day Content -->
        <div v-if="getClassesForDay(day.date).length > 0" class="day-content">
          <div
            v-for="classItem in getClassesForDay(day.date)"
            :key="classItem.id"
            class="schedule-item"
            @click="goToClass(classItem.id)"
          >
            <div class="item-time-bar" :class="getStatusBarClass(classItem.status)" />
            <div class="item-content">
              <div class="item-time">{{ formatTime(classItem.scheduled_at) }}</div>
              <div class="item-details">
                <span class="item-name">{{ classItem.member.full_name }}</span>
                <span class="item-duration">{{ classItem.duration_minutes }}分</span>
              </div>
            </div>
            <span class="item-status" :class="getStatusClass(classItem.status)">
              {{ getStatusText(classItem.status) }}
            </span>
          </div>
        </div>

        <!-- Empty Day -->
        <div v-else class="day-empty">
          <span>沒有排課</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClassBooking } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { schedule, loading, getSchedule } = useCoachClasses()

const currentWeekStart = ref(getMonday(new Date()))

const weekDays = computed(() => {
  const days = []
  const start = new Date(currentWeekStart.value)
  for (let i = 0; i < 7; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    days.push({
      date: date.toISOString().split('T')[0]!,
      dayOfWeek: date.getDay(),
    })
  }
  return days
})

const weekStats = computed(() => {
  if (!schedule.value?.classes) return { total: 0, completed: 0, upcoming: 0 }

  const classes = schedule.value.classes
  return {
    total: classes.length,
    completed: classes.filter(c => c.status === 'COMPLETED').length,
    upcoming: classes.filter(c => c.status === 'BOOKED').length,
  }
})

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function previousWeek() {
  const newDate = new Date(currentWeekStart.value)
  newDate.setDate(newDate.getDate() - 7)
  currentWeekStart.value = newDate
  loadSchedule()
}

function nextWeek() {
  const newDate = new Date(currentWeekStart.value)
  newDate.setDate(newDate.getDate() + 7)
  currentWeekStart.value = newDate
  loadSchedule()
}

function goToToday() {
  currentWeekStart.value = getMonday(new Date())
  loadSchedule()
}

function formatWeekRange(start: Date) {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const startMonth = start.toLocaleDateString('zh-TW', { month: 'short' })
  const endMonth = end.toLocaleDateString('zh-TW', { month: 'short' })

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}日`
  }
  return `${startMonth} ${start.getDate()}日 - ${endMonth} ${end.getDate()}日`
}

function formatWeekLabel(start: Date) {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`
}

function formatDayHeader(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  })
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split('T')[0]!
}

function getClassesForDay(dateStr: string): ClassBooking[] {
  if (!schedule.value?.classes) return []
  return schedule.value.classes.filter(c => {
    const classDate = new Date(c.scheduled_at).toISOString().split('T')[0]!
    return classDate === dateStr
  })
}

function getClassCount(dateStr: string) {
  return getClassesForDay(dateStr).length
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusBarClass(status: string) {
  const classes: Record<string, string> = {
    BOOKED: 'bar-blue',
    COMPLETED: 'bar-green',
    MEMBER_CANCELLED: 'bar-gray',
    COACH_CANCELLED: 'bar-gray',
    NO_SHOW: 'bar-red',
  }
  return classes[status] || 'bar-gray'
}

function getStatusClass(status: string) {
  const classes: Record<string, string> = {
    BOOKED: 'status-blue',
    COMPLETED: 'status-green',
    MEMBER_CANCELLED: 'status-gray',
    COACH_CANCELLED: 'status-gray',
    NO_SHOW: 'status-red',
  }
  return classes[status] || 'status-gray'
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    BOOKED: '待上課',
    COMPLETED: '已完成',
    MEMBER_CANCELLED: '學員取消',
    COACH_CANCELLED: '教練取消',
    NO_SHOW: '未到',
  }
  return texts[status] || status
}

function goToClass(id: string) {
  router.push(`/classes/${id}`)
}

async function loadSchedule() {
  const endDate = new Date(currentWeekStart.value)
  endDate.setDate(endDate.getDate() + 6)

  await getSchedule({
    start_date: currentWeekStart.value.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
  })
}

onMounted(() => {
  loadSchedule()
})
</script>

<style scoped>
/* ============================================
   APPLE-STYLE SCHEDULE PAGE
   ============================================ */

.apple-page {
  min-height: 100vh;
  background: var(--bg-primary);
  animation: fadeIn 0.6s var(--ease-apple);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Page Header */
.page-header {
  padding: 20px 20px 0 20px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 15px;
  color: var(--text-tertiary);
  margin: 0;
}

/* Week Navigation */
.week-nav-section {
  padding: 16px 20px;
}

.week-nav-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--separator);
  padding: 12px 16px;
  box-shadow: var(--shadow-sm);
}

.nav-button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--fill-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.nav-button:hover {
  background: var(--fill-secondary);
}

.nav-button:active {
  transform: scale(0.92);
}

.nav-button svg {
  width: 20px;
  height: 20px;
  color: var(--text-primary);
}

.week-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.week-range {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.today-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: none;
  background: rgba(0, 122, 255, 0.12);
  color: var(--apple-blue);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.today-button:hover {
  background: rgba(0, 122, 255, 0.2);
}

.today-button:active {
  transform: scale(0.96);
}

.today-button svg {
  width: 14px;
  height: 14px;
}

/* Stats Section */
.stats-section {
  padding: 0 20px 16px 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--separator);
  padding: 16px;
  text-align: center;
  box-shadow: var(--shadow-sm);
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.stat-total .stat-number {
  color: var(--apple-blue);
}

.stat-completed .stat-number {
  color: var(--apple-green);
}

.stat-upcoming .stat-number {
  color: var(--apple-orange);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.loading-state p {
  margin-top: 16px;
  color: var(--text-tertiary);
  font-size: 15px;
}

/* Calendar Section */
.calendar-section {
  padding: 0 20px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.day-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--separator);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.day-card.is-today {
  border-color: var(--apple-blue);
  border-width: 2px;
}

/* Day Header */
.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--fill-quaternary);
  border-bottom: 0.5px solid var(--separator);
}

.day-header.today {
  background: rgba(0, 122, 255, 0.08);
}

.day-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--apple-blue);
}

.day-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.class-count {
  font-size: 13px;
  color: var(--text-tertiary);
}

/* Day Content */
.day-content {
  padding: 8px;
}

.schedule-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.15s var(--ease-apple);
}

.schedule-item:hover {
  background: var(--fill-quaternary);
}

.schedule-item:active {
  background: var(--fill-tertiary);
}

.item-time-bar {
  width: 4px;
  height: 36px;
  border-radius: 2px;
  margin-right: 12px;
  flex-shrink: 0;
}

.item-time-bar.bar-blue {
  background: var(--apple-blue);
}

.item-time-bar.bar-green {
  background: var(--apple-green);
}

.item-time-bar.bar-red {
  background: var(--apple-red);
}

.item-time-bar.bar-gray {
  background: var(--text-tertiary);
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-time {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.item-details {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.item-duration {
  font-size: 12px;
  color: var(--text-tertiary);
}

.item-status {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  margin-left: 8px;
  flex-shrink: 0;
}

.item-status.status-blue {
  background: rgba(0, 122, 255, 0.12);
  color: var(--apple-blue);
}

.item-status.status-green {
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

.item-status.status-red {
  background: rgba(255, 59, 48, 0.12);
  color: var(--apple-red);
}

.item-status.status-gray {
  background: var(--fill-tertiary);
  color: var(--text-tertiary);
}

/* Empty Day */
.day-empty {
  padding: 24px 16px;
  text-align: center;
}

.day-empty span {
  font-size: 14px;
  color: var(--text-quaternary);
}

/* Dark mode */
.dark .week-nav-card,
.dark .stat-card,
.dark .day-card {
  background: var(--bg-secondary);
}

/* Responsive */
@media (min-width: 768px) {
  .page-header {
    padding: 24px 24px 0 24px;
  }

  .week-nav-section {
    padding: 20px 24px;
  }

  .stats-section {
    padding: 0 24px 20px 24px;
  }

  .calendar-section {
    padding: 0 24px 24px 24px;
  }

  .stats-grid {
    gap: 16px;
  }

  .stat-card {
    padding: 20px;
  }

  .stat-number {
    font-size: 32px;
  }
}
</style>
