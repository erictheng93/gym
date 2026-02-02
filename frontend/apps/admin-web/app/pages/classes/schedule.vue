<script setup lang="ts">
/**
 * 課程排程頁面
 *
 * 週視圖顯示課程場次
 */
import { MESSAGES, PAGES } from '~/constants'
import { getSessionStatusBadge, formatDate } from '@gym-nexus/shared'
import type { ClassSession } from '~/types/schema'

definePageMeta({
  middleware: 'auth'
})

const { sessions, isLoading, fetchSessions, cancelSession, getSessionStats } = useClassSchedule()
const { branches, fetchBranches } = useBranches()
const toast = useToast()
const { confirm } = useConfirm()

// Filter state
const selectedBranch = ref('')
const currentWeekStart = ref(getMonday(new Date()))

// Stats
const stats = ref({ scheduled: 0, completed: 0, cancelled: 0 })

// Day names
const dayNames = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

// Get Monday of a given date
function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

// Generate week dates from a start date
const weekDates = computed(() => {
  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(currentWeekStart.value)
    date.setDate(date.getDate() + i)
    dates.push(date)
  }
  return dates
})

// Format date for display
const formatDateDisplay = (date: Date) => {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

// Format date for API
const formatDateApi = (date: Date) => {
  return date.toISOString().split('T')[0]
}

// Week label
const weekLabel = computed(() => {
  const start = weekDates.value[0]
  const end = weekDates.value[6]
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`
})

// Group sessions by date
const sessionsByDate = computed(() => {
  const grouped: Record<string, ClassSession[]> = {}

  weekDates.value.forEach(date => {
    const dateStr = formatDateApi(date)
    grouped[dateStr] = []
  })

  sessions.value.forEach(session => {
    if (grouped[session.session_date]) {
      grouped[session.session_date].push(session)
    }
  })

  // Sort sessions by start time
  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a, b) => a.start_time.localeCompare(b.start_time))
  })

  return grouped
})

// Check if date is today
const isToday = (date: Date) => {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

// Navigate week
const goToPrevWeek = () => {
  const prevWeek = new Date(currentWeekStart.value)
  prevWeek.setDate(prevWeek.getDate() - 7)
  currentWeekStart.value = prevWeek
}

const goToNextWeek = () => {
  const nextWeek = new Date(currentWeekStart.value)
  nextWeek.setDate(nextWeek.getDate() + 7)
  currentWeekStart.value = nextWeek
}

const goToCurrentWeek = () => {
  currentWeekStart.value = getMonday(new Date())
}

// Load sessions
const loadSessions = async () => {
  const startDate = formatDateApi(weekDates.value[0])
  const endDate = formatDateApi(weekDates.value[6])

  await fetchSessions({
    branchId: selectedBranch.value || undefined,
    startDate,
    endDate
  })

  // Load stats
  const statsResult = await getSessionStats(
    selectedBranch.value || undefined,
    startDate,
    endDate
  )
  stats.value = statsResult
}

// Watch filters
watch([currentWeekStart, selectedBranch], () => {
  loadSessions()
})

// Initial load
onMounted(async () => {
  await fetchBranches()
  await loadSessions()
})

// Cancel session handler
const handleCancelSession = async (session: ClassSession) => {
  const confirmed = await confirm({
    title: PAGES.CLASS_SCHEDULE.CANCEL_SESSION,
    message: `確定要取消「${session.class?.name}」場次嗎？\n日期：${session.session_date}\n時間：${session.start_time} - ${session.end_time}`,
    confirmText: '確定取消',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  const success = await cancelSession(session.id, '管理員取消')
  if (success) {
    toast.success('場次已取消')
    await loadSessions()
  }
}

// View session detail
const viewSessionDetail = (session: ClassSession) => {
  navigateTo(`/classes/sessions/${session.id}`)
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.CLASS_SCHEDULE.TITLE"
      :description="PAGES.CLASS_SCHEDULE.DESCRIPTION"
    />

    <!-- Quick Links -->
    <div class="quick-links">
      <NuxtLink to="/classes" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
        </svg>
        回到課程列表
      </NuxtLink>
      <NuxtLink to="/classes/bookings" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        {{ PAGES.CLASS_BOOKINGS.TITLE }}
      </NuxtLink>
    </div>

    <!-- Stats -->
    <div class="stats-cards">
      <div class="stat-card">
        <span class="stat-value">{{ stats.scheduled }}</span>
        <span class="stat-label">{{ PAGES.CLASS_SCHEDULE.SCHEDULED }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.completed }}</span>
        <span class="stat-label">{{ PAGES.CLASS_SCHEDULE.COMPLETED }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.cancelled }}</span>
        <span class="stat-label">{{ PAGES.CLASS_SCHEDULE.CANCELLED }}</span>
      </div>
    </div>

    <!-- Calendar Controls -->
    <div class="calendar-controls card">
      <div class="controls-left">
        <button type="button" class="btn btn-secondary btn-small" @click="goToPrevWeek">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          上週
        </button>
        <button type="button" class="btn btn-ghost btn-small" @click="goToCurrentWeek">
          本週
        </button>
        <button type="button" class="btn btn-secondary btn-small" @click="goToNextWeek">
          下週
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div class="controls-center">
        <h3 class="week-label">{{ weekLabel }}</h3>
      </div>

      <div class="controls-right">
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Calendar Grid -->
    <div class="calendar-container card">
      <div v-if="isLoading" class="calendar-loading">
        <span class="loading-spinner" />
        {{ MESSAGES.ACTIONS.LOADING }}
      </div>

      <div v-else class="calendar-grid">
        <!-- Day Headers -->
        <div
          v-for="(date, index) in weekDates"
          :key="date.toISOString()"
          class="calendar-header"
          :class="{ 'is-today': isToday(date) }"
        >
          <span class="header-day">{{ dayNames[index] }}</span>
          <span class="header-date">{{ formatDateDisplay(date) }}</span>
        </div>

        <!-- Day Columns -->
        <div
          v-for="date in weekDates"
          :key="date.toISOString() + '-col'"
          class="calendar-column"
          :class="{ 'is-today': isToday(date) }"
        >
          <div
            v-if="sessionsByDate[formatDateApi(date)]?.length === 0"
            class="no-sessions"
          >
            無課程
          </div>

          <div
            v-for="session in sessionsByDate[formatDateApi(date)]"
            :key="session.id"
            class="session-card"
            :class="`status-${session.session_status.toLowerCase()}`"
            @click="viewSessionDetail(session)"
          >
            <div class="session-time">
              {{ session.start_time.substring(0, 5) }} - {{ session.end_time.substring(0, 5) }}
            </div>
            <div class="session-name">{{ session.class?.name }}</div>
            <div v-if="session.instructor" class="session-instructor">
              {{ session.instructor.full_name }}
            </div>
            <div class="session-stats">
              <span class="session-count">
                {{ session.current_count }}/{{ session.max_capacity }}
              </span>
              <span v-if="session.waitlist_count > 0" class="session-waitlist">
                +{{ session.waitlist_count }} 候補
              </span>
            </div>
            <div class="session-actions">
              <AppBadge
                :label="getSessionStatusBadge(session.session_status).label"
                :variant="getSessionStatusBadge(session.session_status).variant"
                size="sm"
              />
              <button
                v-if="session.session_status === 'SCHEDULED'"
                type="button"
                class="action-btn-mini"
                title="取消場次"
                @click.stop="handleCancelSession(session)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
/* Quick Links */
.quick-links {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.quick-link {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out);
}

.quick-link:hover {
  background: var(--color-accent-light);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

/* Stats Cards */
.stats-cards {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.stat-card {
  flex: 1;
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-xs);
}

/* Calendar Controls */
.calendar-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-md);
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.controls-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.week-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.filter-select {
  min-width: 150px;
}

/* Calendar Container */
.calendar-container {
  padding: var(--space-lg);
  overflow-x: auto;
}

.calendar-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-2xl);
  color: var(--color-text-tertiary);
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Calendar Grid */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-width: 900px;
}

/* Day Headers */
.calendar-header {
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.calendar-header.is-today {
  background: var(--color-accent-light);
}

.header-day {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.header-date {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.calendar-header.is-today .header-day,
.calendar-header.is-today .header-date {
  color: var(--color-accent);
}

/* Day Columns */
.calendar-column {
  background: var(--color-bg-primary);
  min-height: 400px;
  padding: var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.calendar-column.is-today {
  background: color-mix(in srgb, var(--color-accent) 5%, var(--color-bg-primary));
}

.no-sessions {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

/* Session Card */
.session-card {
  padding: var(--space-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.session-card:hover {
  background: var(--color-bg-tertiary);
  transform: translateY(-1px);
}

.session-card.status-scheduled {
  border-left-color: var(--color-info, #3b82f6);
}

.session-card.status-completed {
  border-left-color: var(--color-success);
}

.session-card.status-cancelled {
  border-left-color: var(--color-error);
  opacity: 0.6;
}

.session-time {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin-bottom: 2px;
}

.session-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-instructor {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.session-stats {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 11px;
  margin-bottom: var(--space-xs);
}

.session-count {
  color: var(--color-text-secondary);
}

.session-waitlist {
  color: var(--color-warning);
}

.session-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-xs);
}

.action-btn-mini {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn-mini:hover {
  background: var(--color-error-light, #fee2e2);
  color: var(--color-error);
}

/* Responsive */
@media (max-width: 1024px) {
  .calendar-controls {
    flex-direction: column;
    gap: var(--space-md);
  }

  .controls-left,
  .controls-center,
  .controls-right {
    width: 100%;
    justify-content: center;
  }

  .stats-cards {
    flex-wrap: wrap;
  }

  .stat-card {
    min-width: 120px;
  }
}
</style>
