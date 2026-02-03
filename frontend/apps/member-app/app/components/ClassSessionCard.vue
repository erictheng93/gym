<script setup lang="ts">
import type { ClassSession } from '~/composables/useClasses'

const props = defineProps<{
  session: ClassSession
  booked?: boolean
  waitlistPosition?: number
}>()

const emit = defineEmits<{
  (e: 'book'): void
  (e: 'cancel'): void
  (e: 'details'): void
}>()

const { isSessionFull, getAvailableSpots, getCategoryLabel } = useClasses()

const className = computed(() => props.session.class?.name || props.session.schedule?.class?.name || '課程')
const instructor = computed(() => props.session.instructor?.full_name || props.session.schedule?.class?.instructor?.full_name || '')
const category = computed(() => props.session.class?.category || props.session.schedule?.class?.category)
const room = computed(() => props.session.schedule?.room || '')
const duration = computed(() => props.session.class?.duration_minutes || props.session.schedule?.class?.duration_minutes || 60)

const startTime = computed(() => props.session.schedule?.start_time?.slice(0, 5) || '')
const endTime = computed(() => props.session.schedule?.end_time?.slice(0, 5) || '')

const isFull = computed(() => isSessionFull(props.session))
const availableSpots = computed(() => getAvailableSpots(props.session))

const statusClass = computed(() => {
  if (props.booked) return 'booked'
  if (props.session.session_status === 'CANCELLED') return 'cancelled'
  if (isFull.value) return 'full'
  return 'available'
})

const statusLabel = computed(() => {
  if (props.booked && props.waitlistPosition) return `候補 #${props.waitlistPosition}`
  if (props.booked) return '已預約'
  if (props.session.session_status === 'CANCELLED') return '已取消'
  if (isFull.value) return '已額滿'
  return `剩餘 ${availableSpots.value} 位`
})
</script>

<template>
  <div class="session-card" :class="statusClass" @click="emit('details')">
    <div class="session-time">
      <span class="time-start">{{ startTime }}</span>
      <span class="time-separator">—</span>
      <span class="time-end">{{ endTime }}</span>
    </div>

    <div class="session-content">
      <div class="session-header">
        <h3 class="session-name">{{ className }}</h3>
        <span v-if="category" class="session-category">{{ getCategoryLabel(category) }}</span>
      </div>

      <div class="session-meta">
        <span v-if="instructor" class="meta-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {{ instructor }}
        </span>
        <span v-if="room" class="meta-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          {{ room }}
        </span>
        <span class="meta-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {{ duration }} 分鐘
        </span>
      </div>
    </div>

    <div class="session-status">
      <span class="status-label" :class="statusClass">{{ statusLabel }}</span>
      <div class="session-actions">
        <button
          v-if="booked"
          class="btn-cancel"
          @click.stop="emit('cancel')"
        >
          取消
        </button>
        <button
          v-else-if="!isFull && session.session_status !== 'CANCELLED'"
          class="btn-book"
          @click.stop="emit('book')"
        >
          預約
        </button>
        <button
          v-else-if="isFull && session.session_status !== 'CANCELLED'"
          class="btn-waitlist"
          @click.stop="emit('book')"
        >
          候補
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-card {
  display: flex;
  align-items: stretch;
  gap: 16px;
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s ease;
}

.session-card:active {
  transform: scale(0.98);
}

.session-card.booked {
  border-color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
}

.session-card.cancelled {
  opacity: 0.6;
}

.session-card.full {
  background-color: var(--color-surface-secondary);
}

.session-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding-right: 16px;
  border-right: 1px solid var(--color-border);
}

.time-start {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.time-separator {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin: 2px 0;
}

.time-end {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.session-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-category {
  font-size: 11px;
  padding: 2px 8px;
  background-color: var(--color-primary);
  color: white;
  border-radius: 10px;
  flex-shrink: 0;
}

.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.meta-item svg {
  flex-shrink: 0;
}

.session-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  min-width: 80px;
}

.status-label {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
}

.status-label.available {
  background-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
}

.status-label.booked {
  background-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
}

.status-label.full {
  background-color: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

.status-label.cancelled {
  background-color: var(--color-surface-secondary);
  color: var(--color-text-tertiary);
}

.session-actions {
  display: flex;
  gap: 8px;
}

.btn-book,
.btn-waitlist,
.btn-cancel {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-book {
  background-color: var(--color-primary);
  color: white;
}

.btn-book:active {
  background-color: #059669;
}

.btn-waitlist {
  background-color: var(--color-warning);
  color: white;
}

.btn-waitlist:active {
  background-color: #d97706;
}

.btn-cancel {
  background-color: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}

.btn-cancel:active {
  background-color: var(--color-border);
}
</style>
