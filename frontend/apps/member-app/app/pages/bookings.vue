<script setup lang="ts">
import type { ClassSession } from '~/composables/useClasses'
import type { Booking } from '~/composables/useBookings'
import type { ReviewEligibility } from '~/composables/useReviews'

definePageMeta({
  middleware: 'auth'
})

const { member } = useMemberAuth()
const { upcomingSessions, fetchUpcomingSessions, isLoading: classesLoading } = useClasses()
const {
  upcomingBookings,
  pastBookings,
  fetchMyBookings,
  bookSession,
  cancelBooking,
  hasBookedSession,
  isLoading: bookingsLoading
} = useBookings()
const { checkEligibility } = useReviews()

// State
const activeTab = ref<'schedule' | 'my-bookings'>('schedule')
const selectedSession = ref<ClassSession | null>(null)
const showSessionModal = ref(false)
const showCancelConfirm = ref(false)
const bookingToCancel = ref<Booking | null>(null)
const isProcessing = ref(false)
const error = ref('')
const successMessage = ref('')

// Review state
const showReviewModal = ref(false)
const reviewBooking = ref<Booking | null>(null)
const reviewEligibility = ref<ReviewEligibility | null>(null)

// Fetch data on mount
onMounted(async () => {
  const branchId = member.value?.branch_id || undefined
  await Promise.all([
    fetchUpcomingSessions({
      branchId,
      limit: 50,
    }),
    fetchMyBookings()
  ])
})

// Handle session selection from weekly schedule
const handleSelectSession = (session: ClassSession) => {
  selectedSession.value = session
  showSessionModal.value = true
  error.value = ''
}

// Book a session
const handleBook = async () => {
  if (!selectedSession.value) return

  isProcessing.value = true
  error.value = ''

  const result = await bookSession(
    selectedSession.value.id,
    member.value?.activeContract?.id
  )

  if (result.success) {
    showSessionModal.value = false
    successMessage.value = result.booking?.booking_status === 'WAITLISTED'
      ? `已加入候補名單 (第 ${result.waitlist_position} 順位)`
      : '預約成功！'

    // Clear success message after 3 seconds
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)

    // Refresh sessions to update counts
    await fetchUpcomingSessions({
      branchId: member.value?.branch_id || undefined,
      limit: 50,
    })
  } else {
    error.value = result.message
  }

  isProcessing.value = false
}

// Start cancel flow
const startCancel = (booking: Booking) => {
  bookingToCancel.value = booking
  showCancelConfirm.value = true
}

// Confirm cancel
const confirmCancel = async () => {
  if (!bookingToCancel.value) return

  isProcessing.value = true
  error.value = ''

  const result = await cancelBooking(bookingToCancel.value.id)

  if (result.success) {
    showCancelConfirm.value = false
    bookingToCancel.value = null
    successMessage.value = '預約已取消'

    setTimeout(() => {
      successMessage.value = ''
    }, 3000)

    // Refresh data
    await Promise.all([
      fetchUpcomingSessions({
        branchId: member.value?.branch_id || undefined,
        limit: 50,
      }),
      fetchMyBookings()
    ])
  } else {
    error.value = result.message
  }

  isProcessing.value = false
}

// Close modals
const closeSessionModal = () => {
  showSessionModal.value = false
  selectedSession.value = null
  error.value = ''
}

const closeCancelConfirm = () => {
  showCancelConfirm.value = false
  bookingToCancel.value = null
}

// Get class name from session
const getClassName = (session: ClassSession | null): string => {
  if (!session) return ''
  return session.class?.name || session.schedule?.class?.name || '課程'
}

const getSessionTime = (session: ClassSession | null): string => {
  if (!session) return ''
  const start = session.schedule?.start_time?.slice(0, 5) || ''
  const end = session.schedule?.end_time?.slice(0, 5) || ''
  return `${start} - ${end}`
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  return `${month}/${day} (${days[date.getDay()]})`
}

const isLoading = computed(() => classesLoading.value || bookingsLoading.value)

// Review handlers
const handleReview = async (booking: Booking) => {
  reviewBooking.value = booking
  const eligibility = await checkEligibility(booking.id)
  reviewEligibility.value = eligibility
  showReviewModal.value = true
}

const handleReviewSubmitted = async () => {
  showReviewModal.value = false
  reviewBooking.value = null
  reviewEligibility.value = null
  // Refresh bookings to update has_review flag
  await fetchMyBookings()
}

const getReviewClassName = (booking: Booking | null): string => {
  if (!booking) return ''
  return booking.class_name || booking.session?.schedule?.class?.name || '課程'
}

const getReviewSessionDate = (booking: Booking | null): string => {
  if (!booking) return ''
  const dateStr = booking.session_date || booking.session?.session_date || ''
  return formatDate(dateStr)
}
</script>

<template>
  <div class="bookings-page">
    <!-- Header -->
    <header class="page-header">
      <h1 class="page-title">課程預約</h1>
    </header>

    <!-- Success Message -->
    <Transition name="slide-down">
      <div v-if="successMessage" class="success-toast">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        {{ successMessage }}
      </div>
    </Transition>

    <!-- Tab Switcher -->
    <div class="tab-switcher">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'schedule' }"
        @click="activeTab = 'schedule'"
      >
        課程時間表
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'my-bookings' }"
        @click="activeTab = 'my-bookings'"
      >
        我的預約
        <span v-if="upcomingBookings.length > 0" class="badge">
          {{ upcomingBookings.length }}
        </span>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>載入中...</p>
    </div>

    <!-- Schedule Tab -->
    <div v-else-if="activeTab === 'schedule'" class="tab-content">
      <WeeklySchedule
        :sessions="upcomingSessions"
        @select-session="handleSelectSession"
      />
    </div>

    <!-- My Bookings Tab -->
    <div v-else class="tab-content">
      <!-- Upcoming Bookings -->
      <section v-if="upcomingBookings.length > 0" class="section">
        <h2 class="section-title">即將到來</h2>
        <div class="booking-list">
          <BookingCard
            v-for="booking in upcomingBookings"
            :key="booking.id"
            :booking="booking"
            @cancel="startCancel(booking)"
          />
        </div>
      </section>

      <!-- No Upcoming Bookings -->
      <div v-else class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>目前沒有預約的課程</p>
        <button class="btn btn-primary" @click="activeTab = 'schedule'">
          瀏覽課程時間表
        </button>
      </div>

      <!-- Past Bookings -->
      <section v-if="pastBookings.length > 0" class="section">
        <h2 class="section-title">歷史紀錄</h2>
        <div class="booking-list">
          <BookingCard
            v-for="booking in pastBookings.slice(0, 10)"
            :key="booking.id"
            :booking="booking"
            @review="handleReview(booking)"
          />
        </div>
      </section>
    </div>

    <!-- Session Details Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showSessionModal" class="modal-overlay" @click.self="closeSessionModal">
          <div class="modal-content">
            <button class="modal-close" @click="closeSessionModal">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div class="modal-header">
              <h2>{{ getClassName(selectedSession) }}</h2>
              <p class="session-datetime">
                {{ formatDate(selectedSession?.session_date || '') }} · {{ getSessionTime(selectedSession) }}
              </p>
            </div>

            <div class="modal-body">
              <div class="session-details">
                <div v-if="selectedSession?.instructor?.full_name" class="detail-item">
                  <span class="detail-label">教練</span>
                  <span class="detail-value">{{ selectedSession.instructor.full_name }}</span>
                </div>
                <div v-if="selectedSession?.schedule?.room" class="detail-item">
                  <span class="detail-label">教室</span>
                  <span class="detail-value">{{ selectedSession.schedule.room }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">課程時長</span>
                  <span class="detail-value">
                    {{ selectedSession?.class?.duration_minutes || selectedSession?.schedule?.class?.duration_minutes || 60 }} 分鐘
                  </span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">剩餘名額</span>
                  <span class="detail-value">
                    {{ Math.max(0, (selectedSession?.class?.max_capacity || 0) - (selectedSession?.current_count || 0)) }} / {{ selectedSession?.class?.max_capacity || 0 }}
                  </span>
                </div>
              </div>

              <div v-if="error" class="error-message">
                {{ error }}
              </div>

              <div class="modal-actions">
                <template v-if="hasBookedSession(selectedSession?.id || '')">
                  <div class="already-booked">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    您已預約此課程
                  </div>
                </template>
                <template v-else>
                  <button class="btn btn-secondary" @click="closeSessionModal">
                    取消
                  </button>
                  <button
                    class="btn btn-primary"
                    :disabled="isProcessing"
                    @click="handleBook"
                  >
                    <span v-if="isProcessing" class="btn-spinner"></span>
                    {{ (selectedSession?.current_count || 0) >= (selectedSession?.class?.max_capacity || 0) ? '加入候補' : '確認預約' }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Cancel Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showCancelConfirm" class="modal-overlay" @click.self="closeCancelConfirm">
          <div class="modal-content confirm-modal">
            <h2>確認取消預約</h2>
            <p>確定要取消以下課程的預約嗎？</p>

            <div v-if="bookingToCancel" class="cancel-details">
              <strong>{{ bookingToCancel.class_name || bookingToCancel.session?.schedule?.class?.name }}</strong>
              <span>{{ formatDate(bookingToCancel.session_date || bookingToCancel.session?.session_date || '') }}</span>
            </div>

            <div v-if="error" class="error-message">
              {{ error }}
            </div>

            <div class="modal-actions">
              <button class="btn btn-secondary" @click="closeCancelConfirm">
                返回
              </button>
              <button
                class="btn btn-danger"
                :disabled="isProcessing"
                @click="confirmCancel"
              >
                <span v-if="isProcessing" class="btn-spinner"></span>
                確認取消
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Review Modal - 使用 Lazy 前缀按需加載 -->
    <LazyReviewFormModal
      :show="showReviewModal"
      :booking-id="reviewBooking?.id || ''"
      :class-name="getReviewClassName(reviewBooking)"
      :session-date="getReviewSessionDate(reviewBooking)"
      :existing-review="reviewEligibility?.existing_review"
      @close="showReviewModal = false"
      @submitted="handleReviewSubmitted"
      @updated="handleReviewSubmitted"
      @deleted="handleReviewSubmitted"
    />
  </div>
</template>

<style scoped>
.bookings-page {
  padding: 24px 16px;
  padding-bottom: 100px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
}

/* Success Toast */
.success-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background-color: var(--color-primary);
  color: white;
  border-radius: 16px;
  margin-bottom: 20px;
  font-weight: 500;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* Tab Switcher */
.tab-switcher {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background-color: var(--color-surface);
  padding: 6px;
  border-radius: 16px;
}

.tab-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: none;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-button.active {
  background-color: var(--color-primary);
  color: white;
}

.tab-button .badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-button.active .badge {
  background-color: rgba(255, 255, 255, 0.3);
  color: white;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  color: var(--color-text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Tab Content */
.tab-content {
  min-height: 300px;
}

/* Section */
.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
}

.booking-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 24px;
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  text-align: center;
}

.empty-state svg {
  color: var(--color-text-tertiary);
}

.empty-state p {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin: 0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  width: 100%;
  max-width: 500px;
  background-color: var(--color-background);
  border-radius: 24px 24px 0 0;
  padding: 24px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
}

.confirm-modal {
  border-radius: 24px;
  text-align: center;
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  background-color: var(--color-surface-secondary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-secondary);
}

.modal-header {
  margin-bottom: 24px;
  padding-right: 48px;
}

.modal-header h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 8px 0;
}

.session-datetime {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.modal-body {
  /* Additional styles if needed */
}

.session-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.detail-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
}

.error-message {
  padding: 12px 16px;
  background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 20%, transparent);
  border-radius: 12px;
  color: var(--color-error);
  font-size: 14px;
  margin-bottom: 16px;
}

.already-booked {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  border-radius: 12px;
  font-weight: 500;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.modal-actions .btn {
  flex: 1;
}

.cancel-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: 12px;
  margin: 16px 0;
}

.cancel-details strong {
  font-size: 16px;
  color: var(--color-text);
}

.cancel-details span {
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* Button styles */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 24px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
}

.btn-primary:active:not(:disabled) {
  background-color: #059669;
}

.btn-secondary {
  background-color: var(--color-surface-secondary);
  color: var(--color-text);
}

.btn-secondary:active:not(:disabled) {
  background-color: var(--color-border);
}

.btn-danger {
  background-color: var(--color-error);
  color: white;
}

.btn-danger:active:not(:disabled) {
  background-color: #dc2626;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: translateY(100%);
}

.confirm-modal.modal-enter-from,
.confirm-modal.modal-leave-to {
  transform: scale(0.9);
}
</style>
