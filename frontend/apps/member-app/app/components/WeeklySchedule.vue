<script setup lang="ts">
import type { ClassSession } from '~/composables/useClasses'

const props = defineProps<{
  sessions: ClassSession[]
}>()

const emit = defineEmits<{
  (e: 'select-session', session: ClassSession): void
  (e: 'select-date', date: string): void
}>()

const { getDayName, isSessionFull, getAvailableSpots } = useClasses()
const { hasBookedSession } = useBookings()

// Generate dates for the week
const weekDates = computed(() => {
  const today = new Date()
  const dates: Array<{
    date: string
    dayOfWeek: number
    dayName: string
    dayNumber: number
    isToday: boolean
    month: number
  }> = []

  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dateStr = date.toISOString().split('T')[0] ?? ''
    dates.push({
      date: dateStr,
      dayOfWeek: date.getDay(),
      dayName: getDayName(date.getDay()),
      dayNumber: date.getDate(),
      isToday: i === 0,
      month: date.getMonth() + 1,
    })
  }

  return dates
})

const selectedDate = ref(weekDates.value[0]?.date || '')

// Sessions for selected date
const sessionsForDate = computed(() => {
  return props.sessions
    .filter(s => s.session_date === selectedDate.value)
    .sort((a, b) => {
      const timeA = a.schedule?.start_time || ''
      const timeB = b.schedule?.start_time || ''
      return timeA.localeCompare(timeB)
    })
})

// Get session count for a date
const getSessionCount = (date: string): number => {
  return props.sessions.filter(s => s.session_date === date).length
}

// Select a date
const selectDate = (date: string) => {
  selectedDate.value = date
  emit('select-date', date)
}

// Get class info
const getClassName = (session: ClassSession): string => {
  return session.class?.name || session.schedule?.class?.name || '課程'
}

const getStartTime = (session: ClassSession): string => {
  return session.schedule?.start_time?.slice(0, 5) || ''
}

const getEndTime = (session: ClassSession): string => {
  return session.schedule?.end_time?.slice(0, 5) || ''
}

const getInstructor = (session: ClassSession): string => {
  return session.instructor?.full_name || session.schedule?.class?.instructor?.full_name || ''
}

// Format month name
const monthName = computed(() => {
  const date = new Date(selectedDate.value)
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
})
</script>

<template>
  <div class="weekly-schedule">
    <!-- Month header -->
    <div class="month-header">
      <h2>{{ monthName }}</h2>
    </div>

    <!-- Week day selector -->
    <div class="week-selector">
      <button
        v-for="day in weekDates"
        :key="day.date"
        class="day-button"
        :class="{ active: selectedDate === day.date, today: day.isToday }"
        @click="selectDate(day.date)"
      >
        <span class="day-name">{{ day.dayName }}</span>
        <span class="day-number">{{ day.dayNumber }}</span>
        <span v-if="getSessionCount(day.date) > 0" class="session-indicator">
          {{ getSessionCount(day.date) }}
        </span>
      </button>
    </div>

    <!-- Sessions list -->
    <div class="sessions-container">
      <div v-if="sessionsForDate.length === 0" class="no-sessions">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>當天沒有排定課程</p>
      </div>

      <div v-else class="sessions-list">
        <button
          v-for="session in sessionsForDate"
          :key="session.id"
          class="session-item"
          :class="{
            booked: hasBookedSession(session.id),
            full: isSessionFull(session),
            cancelled: session.session_status === 'CANCELLED'
          }"
          @click="emit('select-session', session)"
        >
          <div class="session-time">
            <span class="time-start">{{ getStartTime(session) }}</span>
            <span class="time-end">{{ getEndTime(session) }}</span>
          </div>

          <div class="session-info">
            <span class="session-name">{{ getClassName(session) }}</span>
            <span v-if="getInstructor(session)" class="session-instructor">
              {{ getInstructor(session) }}
            </span>
          </div>

          <div class="session-status">
            <span v-if="hasBookedSession(session.id)" class="status booked">已預約</span>
            <span v-else-if="session.session_status === 'CANCELLED'" class="status cancelled">已取消</span>
            <span v-else-if="isSessionFull(session)" class="status full">額滿</span>
            <span v-else class="status available">{{ getAvailableSpots(session) }}位</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weekly-schedule {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.month-header {
  padding: 0 4px;
}

.month-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.week-selector {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.week-selector::-webkit-scrollbar {
  display: none;
}

.day-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 12px 8px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.day-button:active {
  transform: scale(0.95);
}

.day-button.active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.day-button.active .day-name,
.day-button.active .day-number {
  color: white;
}

.day-button.today:not(.active) {
  border-color: var(--color-primary);
}

.day-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.day-number {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.session-indicator {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background-color: var(--color-primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-button.active .session-indicator {
  background-color: white;
  color: var(--color-primary);
}

.sessions-container {
  min-height: 200px;
}

.no-sessions {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-tertiary);
}

.no-sessions svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-sessions p {
  margin: 0;
  font-size: 14px;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;
}

.session-item:active {
  transform: scale(0.98);
}

.session-item.booked {
  border-color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
}

.session-item.cancelled {
  opacity: 0.5;
}

.session-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 48px;
}

.time-start {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.time-end {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-instructor {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.session-status {
  flex-shrink: 0;
}

.status {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 12px;
}

.status.available {
  background-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
}

.status.booked {
  background-color: var(--color-primary);
  color: white;
}

.status.full {
  background-color: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

.status.cancelled {
  background-color: var(--color-surface-secondary);
  color: var(--color-text-tertiary);
}
</style>
