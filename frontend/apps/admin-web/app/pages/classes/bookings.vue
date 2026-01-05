<script setup lang="ts">
/**
 * 課程預約管理頁面
 *
 * 管理會員課程預約、簽到
 */
import { MESSAGES, PAGES, PAGINATION, TIMING } from '~/constants'
import { getBookingStatusBadge, formatDate } from '@gym-nexus/shared'
import type { Booking } from '~/types/directus'

definePageMeta({
  middleware: 'auth'
})

const {
  bookings,
  totalCount,
  isLoading,
  fetchBookings,
  cancelBooking,
  attendClass,
  markNoShow,
  getBookingStats,
  BOOKING_STATUS_LABELS
} = useClassBookings()
const toast = useToast()
const { confirm } = useConfirm()

// Filter state
const search = ref('')
const selectedStatus = ref('')
const selectedDate = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// Stats
const stats = ref({ confirmed: 0, waitlist: 0, attended: 0, noShow: 0, cancelled: 0 })

// Status options
const statusOptions = [
  { value: '', label: MESSAGES.COMMON.ALL_STATUS },
  { value: 'CONFIRMED', label: PAGES.CLASS_BOOKINGS.CONFIRMED },
  { value: 'WAITLIST', label: PAGES.CLASS_BOOKINGS.WAITLIST },
  { value: 'ATTENDED', label: PAGES.CLASS_BOOKINGS.ATTENDED },
  { value: 'NO_SHOW', label: PAGES.CLASS_BOOKINGS.NO_SHOW },
  { value: 'CANCELLED', label: PAGES.CLASS_BOOKINGS.CANCELLED }
]

// Date options
const dateOptions = computed(() => {
  const options = [
    { value: '', label: '全部日期' },
    { value: getTodayDate(), label: '今日' }
  ]

  // Add next 7 days
  for (let i = 1; i <= 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]
    options.push({
      value: dateStr,
      label: formatDateLabel(date)
    })
  }

  return options
})

function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

function formatDateLabel(date: Date) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${month}/${day} (${weekday})`
}

// Table columns configuration
const columns = [
  { key: 'member', label: PAGES.CLASS_BOOKINGS.MEMBER, slot: 'member' },
  { key: 'session', label: PAGES.CLASS_BOOKINGS.SESSION, slot: 'session' },
  { key: 'booked_at', label: PAGES.CLASS_BOOKINGS.BOOKING_TIME, slot: 'bookedAt', hideOnMobile: true },
  { key: 'booking_status', label: '狀態', slot: 'status' }
]

// Load bookings
const loadBookings = async () => {
  await fetchBookings({
    page: currentPage.value,
    limit: pageSize,
    bookingStatus: selectedStatus.value || undefined,
    startDate: selectedDate.value || undefined,
    endDate: selectedDate.value || undefined
  })

  // Load stats
  const statsResult = await getBookingStats()
  stats.value = statsResult
}

// Debounced search (for future member search)
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadBookings()
  }, TIMING.DEBOUNCE)
}

// Watch filters
watch([selectedStatus, selectedDate], () => {
  currentPage.value = 1
  loadBookings()
})

watch(currentPage, () => {
  loadBookings()
})

// Initial load
onMounted(async () => {
  await loadBookings()
})

// Cancel booking handler
const handleCancelBooking = async (booking: Booking) => {
  const confirmed = await confirm({
    title: PAGES.CLASS_BOOKINGS.CANCEL_BOOKING,
    message: PAGES.CLASS_BOOKINGS.CONFIRM_CANCEL,
    confirmText: '確定取消',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  const result = await cancelBooking(booking.id)
  if (result.success) {
    toast.success(PAGES.CLASS_BOOKINGS.CANCEL_SUCCESS)
    await loadBookings()
  } else {
    toast.error(result.message || PAGES.CLASS_BOOKINGS.CANCEL_FAILED)
  }
}

// Attend class handler
const handleAttendClass = async (booking: Booking) => {
  const confirmed = await confirm({
    title: PAGES.CLASS_BOOKINGS.ATTEND,
    message: PAGES.CLASS_BOOKINGS.CONFIRM_ATTEND,
    confirmText: '確定簽到',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  const result = await attendClass(booking.id)
  if (result.success) {
    toast.success(PAGES.CLASS_BOOKINGS.ATTEND_SUCCESS)
    await loadBookings()
  } else {
    toast.error(result.message || PAGES.CLASS_BOOKINGS.ATTEND_FAILED)
  }
}

// Mark no show handler
const handleMarkNoShow = async (booking: Booking) => {
  const confirmed = await confirm({
    title: PAGES.CLASS_BOOKINGS.MARK_NO_SHOW,
    message: PAGES.CLASS_BOOKINGS.CONFIRM_NO_SHOW,
    confirmText: '確定標記',
    confirmVariant: 'warning'
  })

  if (!confirmed) return

  const success = await markNoShow(booking.id)
  if (success) {
    toast.success('已標記為未出席')
    await loadBookings()
  }
}

// View member detail
const viewMember = (memberId: string) => {
  navigateTo(`/members/${memberId}`)
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.CLASS_BOOKINGS.TITLE"
      :description="PAGES.CLASS_BOOKINGS.DESCRIPTION"
    />

    <!-- Quick Links -->
    <div class="quick-links">
      <NuxtLink to="/classes" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
        </svg>
        回到課程列表
      </NuxtLink>
      <NuxtLink to="/classes/schedule" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
          <line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/>
          <line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
        {{ PAGES.CLASS_SCHEDULE.TITLE }}
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
      <template #search>
        <input
          v-model="search"
          type="text"
          class="input input-search"
          :placeholder="PAGES.CLASS_BOOKINGS.SEARCH_PLACEHOLDER"
          @input="handleSearch"
        />
      </template>
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

    <!-- Stats Bar -->
    <StatsBar :count="totalCount" :label="MESSAGES.COMMON.MATCHES" />

    <!-- Data Table -->
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
      <!-- Member Cell -->
      <template #member="{ row }">
        <div class="member-cell" @click="viewMember(row.member?.id)">
          <AppAvatar :name="row.member?.full_name || ''" size="md" variant="blue" />
          <div class="member-info">
            <span class="member-name">{{ row.member?.full_name }}</span>
            <code class="member-code">{{ row.member?.member_code }}</code>
          </div>
        </div>
      </template>

      <!-- Session Cell -->
      <template #session="{ row }">
        <div class="session-cell">
          <span class="session-name">{{ row.session?.class?.name }}</span>
          <span class="session-time text-caption text-tertiary">
            {{ row.session?.session_date }} {{ row.session?.start_time?.substring(0, 5) }}
          </span>
          <span v-if="row.session?.branch" class="session-branch text-caption text-tertiary">
            {{ row.session.branch.name }}
          </span>
        </div>
      </template>

      <!-- Booked At Cell -->
      <template #bookedAt="{ row }">
        <span class="booked-time">{{ formatDate(row.booked_at) }}</span>
        <span v-if="row.waitlist_position" class="waitlist-position">
          候補 #{{ row.waitlist_position }}
        </span>
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="getBookingStatusBadge(row.booking_status).label"
          :variant="getBookingStatusBadge(row.booking_status).variant"
        />
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <!-- Attend Button (for CONFIRMED) -->
          <button
            v-if="row.booking_status === 'CONFIRMED'"
            type="button"
            class="action-btn action-btn-success"
            title="簽到"
            @click="handleAttendClass(row)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </button>

          <!-- Mark No Show Button (for CONFIRMED) -->
          <button
            v-if="row.booking_status === 'CONFIRMED'"
            type="button"
            class="action-btn action-btn-warning"
            title="標記未出席"
            @click="handleMarkNoShow(row)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" x2="12" y1="8" y2="12"/>
              <line x1="12" x2="12.01" y1="16" y2="16"/>
            </svg>
          </button>

          <!-- Cancel Button (for CONFIRMED or WAITLIST) -->
          <button
            v-if="row.booking_status === 'CONFIRMED' || row.booking_status === 'WAITLIST'"
            type="button"
            class="action-btn action-btn-danger"
            title="取消預約"
            @click="handleCancelBooking(row)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>

          <!-- View Member -->
          <NuxtLink :to="`/members/${row.member?.id}`" class="action-btn" title="查看會員">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </NuxtLink>
        </div>
      </template>

      <!-- Pagination -->
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

.action-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
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
