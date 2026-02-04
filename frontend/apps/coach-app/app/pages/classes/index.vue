<template>
  <div class="apple-page">
    <!-- Page Header -->
    <header class="page-header">
      <h1 class="page-title">課程管理</h1>
      <p class="page-subtitle">{{ getDateLabel() }}</p>
    </header>

    <!-- Date Strip Calendar -->
    <div class="date-strip-section">
      <div class="date-strip">
        <button
          v-for="day in weekDays"
          :key="day.date"
          class="date-item"
          :class="{
            active: day.date === selectedDate,
            today: day.isToday,
          }"
          @click="selectDate(day.date)"
        >
          <span class="date-weekday">{{ day.weekday }}</span>
          <span class="date-day">{{ day.day }}</span>
          <span v-if="day.isToday" class="today-dot" />
        </button>
      </div>
    </div>

    <!-- Status Filter Pills -->
    <div class="filter-section">
      <div class="filter-scroll">
        <button
          v-for="status in statusOptions"
          :key="status.value"
          class="filter-pill"
          :class="{ active: selectedStatus === status.value }"
          @click="setStatusFilter(status.value)"
        >
          <span v-if="status.dot" class="filter-dot" :class="status.dot" />
          {{ status.label }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="apple-spinner" />
      <p>載入課程中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="classes.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h3>沒有找到課程</h3>
      <p>這天沒有排定的課程</p>
    </div>

    <!-- Classes List -->
    <div v-else class="classes-list">
      <div class="list-card">
        <div
          v-for="(classItem, index) in classes"
          :key="classItem.id"
          class="class-item stagger-item"
          :style="{ animationDelay: `${index * 0.05}s` }"
          @click="goToClass(classItem.id)"
        >
          <!-- Time Block -->
          <div class="time-block" :class="getTimeBlockClass(classItem.status)">
            <span class="time-display">{{ formatTime(classItem.scheduled_at) }}</span>
            <span class="time-duration">{{ classItem.duration_minutes }}分</span>
          </div>

          <!-- Content -->
          <div class="class-content">
            <div class="class-header">
              <h3 class="member-name">{{ classItem.member.full_name }}</h3>
              <span class="status-badge" :class="getStatusBadgeClass(classItem.status)">
                {{ getStatusText(classItem.status) }}
              </span>
            </div>
            <p class="plan-info">{{ classItem.contract.plan_name }}</p>
            <p v-if="classItem.contract.plan_type === 'COUNT_BASED'" class="remaining-info">
              剩餘 {{ classItem.contract.remaining_counts }} 堂
            </p>
          </div>

          <!-- Actions / Chevron -->
          <div class="class-actions">
            <template v-if="classItem.status === 'BOOKED'">
              <button
                class="action-button success"
                @click.stop="handleAttendance(classItem.id, true)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                class="action-button danger"
                @click.stop="handleAttendance(classItem.id, false)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <svg v-else class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="classes.length > 0 && classes.length < total" class="load-more">
      <button class="load-more-button" @click="loadMore">
        <span>載入更多</span>
        <span class="load-more-count">{{ classes.length }} / {{ total }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { success, error: showError } = useToast()
const { classes, loading, total, fetchClasses, markAttendance } = useCoachClasses()

const selectedDate = ref(new Date().toISOString().split('T')[0])
const selectedStatus = ref('')
const offset = ref(0)
const limit = 20

// Generate week days for date strip
const weekDays = computed(() => {
  const today = new Date()
  const days = []

  // Start from 3 days ago
  for (let i = -3; i <= 3; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]

    days.push({
      date: dateStr,
      day: date.getDate(),
      weekday: date.toLocaleDateString('zh-TW', { weekday: 'short' }).replace('週', ''),
      isToday: i === 0,
    })
  }

  return days
})

const statusOptions = [
  { value: '', label: '全部', dot: null },
  { value: 'BOOKED', label: '待上課', dot: 'booked' },
  { value: 'COMPLETED', label: '已完成', dot: 'completed' },
  { value: 'NO_SHOW', label: '未到', dot: 'no-show' },
  { value: 'MEMBER_CANCELLED', label: '已取消', dot: 'cancelled' },
]

const getDateLabel = () => {
  if (!selectedDate.value) return ''
  const date = new Date(selectedDate.value)
  const today = new Date().toISOString().split('T')[0]

  if (selectedDate.value === today) {
    return '今日課程'
  }

  return date.toLocaleDateString('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

const selectDate = (date: string) => {
  selectedDate.value = date
  offset.value = 0
  loadClasses()
}

const setStatusFilter = (status: string) => {
  selectedStatus.value = status
  offset.value = 0
  loadClasses()
}

const loadClasses = async () => {
  await fetchClasses({
    date: selectedDate.value || undefined,
    status: selectedStatus.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  await fetchClasses({
    date: selectedDate.value || undefined,
    status: selectedStatus.value || undefined,
    limit,
    offset: offset.value,
  })
}

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getTimeBlockClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'time-booked',
    COMPLETED: 'time-completed',
    MEMBER_CANCELLED: 'time-cancelled',
    COACH_CANCELLED: 'time-cancelled',
    NO_SHOW: 'time-no-show',
  }
  return classes[status] || 'time-default'
}

const getStatusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'badge-blue',
    COMPLETED: 'badge-green',
    MEMBER_CANCELLED: 'badge-gray',
    COACH_CANCELLED: 'badge-gray',
    NO_SHOW: 'badge-red',
  }
  return classes[status] || 'badge-gray'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    BOOKED: '待上課',
    COMPLETED: '已完成',
    MEMBER_CANCELLED: '學員取消',
    COACH_CANCELLED: '教練取消',
    NO_SHOW: '未到',
  }
  return texts[status] || status
}

const goToClass = (id: string) => {
  router.push(`/classes/${id}`)
}

const handleAttendance = async (classId: string, attended: boolean) => {
  const result = await markAttendance(classId, { attended })

  if (result.success) {
    success(attended ? '已標記出席' : '已標記未到')
    await loadClasses()
  } else {
    showError(result.message || '操作失敗')
  }
}

onMounted(() => {
  loadClasses()
})
</script>

<style scoped>
/* ============================================
   APPLE-STYLE CLASSES PAGE
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

/* Date Strip Section */
.date-strip-section {
  padding: 16px 0;
}

.date-strip {
  display: flex;
  justify-content: space-around;
  padding: 0 12px;
  gap: 4px;
}

.date-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 14px;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
  min-width: 44px;
}

.date-item:hover {
  background: var(--fill-quaternary);
}

.date-item:active {
  transform: scale(0.95);
}

.date-item.active {
  background: var(--apple-blue);
}

.date-item.active .date-weekday,
.date-item.active .date-day {
  color: white;
}

.date-weekday {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.date-day {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.today-dot {
  position: absolute;
  bottom: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--apple-blue);
}

.date-item.active .today-dot {
  background: white;
}

/* Filter Section */
.filter-section {
  padding: 0 20px 16px 20px;
}

.filter-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.filter-scroll::-webkit-scrollbar {
  display: none;
}

.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  border: none;
  cursor: pointer;
  background: var(--fill-tertiary);
  color: var(--text-secondary);
  transition: all 0.2s var(--ease-apple);
}

.filter-pill:active {
  transform: scale(0.96);
}

.filter-pill.active {
  background: var(--apple-blue);
  color: white;
}

.filter-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.filter-dot.booked {
  background: var(--apple-blue);
}

.filter-dot.completed {
  background: var(--apple-green);
}

.filter-dot.no-show {
  background: var(--apple-red);
}

.filter-dot.cancelled {
  background: var(--text-tertiary);
}

.filter-pill.active .filter-dot {
  background: white;
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

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  color: var(--text-quaternary);
}

.empty-state h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.empty-state p {
  font-size: 15px;
  color: var(--text-tertiary);
  margin: 0;
}

/* Classes List */
.classes-list {
  padding: 0 20px;
}

.list-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--separator);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.class-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.15s var(--ease-apple);
}

.class-item:not(:last-child) {
  border-bottom: 0.5px solid var(--separator);
}

.class-item:hover {
  background: var(--fill-quaternary);
}

.class-item:active {
  background: var(--fill-tertiary);
}

/* Time Block */
.time-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  margin-right: 14px;
}

.time-block.time-booked {
  background: rgba(0, 122, 255, 0.12);
}

.time-block.time-completed {
  background: rgba(52, 199, 89, 0.12);
}

.time-block.time-cancelled {
  background: var(--fill-tertiary);
}

.time-block.time-no-show {
  background: rgba(255, 59, 48, 0.12);
}

.time-display {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
}

.time-duration {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* Content */
.class-content {
  flex: 1;
  min-width: 0;
}

.class-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.member-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.status-badge.badge-blue {
  background: rgba(0, 122, 255, 0.12);
  color: var(--apple-blue);
}

.status-badge.badge-green {
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

.status-badge.badge-red {
  background: rgba(255, 59, 48, 0.12);
  color: var(--apple-red);
}

.status-badge.badge-gray {
  background: var(--fill-tertiary);
  color: var(--text-tertiary);
}

.plan-info {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.remaining-info {
  font-size: 12px;
  color: var(--apple-orange);
  margin: 4px 0 0 0;
  font-weight: 500;
}

/* Actions */
.class-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}

.action-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.action-button:active {
  transform: scale(0.9);
}

.action-button.success {
  background: rgba(52, 199, 89, 0.15);
  color: var(--apple-green);
}

.action-button.success:hover {
  background: rgba(52, 199, 89, 0.25);
}

.action-button.danger {
  background: rgba(255, 59, 48, 0.15);
  color: var(--apple-red);
}

.action-button.danger:hover {
  background: rgba(255, 59, 48, 0.25);
}

.action-button svg {
  width: 18px;
  height: 18px;
}

.chevron-icon {
  width: 20px;
  height: 20px;
  color: var(--text-quaternary);
}

/* Load More */
.load-more {
  padding: 20px;
}

.load-more-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  background: var(--fill-tertiary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 500;
  color: var(--apple-blue);
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.load-more-button:hover {
  background: var(--fill-secondary);
}

.load-more-button:active {
  transform: scale(0.98);
}

.load-more-count {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 400;
}

/* Dark mode */
.dark .list-card {
  background: var(--bg-secondary);
}

/* Responsive */
@media (min-width: 768px) {
  .page-header {
    padding: 24px 24px 0 24px;
  }

  .filter-section {
    padding: 0 24px 20px 24px;
  }

  .classes-list {
    padding: 0 24px;
  }

  .load-more {
    padding: 24px;
  }

  .date-strip {
    padding: 0 24px;
  }
}
</style>
