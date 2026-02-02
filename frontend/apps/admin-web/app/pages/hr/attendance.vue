<script setup lang="ts">
/**
 * 考勤打卡頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 */
import { PAGES } from '~/constants'
import { useAttendance } from '~/composables/hr'

definePageMeta({
  middleware: 'auth'
})

const { currentEmployee, checkAuth } = useAuth()
const { branches, fetchBranches } = useBranches()
const {
  recentAttendances,
  isLoading: isAttendanceLoading,
  getTodayAttendance,
  fetchRecentAttendances,
  performCheckIn: checkIn,
  performCheckOut: checkOut
} = useAttendance()

// 當前員工今日考勤記錄
const todayAttendance = ref<Awaited<ReturnType<typeof getTodayAttendance>> | null>(null)

const currentTime = ref(new Date())
const isProcessing = ref(false)
const locationInfo = ref<{ ip?: string; gps?: string }>({})
const showSuccessAnimation = ref(false)
const successMessage = ref('')

// 更新當前時間
let timeInterval: ReturnType<typeof setInterval>
onMounted(async () => {
  timeInterval = setInterval(() => {
    currentTime.value = new Date()
  }, 1000)

  await checkAuth()
  await fetchBranches()
  await loadAttendanceData()

  // 取得位置資訊
  fetchLocationInfo()
})

onUnmounted(() => {
  clearInterval(timeInterval)
})

// 載入考勤資料
const loadAttendanceData = async () => {
  if (!currentEmployee.value?.id) return

  const [attendance] = await Promise.all([
    getTodayAttendance(currentEmployee.value.id),
    fetchRecentAttendances(currentEmployee.value.id, 7)
  ])
  todayAttendance.value = attendance
}

// 取得位置資訊
const fetchLocationInfo = async () => {
  // 取得 IP（簡化版，實際應使用後端 API）
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    locationInfo.value.ip = data.ip
  } catch (e) {
    console.log('Could not fetch IP')
  }

  // 取得 GPS
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationInfo.value.gps = `${position.coords.latitude},${position.coords.longitude}`
      },
      () => {
        console.log('Could not get GPS location')
      }
    )
  }
}

// 格式化時間
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
}

const formatTimeOnly = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const formatDateShort = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  })
}

// 計算工時
const calculateWorkHours = computed(() => {
  if (!todayAttendance.value?.check_in) return null

  const checkInTime = new Date(todayAttendance.value.check_in)
  const checkOutTime = todayAttendance.value.check_out
    ? new Date(todayAttendance.value.check_out)
    : currentTime.value

  const diffMs = checkOutTime.getTime() - checkInTime.getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  return { hours, minutes }
})

// 打卡狀態
const attendanceStatus = computed(() => {
  if (!todayAttendance.value?.check_in) {
    return { status: 'not_checked', label: PAGES.HR.ATTENDANCE.NOT_CHECKED, class: 'status-idle' }
  }
  if (!todayAttendance.value.check_out) {
    return { status: 'checked_in', label: PAGES.HR.ATTENDANCE.CHECKED_IN, class: 'status-working' }
  }
  return { status: 'checked_out', label: PAGES.HR.ATTENDANCE.CHECKED_OUT, class: 'status-done' }
})

// 執行打卡
const handleCheckIn = async () => {
  if (!currentEmployee.value?.id || !currentEmployee.value?.branch_id || isProcessing.value) return

  isProcessing.value = true
  try {
    const result = await checkIn({
      employeeId: currentEmployee.value.id,
      branchId: currentEmployee.value.branch_id
    })
    todayAttendance.value = result
    successMessage.value = PAGES.HR.ATTENDANCE.CHECK_IN + '成功'
    showSuccessAnimation.value = true
    setTimeout(() => {
      showSuccessAnimation.value = false
    }, 2000)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '打卡失敗'
    alert(errorMessage)
  } finally {
    isProcessing.value = false
  }
}

const handleCheckOut = async () => {
  if (!todayAttendance.value?.id || isProcessing.value) return

  isProcessing.value = true
  try {
    const result = await checkOut(todayAttendance.value.id)
    todayAttendance.value = result
    successMessage.value = PAGES.HR.ATTENDANCE.CHECK_OUT + '成功'
    showSuccessAnimation.value = true
    setTimeout(() => {
      showSuccessAnimation.value = false
    }, 2000)
    // 重新取得紀錄
    if (currentEmployee.value?.id) {
      await fetchRecentAttendances(currentEmployee.value.id, 7)
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '打卡失敗'
    alert(errorMessage)
  } finally {
    isProcessing.value = false
  }
}

// 取得狀態 Badge
const getStatusBadgeConfig = (status: string): { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' } => {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
    PRESENT: { label: PAGES.HR.ATTENDANCE.PRESENT, variant: 'success' },
    LATE: { label: PAGES.HR.ATTENDANCE.LATE, variant: 'warning' },
    EARLY_LEAVE: { label: PAGES.HR.ATTENDANCE.EARLY_LEAVE, variant: 'warning' },
    ABSENT: { label: PAGES.HR.ATTENDANCE.ABSENT, variant: 'error' },
    LEAVE: { label: PAGES.HR.ATTENDANCE.ON_LEAVE, variant: 'info' }
  }
  return map[status] || { label: status, variant: 'default' }
}

// 當前分店名稱
const currentBranchName = computed(() => {
  return currentEmployee.value?.branch_name || ''
})
</script>

<template>
  <PageContainer class="attendance-page">
    <!-- Success Animation Overlay -->
    <Transition name="success">
      <div v-if="showSuccessAnimation" class="success-overlay">
        <div class="success-content">
          <div class="success-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <p class="success-text">{{ successMessage }}</p>
        </div>
      </div>
    </Transition>

    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <NuxtLink to="/hr" class="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {{ PAGES.HR.TITLE }}
        </NuxtLink>
        <h1 class="text-headline">{{ PAGES.HR.ATTENDANCE.TITLE }}</h1>
        <p class="text-body text-secondary">{{ PAGES.HR.ATTENDANCE.DESCRIPTION }}</p>
      </div>
    </header>

    <!-- Main Clock Card -->
    <div class="clock-section">
      <div class="clock-card">
        <!-- Date & Time Display -->
        <div class="datetime-display">
          <div class="current-date">{{ formatDate(currentTime) }}</div>
          <div class="current-time">{{ formatTime(currentTime) }}</div>
        </div>

        <!-- Status Indicator -->
        <div class="status-indicator" :class="attendanceStatus.class">
          <span class="status-dot"></span>
          <span class="status-label">{{ attendanceStatus.label }}</span>
        </div>

        <!-- Work Hours Progress -->
        <div v-if="calculateWorkHours" class="work-progress">
          <div class="progress-label">
            <span>{{ PAGES.HR.ATTENDANCE.WORK_HOURS }}</span>
            <span class="progress-value">
              {{ calculateWorkHours.hours }}h {{ calculateWorkHours.minutes }}m
            </span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${Math.min((calculateWorkHours.hours + calculateWorkHours.minutes / 60) / 8 * 100, 100)}%` }"
            ></div>
          </div>
        </div>

        <!-- Check-in/out Times -->
        <div v-if="todayAttendance?.check_in" class="time-records">
          <div class="time-record">
            <div class="record-icon in">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" x2="3" y1="12" y2="12" />
              </svg>
            </div>
            <div class="record-info">
              <span class="record-label">{{ PAGES.HR.ATTENDANCE.CHECK_IN }}</span>
              <span class="record-time">{{ formatTimeOnly(todayAttendance.check_in) }}</span>
            </div>
          </div>
          <div class="time-record">
            <div class="record-icon out" :class="{ 'pending': !todayAttendance.check_out }">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </div>
            <div class="record-info">
              <span class="record-label">{{ PAGES.HR.ATTENDANCE.CHECK_OUT }}</span>
              <span class="record-time">
                {{ todayAttendance.check_out ? formatTimeOnly(todayAttendance.check_out) : '--:--' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="action-buttons">
          <button
            v-if="!todayAttendance?.check_in"
            class="btn-clock btn-check-in"
            :disabled="isProcessing || isAttendanceLoading"
            @click="handleCheckIn"
          >
            <span v-if="isProcessing" class="btn-spinner"></span>
            <template v-else>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" x2="3" y1="12" y2="12" />
              </svg>
              {{ PAGES.HR.ATTENDANCE.CHECK_IN }}
            </template>
          </button>

          <button
            v-else-if="!todayAttendance?.check_out"
            class="btn-clock btn-check-out"
            :disabled="isProcessing"
            @click="handleCheckOut"
          >
            <span v-if="isProcessing" class="btn-spinner"></span>
            <template v-else>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              {{ PAGES.HR.ATTENDANCE.CHECK_OUT }}
            </template>
          </button>

          <div v-else class="completed-message">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>今日打卡已完成</span>
          </div>
        </div>

        <!-- Location Info -->
        <div v-if="locationInfo.ip || locationInfo.gps" class="location-info">
          <div v-if="locationInfo.ip" class="info-item">
            <span class="info-label">{{ PAGES.HR.ATTENDANCE.IP_ADDRESS }}</span>
            <span class="info-value">{{ locationInfo.ip }}</span>
          </div>
          <div v-if="currentBranchName" class="info-item">
            <span class="info-label">分店</span>
            <span class="info-value">{{ currentBranchName }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Records -->
    <section class="records-section">
      <h2 class="section-title">{{ PAGES.HR.ATTENDANCE.RECENT_RECORDS }}</h2>

      <LoadingState v-if="isAttendanceLoading" />

      <EmptyState
        v-else-if="recentAttendances.length === 0"
        :title="PAGES.HR.ATTENDANCE.NO_RECORDS"
        icon="calendar"
      />

      <div v-else class="records-list">
        <div
          v-for="(record, index) in recentAttendances"
          :key="record.id"
          class="record-card"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="record-date">
            <span class="date-text">{{ formatDateShort(record.attendance_date || record.date_created) }}</span>
            <AppBadge
              :label="getStatusBadgeConfig(record.attendance_status).label"
              :variant="getStatusBadgeConfig(record.attendance_status).variant"
            />
          </div>
          <div class="record-times">
            <div class="time-item">
              <span class="time-label">上班</span>
              <span class="time-value">{{ record.check_in ? formatTimeOnly(record.check_in) : '--:--' }}</span>
            </div>
            <div class="time-divider"></div>
            <div class="time-item">
              <span class="time-label">下班</span>
              <span class="time-value">{{ record.check_out ? formatTimeOnly(record.check_out) : '--:--' }}</span>
            </div>
            <div class="time-divider"></div>
            <div class="time-item">
              <span class="time-label">工時</span>
              <span class="time-value">{{ record.work_hours ? `${record.work_hours.toFixed(1)}h` : '--' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </PageContainer>
</template>

<style scoped>
.attendance-page {
  max-width: 800px;
  margin: 0 auto;
  position: relative;
}

/* Success Overlay */
.success-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.success-content {
  text-align: center;
  animation: successPop 0.4s var(--ease-out);
}

@keyframes successPop {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.success-icon {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: linear-gradient(135deg, #34c759, #30d158);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin: 0 auto var(--space-lg);
}

.success-text {
  font-size: 20px;
  font-weight: 600;
  color: white;
}

.success-enter-active,
.success-leave-active {
  transition: opacity 0.3s var(--ease-out);
}

.success-enter-from,
.success-leave-to {
  opacity: 0;
}

/* Header */
.page-header {
  margin-bottom: var(--space-xl);
  animation: fadeIn 0.6s var(--ease-out) backwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  margin-bottom: var(--space-md);
  transition: opacity var(--duration-fast);
}

.back-link:hover {
  opacity: 0.7;
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

/* Clock Section */
.clock-section {
  margin-bottom: var(--space-2xl);
}

.clock-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2xl);
  padding: var(--space-2xl);
  text-align: center;
  animation: cardAppear 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes cardAppear {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
}

/* DateTime Display */
.datetime-display {
  margin-bottom: var(--space-xl);
}

.current-date {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
  letter-spacing: 0.02em;
}

.current-time {
  font-size: 72px;
  font-weight: 200;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  line-height: 1;
}

/* Status Indicator */
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
  margin-bottom: var(--space-xl);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-idle {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.status-idle .status-dot {
  background: var(--color-text-tertiary);
}

.status-working {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.status-working .status-dot {
  background: #34c759;
}

.status-done {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.status-done .status-dot {
  background: #007aff;
  animation: none;
}

/* Work Progress */
.work-progress {
  margin-bottom: var(--space-xl);
  padding: 0 var(--space-xl);
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  margin-bottom: var(--space-sm);
}

.progress-label span:first-child {
  color: var(--color-text-secondary);
}

.progress-value {
  font-weight: 600;
  color: var(--color-text-primary);
}

.progress-bar {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #34c759, #30d158);
  border-radius: var(--radius-full);
  transition: width 0.5s var(--ease-out);
}

/* Time Records */
.time-records {
  display: flex;
  justify-content: center;
  gap: var(--space-2xl);
  margin-bottom: var(--space-xl);
}

.time-record {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.record-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.record-icon.in {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.record-icon.out {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.record-icon.pending {
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
}

.record-info {
  text-align: left;
}

.record-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: 2px;
}

.record-time {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
}

/* Action Buttons */
.action-buttons {
  margin-bottom: var(--space-xl);
}

.btn-clock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  min-width: 200px;
  padding: var(--space-lg) var(--space-2xl);
  border-radius: var(--radius-xl);
  font-size: 18px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.btn-check-in {
  background: linear-gradient(135deg, #34c759, #30d158);
  color: white;
  box-shadow: 0 8px 24px -4px rgba(52, 199, 89, 0.4);
}

.btn-check-in:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px -4px rgba(52, 199, 89, 0.5);
}

.btn-check-out {
  background: linear-gradient(135deg, #ff9500, #ff9f0a);
  color: white;
  box-shadow: 0 8px 24px -4px rgba(255, 149, 0, 0.4);
}

.btn-check-out:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px -4px rgba(255, 149, 0, 0.5);
}

.btn-clock:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.completed-message {
  display: inline-flex;
  align-items: center;
  gap: var(--space-md);
  color: #007aff;
  font-size: 16px;
  font-weight: 500;
}

/* Location Info */
.location-info {
  display: flex;
  justify-content: center;
  gap: var(--space-xl);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

.info-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.info-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
}

.info-value {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
}

/* Records Section */
.records-section {
  animation: sectionAppear 0.6s var(--ease-out) 0.2s backwards;
}

@keyframes sectionAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: var(--space-lg);
  color: var(--color-text-primary);
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.record-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  animation: recordAppear 0.4s var(--ease-out) backwards;
}

@keyframes recordAppear {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
}

.record-date {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.date-text {
  font-weight: 500;
  color: var(--color-text-primary);
}

.record-times {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.time-item {
  text-align: center;
}

.time-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  margin-bottom: 2px;
}

.time-value {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
}

.time-divider {
  width: 1px;
  height: 24px;
  background: var(--color-divider);
}

/* Responsive */
@media (max-width: 640px) {
  .current-time {
    font-size: 48px;
  }

  .time-records {
    flex-direction: column;
    gap: var(--space-md);
  }

  .record-card {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .record-times {
    width: 100%;
    justify-content: space-between;
  }

  .location-info {
    flex-direction: column;
    gap: var(--space-md);
  }
}
</style>
