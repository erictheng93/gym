<script lang="ts">
import { MESSAGES, PAGES } from '~/constants'

const statusOptions = [
  { value: '', label: MESSAGES.COMMON.ALL_STATUS },
  { value: 'CONFIRMED', label: PAGES.CLASS_BOOKINGS.CONFIRMED },
  { value: 'WAITLIST', label: PAGES.CLASS_BOOKINGS.WAITLIST },
  { value: 'ATTENDED', label: PAGES.CLASS_BOOKINGS.ATTENDED },
  { value: 'NO_SHOW', label: PAGES.CLASS_BOOKINGS.NO_SHOW },
  { value: 'CANCELLED', label: PAGES.CLASS_BOOKINGS.CANCELLED }
]

const columns = [
  { key: 'member', label: PAGES.CLASS_BOOKINGS.MEMBER, slot: 'member' },
  { key: 'session', label: PAGES.CLASS_BOOKINGS.SESSION, slot: 'session' },
  { key: 'bookedAt', label: PAGES.CLASS_BOOKINGS.BOOKING_TIME, slot: 'bookedAt', hideOnMobile: true },
  { key: 'bookingStatus', label: '狀態', slot: 'status' }
]
</script>

<script setup lang="ts">
/**
 * 課程預約管理頁面
 *
 * GET /api/bookings (status / session date filters, `meta` totals),
 * POST /api/bookings/:id/cancel, POST /api/bookings/:id/attend.
 * New bookings are made per session on the class detail page.
 */
import { PAGINATION } from '~/constants'
import { getBookingStatusBadge, formatDate } from '@gym-nexus/shared'
import { toLocalDateString } from '~/utils/date'
import type { ApiBooking, BookingStatus, BookingStats } from '~/composables/useClassBookings'

definePageMeta({
  middleware: 'auth'
})

const { bookings, totalCount, isLoading, fetchBookings, cancelBooking, attendClass, getBookingStats } = useClassBookings()
const toast = useToast()
const { confirm } = useConfirm()

const selectedStatus = ref<BookingStatus | ''>('')
const selectedDate = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

const stats = ref<BookingStats>({ confirmed: 0, waitlist: 0, attended: 0, noShow: 0, cancelled: 0 })

const formatDateLabel = (date: Date) => {
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday})`
}

// Today and the next 7 days (local dates)
const dateOptions = computed(() => {
  const options = [{ value: '', label: '全部日期' }]
  for (let i = 0; i <= 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    options.push({ value: toLocalDateString(date), label: i === 0 ? '今日' : formatDateLabel(date) })
  }
  return options
})

const loadBookings = async () => {
  const date = selectedDate.value || undefined
  const [, statsResult] = await Promise.all([
    fetchBookings({ page: currentPage.value, limit: pageSize, status: selectedStatus.value, date }),
    getBookingStats(date)
  ])
  stats.value = statsResult
}

watch([selectedStatus, selectedDate], () => {
  currentPage.value = 1
  loadBookings()
})

watch(currentPage, () => {
  loadBookings()
})

onMounted(() => {
  loadBookings()
})

const handleCancelBooking = async (booking: ApiBooking) => {
  const confirmed = await confirm({
    title: PAGES.CLASS_BOOKINGS.CANCEL_BOOKING,
    message: `${PAGES.CLASS_BOOKINGS.CONFIRM_CANCEL}（課程開始前 2 小時內無法取消）`,
    confirmText: '確定取消',
    confirmVariant: 'danger'
  })
  if (!confirmed) return

  const result = await cancelBooking(booking.id)
  if (result.ok) {
    toast.success(PAGES.CLASS_BOOKINGS.CANCEL_SUCCESS)
    await loadBookings()
  } else {
    toast.error(result.error)
  }
}

const handleAttendClass = async (booking: ApiBooking) => {
  const confirmed = await confirm({
    title: PAGES.CLASS_BOOKINGS.ATTEND,
    message: PAGES.CLASS_BOOKINGS.CONFIRM_ATTEND,
    confirmText: '確定簽到',
    confirmVariant: 'primary'
  })
  if (!confirmed) return

  const result = await attendClass(booking.id)
  if (result.ok) {
    const remaining = result.data.remainingCounts
    toast.success(remaining === null ? PAGES.CLASS_BOOKINGS.ATTEND_SUCCESS : `${PAGES.CLASS_BOOKINGS.ATTEND_SUCCESS}，剩餘 ${remaining} 堂`)
    await loadBookings()
  } else {
    toast.error(result.error)
  }
}

const viewMember = (memberId: string | undefined) => {
  if (memberId) navigateTo(`/members/${memberId}`)
}
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="PAGES.CLASS_BOOKINGS.TITLE"
      :description="PAGES.CLASS_BOOKINGS.DESCRIPTION"
    />

    <!-- Quick Links -->
    <div class="quick-links">
      <NuxtLink to="/classes" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
        </svg>
        回到課程列表（於課程詳情新增預約）
      </NuxtLink>
    </div>

    <!-- Stats -->
    <div class="stats-cards">
      <div class="stat-card stat-confirmed">
        <span class="stat-value">{{ stats.confirmed }}</span>
        <span class="stat-label">{{ PAGES.CLASS_BOOKINGS.CONFIRMED_COUNT }}</span>
      </div>
      <div class="stat-card stat-waitlist">
        <span class="stat-value">{{ stats.waitlist }}</span>
        <span class="stat-label">{{ PAGES.CLASS_BOOKINGS.WAITLIST_COUNT }}</span>
      </div>
      <div class="stat-card stat-attended">
        <span class="stat-value">{{ stats.attended }}</span>
        <span class="stat-label">{{ PAGES.CLASS_BOOKINGS.ATTENDED_COUNT }}</span>
      </div>
      <div class="stat-card stat-noshow">
        <span class="stat-value">{{ stats.noShow }}</span>
        <span class="stat-label">{{ PAGES.CLASS_BOOKINGS.NO_SHOW_COUNT }}</span>
      </div>
    </div>

    <!-- Filters -->
    <FilterBar>
      <template #filters>
        <select v-model="selectedDate" class="input filter-select">
          <option v-for="opt in dateOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <StatsBar :count="totalCount" :label="MESSAGES.COMMON.MATCHES" />

    <DataTable
      :data="bookings"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      :empty-title="PAGES.CLASS_BOOKINGS.NO_BOOKINGS"
      :empty-description="PAGES.CLASS_BOOKINGS.NO_BOOKINGS_HINT"
      empty-icon="calendar"
      show-actions
    >
      <template #member="{ row }">
        <div class="member-cell" @click="viewMember(row.member?.id)">
          <AppAvatar :name="row.member?.fullName || ''" size="md" variant="blue" />
          <div class="member-info">
            <span class="member-name">{{ row.member?.fullName }}</span>
            <code class="member-code">{{ row.member?.memberCode }}</code>
          </div>
        </div>
      </template>

      <template #session="{ row }">
        <div class="session-cell">
          <span class="session-name">{{ row.class?.name }}</span>
          <span class="session-time text-caption text-tertiary">
            {{ row.session?.sessionDate }} {{ row.session?.startTime?.substring(0, 5) }}
          </span>
        </div>
      </template>

      <template #bookedAt="{ row }">
        <span class="booked-time">{{ row.bookedAt ? formatDate(row.bookedAt) : '—' }}</span>
        <span v-if="row.waitlistPosition" class="waitlist-position">
          候補 #{{ row.waitlistPosition }}
        </span>
      </template>

      <template #status="{ row }">
        <AppBadge
          :label="getBookingStatusBadge(row.bookingStatus).label"
          :variant="getBookingStatusBadge(row.bookingStatus).variant"
        />
      </template>

      <template #actions="{ row }">
        <div class="actions-row">
          <button
            v-if="row.bookingStatus === 'CONFIRMED'"
            type="button"
            class="action-btn action-btn-success"
            title="簽到"
            @click="handleAttendClass(row)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </button>

          <!-- No backend endpoint for NO_SHOW yet -->
          <button
            v-if="row.bookingStatus === 'CONFIRMED'"
            type="button"
            class="action-btn"
            title="標記未出席（尚未開放）"
            disabled
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
          </button>

          <button
            v-if="row.bookingStatus === 'CONFIRMED' || row.bookingStatus === 'WAITLIST'"
            type="button"
            class="action-btn action-btn-danger"
            title="取消預約"
            @click="handleCancelBooking(row)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          <NuxtLink :to="`/members/${row.member?.id}`" class="action-btn" title="查看會員">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
        </div>
      </template>

      <template #footer>
        <DataPagination
          v-model="currentPage"
          :total-pages="totalPages"
          :prev-label="MESSAGES.ACTIONS.PREV_PAGE"
          :next-label="MESSAGES.ACTIONS.NEXT_PAGE"
        />
      </template>
    </DataTable>
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 140px;
}

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
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-card.stat-confirmed { border-left: 3px solid var(--color-success); }
.stat-card.stat-waitlist { border-left: 3px solid var(--color-warning); }
.stat-card.stat-attended { border-left: 3px solid var(--color-info, #3b82f6); }
.stat-card.stat-noshow { border-left: 3px solid var(--color-error); }

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-xs);
}

/* Member Cell */
.member-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  cursor: pointer;
}

.member-cell:hover .member-name {
  color: var(--color-accent);
}

.member-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-weight: 500;
  color: var(--color-text-primary);
  transition: color var(--duration-fast) var(--ease-out);
}

.member-code {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 4px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
}

/* Session Cell */
.session-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.session-time,
.session-branch {
  font-size: 12px;
}

/* Booked At */
.booked-time {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.waitlist-position {
  display: block;
  font-size: 11px;
  color: var(--color-warning);
  margin-top: 2px;
}

/* Actions */
.actions-row {
  display: flex;
  gap: var(--space-xs);
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover:not(:disabled) {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-btn-success:hover {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-success);
}

.action-btn-warning:hover {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

.action-btn-danger:hover {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  color: var(--color-error);
}

/* Responsive */
@media (max-width: 768px) {
  .stats-cards {
    flex-wrap: wrap;
  }

  .stat-card {
    min-width: calc(50% - var(--space-sm));
  }
}
</style>
