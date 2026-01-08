<script setup lang="ts">
import type { Booking } from '~/composables/useBookings'

const props = defineProps<{
  booking: Booking
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'details'): void
  (e: 'review'): void
}>()

const { getStatusLabel, getStatusColor, canCancel, formatBookingDate } = useBookings()

const className = computed(() =>
  props.booking.class_name ||
  props.booking.session?.schedule?.class?.name ||
  '課程'
)

const sessionDate = computed(() =>
  props.booking.session_date ||
  props.booking.session?.session_date ||
  ''
)

const startTime = computed(() =>
  props.booking.start_time ||
  props.booking.session?.schedule?.start_time?.slice(0, 5) ||
  ''
)

const endTime = computed(() =>
  props.booking.end_time ||
  props.booking.session?.schedule?.end_time?.slice(0, 5) ||
  ''
)

const instructor = computed(() =>
  props.booking.instructor_name ||
  props.booking.session?.instructor?.full_name ||
  props.booking.session?.schedule?.class?.instructor?.full_name ||
  ''
)

const room = computed(() =>
  props.booking.room ||
  props.booking.session?.schedule?.room ||
  ''
)

const formattedDate = computed(() => formatBookingDate(sessionDate.value))

const showCancel = computed(() => canCancel(props.booking))

const isWaitlisted = computed(() => props.booking.booking_status === 'WAITLISTED')
const waitlistPosition = computed(() => props.booking.waitlist_position || 0)

// Check if review button should be shown (ATTENDED status, within 7 days)
const canShowReview = computed(() => {
  if (props.booking.booking_status !== 'ATTENDED') return false

  const sessionDateValue = sessionDate.value
  if (!sessionDateValue) return false

  const sessionDateTime = new Date(sessionDateValue)
  const now = new Date()
  const diffMs = now.getTime() - sessionDateTime.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  return diffDays >= 0 && diffDays <= 7
})

const hasReview = computed(() => props.booking.has_review || false)
</script>

<template>
  <div
    class="booking-card"
    :class="getStatusColor(booking.booking_status)"
    @click="emit('details')"
  >
    <div class="booking-date">
      <span class="date-text">{{ formattedDate }}</span>
      <span class="time-text">{{ startTime }} - {{ endTime }}</span>
    </div>

    <div class="booking-content">
      <h3 class="booking-name">{{ className }}</h3>

      <div class="booking-meta">
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
      </div>
    </div>

    <div class="booking-status">
      <span
        class="status-badge"
        :class="getStatusColor(booking.booking_status)"
      >
        {{ getStatusLabel(booking.booking_status) }}
        <template v-if="isWaitlisted && waitlistPosition">
          #{{ waitlistPosition }}
        </template>
      </span>

      <button
        v-if="showCancel"
        class="btn-cancel"
        @click.stop="emit('cancel')"
      >
        取消預約
      </button>

      <button
        v-if="canShowReview"
        class="btn-review"
        @click.stop="emit('review')"
      >
        {{ hasReview ? '查看評價' : '評價' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.booking-card {
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

.booking-card:active {
  transform: scale(0.98);
}

.booking-card.success {
  border-left: 4px solid var(--color-primary);
}

.booking-card.warning {
  border-left: 4px solid var(--color-warning);
}

.booking-card.error {
  border-left: 4px solid var(--color-error);
}

.booking-card.primary {
  border-left: 4px solid #3b82f6;
}

.booking-card.muted {
  opacity: 0.6;
  border-left: 4px solid var(--color-text-tertiary);
}

.booking-date {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 80px;
  text-align: center;
  padding-right: 16px;
  border-right: 1px solid var(--color-border);
}

.date-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.time-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.booking-content {
  flex: 1;
  min-width: 0;
}

.booking-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 8px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.booking-meta {
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

.booking-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}

.status-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 12px;
  white-space: nowrap;
}

.status-badge.success {
  background-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
}

.status-badge.warning {
  background-color: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

.status-badge.error {
  background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
  color: var(--color-error);
}

.status-badge.primary {
  background-color: color-mix(in srgb, #3b82f6 15%, transparent);
  color: #3b82f6;
}

.status-badge.muted {
  background-color: var(--color-surface-secondary);
  color: var(--color-text-tertiary);
}

.btn-cancel {
  padding: 8px 16px;
  background-color: var(--color-surface-secondary);
  color: var(--color-text-secondary);
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel:active {
  background-color: var(--color-border);
}

.btn-review {
  padding: 8px 16px;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-review:active {
  background-color: #059669;
}
</style>
