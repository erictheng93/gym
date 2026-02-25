<template>
  <div class="apple-dashboard">
    <!-- Hero Header Section -->
    <section class="hero-header">
      <div class="hero-content">
        <div class="greeting-section">
          <h1 class="hero-title">
            {{ greeting }}，{{ displayName }}
          </h1>
          <p class="hero-subtitle">
            {{ branchName }} · {{ formatDate(new Date()) }}
          </p>
        </div>
        
        <!-- Profile Avatar -->
        <div class="profile-avatar">
          <div class="avatar-circle">
            <span class="avatar-initials">{{ getInitials(displayName) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats Cards with Apple-style Design -->
    <section class="stats-section">
      <div class="stats-grid">
        <div class="stat-card primary">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ todayClassCount }}</div>
            <div class="stat-label">今日課程</div>
          </div>
          <div class="stat-trend">
            <span class="trend-indicator positive">+12%</span>
          </div>
        </div>

        <div class="stat-card secondary">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ studentCount }}</div>
            <div class="stat-label">指派學員</div>
          </div>
          <div class="stat-trend">
            <span class="trend-indicator neutral">穩定</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Today's Schedule Section -->
    <section class="schedule-section">
      <div class="section-header">
        <h2 class="section-title">今日課程</h2>
        <NuxtLink to="/classes" class="view-all-link">
          <span>查看全部</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </NuxtLink>
      </div>

      <div class="schedule-card">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>載入課程中...</p>
        </div>

        <div v-else-if="todayClasses.length === 0" class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>今天沒有排定的課程</h3>
          <p>享受您的休息時間，或查看明天的安排</p>
        </div>

        <div v-else class="class-list">
          <div
            v-for="(classItem, index) in todayClasses"
            :key="classItem.id"
            class="class-item"
            :style="{ animationDelay: `${index * 0.1}s` }"
            @click="goToClass(classItem.id)"
          >
            <div class="class-time">
              <div class="time-display">{{ formatTime(classItem.scheduled_at) }}</div>
              <div class="duration">{{ classItem.duration_minutes }}分</div>
            </div>
            
            <div class="class-details">
              <div class="member-info">
                <div class="member-avatar">
                  <span>{{ getInitials(classItem.member.full_name) }}</span>
                </div>
                <div class="member-details">
                  <h4 class="member-name">{{ classItem.member.full_name }}</h4>
                  <p class="plan-info">
                    {{ classItem.contract.plan_name }}
                    <span v-if="classItem.contract.plan_type === 'COUNT_BASED'" class="remaining-count">
                      剩餘 {{ classItem.contract.remaining_counts }} 堂
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div class="class-status">
              <span class="status-badge" :class="getStatusClass(classItem.status)">
                {{ getStatusText(classItem.status) }}
              </span>
              <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick Actions Grid -->
    <section class="actions-section">
      <h2 class="section-title">快速操作</h2>
      <div class="actions-grid">
        <NuxtLink to="/students" class="action-card students">
          <div class="action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div class="action-content">
            <h3>學員管理</h3>
            <p>查看與管理指派學員</p>
          </div>
          <div class="action-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </NuxtLink>

        <NuxtLink to="/lessons" class="action-card lessons">
          <div class="action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div class="action-content">
            <h3>教案管理</h3>
            <p>建立與管理訓練教案</p>
          </div>
          <div class="action-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </NuxtLink>

        <NuxtLink to="/schedule" class="action-card schedule">
          <div class="action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="action-content">
            <h3>週行事曆</h3>
            <p>查看本週課程排程</p>
          </div>
          <div class="action-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </NuxtLink>

        <NuxtLink to="/library" class="action-card library">
          <div class="action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div class="action-content">
            <h3>教學資源庫</h3>
            <p>動作示範與影片庫</p>
          </div>
          <div class="action-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ClassBooking } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const config = useRuntimeConfig()
const { displayName, branchName, studentCount, todayClassCount, getAuthHeader } = useCoachAuth()

const loading = ref(true)
const todayClasses = ref<ClassBooking[]>([])

// Greeting based on time
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早安'
  if (hour < 18) return '午安'
  return '晚安'
})

// Helper functions
const getInitials = (name: string) => {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length === 1) {
    return (parts[0] ?? '').charAt(0).toUpperCase()
  }
  return ((parts[0] ?? '').charAt(0) + (parts[parts.length - 1] ?? '').charAt(0)).toUpperCase()
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
}

// Fetch today's classes
const fetchTodayClasses = async () => {
  loading.value = true
  try {
    const today = new Date().toISOString().split('T')[0]
    const response = await $fetch<{
      success: boolean
      data: ClassBooking[]
    }>(`${config.public.apiBaseUrl}/api/coach/classes`, {
      headers: getAuthHeader(),
      query: { date: today, limit: 10 },
    })

    if (response.success) {
      todayClasses.value = response.data
    }
  } catch (error) {
    console.error('Failed to fetch classes:', error)
  } finally {
    loading.value = false
  }
}

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'status-booked',
    COMPLETED: 'status-completed',
    MEMBER_CANCELLED: 'status-cancelled',
    COACH_CANCELLED: 'status-cancelled',
    NO_SHOW: 'status-no-show',
  }
  return classes[status] || 'status-default'
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

const goToClass = (id: string) => {
  router.push(`/classes/${id}`)
}

onMounted(() => {
  fetchTodayClasses()
})
</script>
<style scoped>
/* ============================================
   APPLE-INSPIRED COACH DASHBOARD DESIGN
   ============================================ */

.apple-dashboard {
  --apple-blue: #007AFF;
  --apple-green: #34C759;
  --apple-orange: #FF9500;
  --apple-red: #FF3B30;
  --apple-purple: #AF52DE;
  --apple-pink: #FF2D92;
  --apple-teal: #5AC8FA;
  --apple-indigo: #5856D6;
  
  --bg-primary: #F2F2F7;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F2F2F7;
  --text-primary: #000000;
  --text-secondary: #3C3C43;
  --text-tertiary: #8E8E93;
  --separator: #C6C6C8;
  --fill-quaternary: rgba(116, 116, 128, 0.08);
  
  min-height: 100vh;
  background: var(--bg-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  padding: 0 0 100px 0; /* Account for bottom nav */
  animation: fadeIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.dark .apple-dashboard {
  --bg-primary: #000000;
  --bg-secondary: #1C1C1E;
  --bg-tertiary: #2C2C2E;
  --text-primary: #FFFFFF;
  --text-secondary: #EBEBF5;
  --text-tertiary: #8E8E93;
  --separator: #38383A;
  --fill-quaternary: rgba(118, 118, 128, 0.16);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Hero Header Section */
.hero-header {
  padding: 20px 20px 32px 20px;
  background: linear-gradient(135deg, var(--apple-blue) 0%, var(--apple-teal) 100%);
  position: relative;
  overflow: hidden;
}

.hero-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/><circle cx="50" cy="10" r="0.5" fill="white" opacity="0.1"/><circle cx="10" cy="60" r="0.5" fill="white" opacity="0.1"/><circle cx="90" cy="40" r="0.5" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
  pointer-events: none;
}

.hero-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  z-index: 1;
}

.greeting-section {
  flex: 1;
}

.hero-title {
  font-size: 28px;
  font-weight: 700;
  color: white;
  margin: 0 0 8px 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.hero-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  font-weight: 500;
}

.profile-avatar {
  margin-left: 16px;
}

.avatar-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.avatar-initials {
  font-size: 20px;
  font-weight: 600;
  color: white;
}

/* Stats Section */
.stats-section {
  padding: 0 20px 32px 20px;
  margin-top: -16px;
  position: relative;
  z-index: 2;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-card {
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--separator);
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.stat-card:active {
  transform: scale(0.98);
}

.stat-card.primary {
  background: linear-gradient(135deg, var(--apple-blue) 0%, var(--apple-teal) 100%);
  color: white;
  border: none;
}

.stat-card.secondary {
  background: linear-gradient(135deg, var(--apple-green) 0%, var(--apple-teal) 100%);
  color: white;
  border: none;
}

.stat-icon {
  width: 24px;
  height: 24px;
  margin-bottom: 12px;
  opacity: 0.9;
}

.stat-icon svg {
  width: 100%;
  height: 100%;
}

.stat-number {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 14px;
  opacity: 0.8;
  font-weight: 500;
}

.stat-trend {
  position: absolute;
  top: 16px;
  right: 16px;
}

.trend-indicator {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
}

.trend-indicator.positive {
  color: #34C759;
  background: rgba(52, 199, 89, 0.15);
}

.trend-indicator.neutral {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.15);
}

/* Section Headers */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.02em;
}

.view-all-link {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--apple-blue);
  text-decoration: none;
  font-size: 16px;
  font-weight: 500;
  transition: opacity 0.2s ease;
}

.view-all-link:hover {
  opacity: 0.7;
}

.view-all-link svg {
  width: 16px;
  height: 16px;
}

/* Schedule Section */
.schedule-section {
  padding: 0 20px 32px 20px;
}

.schedule-card {
  background: var(--bg-secondary);
  border-radius: 16px;
  border: 1px solid var(--separator);
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.loading-state {
  padding: 48px 20px;
  text-align: center;
  color: var(--text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--fill-quaternary);
  border-top-color: var(--apple-blue);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  padding: 48px 20px;
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px auto;
  color: var(--text-tertiary);
}

.empty-state h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.empty-state p {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0;
}

.class-list {
  padding: 0;
}

.class-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--separator);
  cursor: pointer;
  transition: background-color 0.2s ease;
  animation: slideInUp 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
}

.class-item:last-child {
  border-bottom: none;
}

.class-item:hover {
  background: var(--fill-quaternary);
}

.class-item:active {
  background: rgba(0, 122, 255, 0.1);
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.class-time {
  min-width: 80px;
  text-align: center;
  margin-right: 16px;
}

.time-display {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.duration {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.class-details {
  flex: 1;
  min-width: 0;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--apple-blue) 0%, var(--apple-teal) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.member-details {
  min-width: 0;
  flex: 1;
}

.member-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  line-height: 1.2;
}

.plan-info {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.2;
}

.remaining-count {
  color: var(--apple-orange);
  font-weight: 500;
}

.class-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge.status-booked {
  background: rgba(0, 122, 255, 0.15);
  color: var(--apple-blue);
}

.status-badge.status-completed {
  background: rgba(52, 199, 89, 0.15);
  color: var(--apple-green);
}

.status-badge.status-cancelled {
  background: rgba(142, 142, 147, 0.15);
  color: var(--text-tertiary);
}

.status-badge.status-no-show {
  background: rgba(255, 59, 48, 0.15);
  color: var(--apple-red);
}

.chevron-icon {
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
}

/* Actions Section */
.actions-section {
  padding: 0 20px 32px 20px;
}

.actions-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.action-card {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-radius: 16px;
  border: 1px solid var(--separator);
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.action-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.action-card:active {
  transform: scale(0.98);
}

.action-card.students {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.1) 0%, rgba(90, 200, 250, 0.1) 100%);
  border-color: rgba(0, 122, 255, 0.2);
}

.action-card.lessons {
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.1) 0%, rgba(90, 200, 250, 0.1) 100%);
  border-color: rgba(52, 199, 89, 0.2);
}

.action-card.schedule {
  background: linear-gradient(135deg, rgba(175, 82, 222, 0.1) 0%, rgba(255, 45, 146, 0.1) 100%);
  border-color: rgba(175, 82, 222, 0.2);
}

.action-card.library {
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.1) 0%, rgba(255, 59, 48, 0.1) 100%);
  border-color: rgba(255, 149, 0, 0.2);
}

.action-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  flex-shrink: 0;
}

.students .action-icon {
  background: linear-gradient(135deg, var(--apple-blue) 0%, var(--apple-teal) 100%);
  color: white;
}

.lessons .action-icon {
  background: linear-gradient(135deg, var(--apple-green) 0%, var(--apple-teal) 100%);
  color: white;
}

.schedule .action-icon {
  background: linear-gradient(135deg, var(--apple-purple) 0%, var(--apple-pink) 100%);
  color: white;
}

.library .action-icon {
  background: linear-gradient(135deg, var(--apple-orange) 0%, var(--apple-red) 100%);
  color: white;
}

.action-icon svg {
  width: 24px;
  height: 24px;
}

.action-content {
  flex: 1;
  min-width: 0;
}

.action-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  line-height: 1.2;
}

.action-content p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.2;
}

.action-arrow {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  margin-left: 12px;
  flex-shrink: 0;
}

.action-arrow svg {
  width: 100%;
  height: 100%;
}

/* Responsive Design */
@media (max-width: 480px) {
  .hero-title {
    font-size: 24px;
  }
  
  .hero-subtitle {
    font-size: 14px;
  }
  
  .avatar-circle {
    width: 48px;
    height: 48px;
  }
  
  .avatar-initials {
    font-size: 18px;
  }
  
  .stats-grid {
    gap: 12px;
  }
  
  .stat-card {
    padding: 16px;
  }
  
  .stat-number {
    font-size: 28px;
  }
  
  .section-title {
    font-size: 20px;
  }
  
  .class-item {
    padding: 12px 16px;
  }
  
  .action-card {
    padding: 12px 16px;
  }
}

/* Dark mode specific adjustments */
.dark .stat-card:not(.primary):not(.secondary) {
  background: var(--bg-tertiary);
}

.dark .schedule-card {
  background: var(--bg-secondary);
}

.dark .action-card:not(.students):not(.lessons):not(.schedule):not(.library) {
  background: var(--bg-tertiary);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .stat-card {
    border-width: 2px;
  }
  
  .action-card {
    border-width: 2px;
  }
  
  .schedule-card {
    border-width: 2px;
  }
}
</style>