<template>
  <div class="class-detail-page">
    <!-- Header with Back -->
    <div class="detail-header">
      <button class="back-button" @click="router.back()">
        <svg class="back-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span>返回</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-container">
      <div class="apple-spinner" />
    </div>

    <!-- Not Found -->
    <div v-else-if="!classData" class="empty-state">
      <div class="empty-icon">📅</div>
      <p>找不到課程資料</p>
    </div>

    <!-- Class Detail -->
    <div v-else class="detail-content">
      <!-- Status Banner -->
      <div class="status-banner" :class="getStatusBannerClass(classData.status)">
        <div class="status-icon">{{ getStatusIcon(classData.status) }}</div>
        <div class="status-info">
          <span class="status-label">{{ getStatusText(classData.status) }}</span>
          <span class="status-time">{{ formatDateTime(classData.scheduled_at) }}</span>
        </div>
      </div>

      <!-- Class Info Card -->
      <div class="info-card">
        <h2 class="card-section-title">課程資訊</h2>
        <div class="info-list">
          <div class="info-row">
            <span class="info-icon">⏱</span>
            <div class="info-detail">
              <span class="info-label">時長</span>
              <span class="info-value">{{ classData.duration_minutes }} 分鐘</span>
            </div>
          </div>
          <div class="info-row">
            <span class="info-icon">📍</span>
            <div class="info-detail">
              <span class="info-label">場館</span>
              <span class="info-value">{{ classData.branch_name }}</span>
            </div>
          </div>
          <div class="info-row">
            <span class="info-icon">📝</span>
            <div class="info-detail">
              <span class="info-label">預約方式</span>
              <span class="info-value">{{ getBookedByText(classData.booked_by) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Member Card -->
      <div class="member-card">
        <h2 class="card-section-title">學員資訊</h2>
        <div class="member-profile">
          <div class="member-avatar-ring">
            <div class="member-avatar">
              {{ classData.member.full_name.charAt(0) }}
            </div>
          </div>
          <div class="member-info">
            <p class="member-name">{{ classData.member.full_name }}</p>
            <p class="member-code">{{ classData.member.member_code }}</p>
          </div>
        </div>
        <div class="member-actions">
          <a v-if="classData.member.phone" :href="`tel:${classData.member.phone}`" class="member-action-btn call">
            <svg class="action-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span>撥打電話</span>
          </a>
          <a v-if="classData.member.email" :href="`mailto:${classData.member.email}`" class="member-action-btn email">
            <svg class="action-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>發送郵件</span>
          </a>
        </div>
      </div>

      <!-- Contract Card -->
      <div class="contract-card">
        <h2 class="card-section-title">合約資訊</h2>
        <div class="contract-content">
          <div class="contract-main">
            <p class="contract-plan">{{ classData.contract.plan_name }}</p>
            <p class="contract-no">{{ classData.contract.contract_no }}</p>
          </div>
          <div v-if="classData.contract.plan_type === 'COUNT_BASED'" class="contract-count">
            <span class="count-number">{{ classData.contract.remaining_counts }}</span>
            <span class="count-label">剩餘堂數</span>
          </div>
        </div>
      </div>

      <!-- Notes Card -->
      <div v-if="classData.notes" class="notes-card">
        <h2 class="card-section-title">備註</h2>
        <p class="notes-text">{{ classData.notes }}</p>
      </div>

      <!-- Lesson Plan Card -->
      <div v-if="classData.lesson_plan" class="lesson-plan-card">
        <h2 class="card-section-title">教案</h2>
        <div class="lesson-plan-header">
          <span class="lesson-plan-icon">📚</span>
          <p class="lesson-plan-title">{{ classData.lesson_plan.title }}</p>
        </div>
        <div v-if="classData.lesson_plan.objectives?.length" class="lesson-plan-objectives">
          <p class="objectives-label">目標</p>
          <ul class="objectives-list">
            <li v-for="(obj, idx) in classData.lesson_plan.objectives" :key="idx" class="objective-item">
              {{ obj }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Class Record Card (if completed) -->
      <div v-if="classData.record" class="record-card">
        <h2 class="card-section-title">課程記錄</h2>
        <div v-if="classData.record.coach_notes" class="record-section">
          <p class="record-label">教練筆記</p>
          <p class="record-text">{{ classData.record.coach_notes }}</p>
        </div>
        <div v-if="classData.record.next_plan" class="record-section">
          <p class="record-label">下次計畫</p>
          <p class="record-text">{{ classData.record.next_plan }}</p>
        </div>
      </div>
    </div>

    <!-- Bottom Actions (BOOKED status only) -->
    <Transition name="slide-up">
      <div v-if="classData?.status === 'BOOKED'" class="bottom-actions">
        <div class="actions-container">
          <button class="action-btn attended" @click="showAttendanceModal = true; attendanceType = 'attended'">
            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            已出席
          </button>
          <button class="action-btn no-show" @click="showAttendanceModal = true; attendanceType = 'no_show'">
            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            未到
          </button>
          <button class="action-btn cancel" @click="showCancelModal = true">
            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            取消
          </button>
        </div>
      </div>
    </Transition>

    <!-- Attendance Modal -->
    <Transition name="sheet">
      <div v-if="showAttendanceModal" class="sheet-overlay" @click="showAttendanceModal = false">
        <div class="sheet-container" @click.stop>
          <div class="sheet-handle" />
          <div class="sheet-header">
            <div class="sheet-icon" :class="attendanceType === 'attended' ? 'green' : 'red'">
              {{ attendanceType === 'attended' ? '✓' : '✕' }}
            </div>
            <h3 class="sheet-title">
              {{ attendanceType === 'attended' ? '確認出席' : '確認未到' }}
            </h3>
          </div>
          <form @submit.prevent="handleAttendance">
            <div class="form-group">
              <label class="form-label">備註（選填）</label>
              <textarea
                v-model="attendanceNotes"
                class="form-textarea"
                rows="3"
                placeholder="課程記錄或備註..."
              />
            </div>
            <div class="sheet-actions">
              <button type="button" class="btn-cancel" @click="showAttendanceModal = false">
                取消
              </button>
              <button
                type="submit"
                class="btn-submit"
                :class="attendanceType === 'attended' ? 'green' : 'red'"
                :disabled="submitting"
              >
                {{ submitting ? '處理中...' : '確認' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- Cancel Modal -->
    <Transition name="sheet">
      <div v-if="showCancelModal" class="sheet-overlay" @click="showCancelModal = false">
        <div class="sheet-container" @click.stop>
          <div class="sheet-handle" />
          <div class="sheet-header">
            <div class="sheet-icon orange">⚠</div>
            <h3 class="sheet-title">取消課程</h3>
          </div>
          <form @submit.prevent="handleCancel">
            <div class="form-group">
              <label class="form-label">取消原因</label>
              <textarea
                v-model="cancelReason"
                class="form-textarea"
                rows="3"
                placeholder="請輸入取消原因..."
                required
              />
            </div>
            <div class="sheet-actions">
              <button type="button" class="btn-cancel" @click="showCancelModal = false">
                返回
              </button>
              <button type="submit" class="btn-submit red" :disabled="submitting">
                {{ submitting ? '處理中...' : '確認取消' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const { success, error: showError } = useToast()
const { getClass, markAttendance, cancelClass } = useCoachClasses()

const loading = ref(true)
const classData = ref<Awaited<ReturnType<typeof getClass>>>(null)
const submitting = ref(false)

const showAttendanceModal = ref(false)
const attendanceType = ref<'attended' | 'no_show'>('attended')
const attendanceNotes = ref('')

const showCancelModal = ref(false)
const cancelReason = ref('')

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusBannerClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'blue',
    COMPLETED: 'green',
    MEMBER_CANCELLED: 'gray',
    COACH_CANCELLED: 'gray',
    NO_SHOW: 'red',
  }
  return classes[status] || 'gray'
}

const getStatusIcon = (status: string) => {
  const icons: Record<string, string> = {
    BOOKED: '📅',
    COMPLETED: '✅',
    MEMBER_CANCELLED: '🚫',
    COACH_CANCELLED: '🚫',
    NO_SHOW: '❌',
  }
  return icons[status] || '📅'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    BOOKED: '已預約',
    COMPLETED: '已完成',
    MEMBER_CANCELLED: '學員取消',
    COACH_CANCELLED: '教練取消',
    NO_SHOW: '未到',
  }
  return texts[status] || status
}

const getBookedByText = (bookedBy: string) => {
  const texts: Record<string, string> = {
    MEMBER: '學員預約',
    COACH: '教練預約',
    RECEPTION: '櫃台預約',
  }
  return texts[bookedBy] || bookedBy
}

const handleAttendance = async () => {
  submitting.value = true
  const result = await markAttendance(route.params.id as string, {
    attended: attendanceType.value === 'attended',
    notes: attendanceNotes.value || undefined,
  })

  if (result.success) {
    success(attendanceType.value === 'attended' ? '已標記出席' : '已標記未到')
    showAttendanceModal.value = false
    classData.value = await getClass(route.params.id as string)
  } else {
    showError(result.message || '操作失敗')
  }
  submitting.value = false
}

const handleCancel = async () => {
  submitting.value = true
  const result = await cancelClass(route.params.id as string, cancelReason.value)

  if (result.success) {
    success('課程已取消')
    showCancelModal.value = false
    classData.value = await getClass(route.params.id as string)
  } else {
    showError(result.message || '取消失敗')
  }
  submitting.value = false
}

onMounted(async () => {
  loading.value = true
  classData.value = await getClass(route.params.id as string)
  loading.value = false
})
</script>

<style scoped>
.class-detail-page {
  min-height: 100vh;
  padding-bottom: calc(160px + env(safe-area-inset-bottom));
}

/* Header */
.detail-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 12px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}

.back-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--apple-blue);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.back-button:active {
  background: rgba(0, 122, 255, 0.1);
}

.back-icon {
  width: 20px;
  height: 20px;
}

/* Loading */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

/* Detail Content */
.detail-content {
  padding: 0 16px 24px;
}

/* Status Banner */
.status-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: 20px;
  margin-bottom: 16px;
}

.status-banner.blue {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.15), rgba(90, 200, 250, 0.15));
}

.status-banner.green {
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.15));
}

.status-banner.red {
  background: linear-gradient(135deg, rgba(255, 59, 48, 0.15), rgba(255, 69, 58, 0.15));
}

.status-banner.gray {
  background: var(--bg-secondary);
}

.status-icon {
  font-size: 32px;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-label {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.status-time {
  font-size: 14px;
  color: var(--text-secondary);
}

/* Cards Base */
.info-card,
.member-card,
.contract-card,
.notes-card,
.lesson-plan-card,
.record-card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}

.card-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
}

/* Info Card */
.info-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.info-icon {
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border-radius: 10px;
}

.info-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.info-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Member Card */
.member-profile {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.member-avatar-ring {
  padding: 2px;
  background: linear-gradient(135deg, var(--apple-blue), var(--apple-purple));
  border-radius: 50%;
}

.member-avatar {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border-radius: 50%;
  font-size: 22px;
  font-weight: 600;
  color: var(--apple-blue);
}

.member-info {
  flex: 1;
}

.member-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.member-code {
  font-size: 14px;
  color: var(--text-secondary);
}

.member-actions {
  display: flex;
  gap: 10px;
}

.member-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 12px;
  text-decoration: none;
  transition: all 0.2s var(--ease-apple);
}

.member-action-btn:active {
  transform: scale(0.97);
}

.member-action-btn.call {
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

.member-action-btn.email {
  background: rgba(0, 122, 255, 0.12);
  color: var(--apple-blue);
}

.action-btn-icon {
  width: 18px;
  height: 18px;
}

/* Contract Card */
.contract-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.contract-main {
  flex: 1;
}

.contract-plan {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.contract-no {
  font-size: 13px;
  color: var(--text-tertiary);
}

.contract-count {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.12), rgba(255, 159, 10, 0.12));
  border-radius: 14px;
}

.count-number {
  font-size: 28px;
  font-weight: 700;
  color: var(--apple-orange);
  line-height: 1;
}

.count-label {
  font-size: 11px;
  color: var(--apple-orange);
  margin-top: 4px;
}

/* Notes Card */
.notes-text {
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

/* Lesson Plan Card */
.lesson-plan-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.lesson-plan-icon {
  font-size: 24px;
}

.lesson-plan-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.lesson-plan-objectives {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.objectives-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.objectives-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.objective-item {
  position: relative;
  padding-left: 20px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 6px;
}

.objective-item::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: var(--apple-blue);
  font-weight: bold;
}

/* Record Card */
.record-section {
  margin-bottom: 16px;
}

.record-section:last-child {
  margin-bottom: 0;
}

.record-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.record-text {
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.5;
}

/* Bottom Actions */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-top: 0.5px solid var(--border-color);
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.actions-container {
  display: flex;
  gap: 10px;
  max-width: 500px;
  margin: 0 auto;
}

.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.action-btn:active {
  transform: scale(0.96);
}

.action-btn.attended {
  background: var(--apple-green);
  color: white;
}

.action-btn.no-show {
  background: var(--apple-red);
  color: white;
}

.action-btn.cancel {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.btn-icon {
  width: 22px;
  height: 22px;
}

/* Sheet Modal */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
}

.sheet-container {
  width: 100%;
  max-height: 85vh;
  background: var(--card-bg);
  border-radius: 20px 20px 0 0;
  padding: 12px 20px 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.sheet-handle {
  width: 36px;
  height: 5px;
  background: var(--border-color);
  border-radius: 3px;
  margin: 0 auto 16px;
}

.sheet-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.sheet-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  border-radius: 50%;
}

.sheet-icon.green {
  background: rgba(52, 199, 89, 0.15);
  color: var(--apple-green);
}

.sheet-icon.red {
  background: rgba(255, 59, 48, 0.15);
  color: var(--apple-red);
}

.sheet-icon.orange {
  background: rgba(255, 149, 0, 0.15);
  color: var(--apple-orange);
}

.sheet-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.form-textarea {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  resize: none;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--apple-blue);
}

.sheet-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  flex: 1;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  background: var(--bg-secondary);
  border: none;
  border-radius: 14px;
  color: var(--text-primary);
  cursor: pointer;
}

.btn-submit {
  flex: 1;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 14px;
  color: white;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-submit.green {
  background: var(--apple-green);
}

.btn-submit.red {
  background: var(--apple-red);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sheet Transition */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.3s;
}

.sheet-enter-active .sheet-container,
.sheet-leave-active .sheet-container {
  transition: transform 0.3s var(--ease-spring);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet-container,
.sheet-leave-to .sheet-container {
  transform: translateY(100%);
}

/* Slide Up Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s var(--ease-apple), opacity 0.3s;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Dark Mode */
:root.dark .info-card,
:root.dark .member-card,
:root.dark .contract-card,
:root.dark .notes-card,
:root.dark .lesson-plan-card,
:root.dark .record-card,
:root.dark .sheet-container {
  background: var(--card-bg);
}

/* Responsive */
@media (min-width: 768px) {
  .detail-content {
    max-width: 600px;
    margin: 0 auto;
  }

  .actions-container {
    max-width: 400px;
  }
}
</style>
