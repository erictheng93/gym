<template>
  <div class="apple-page">
    <!-- Page Header -->
    <header class="page-header">
      <h1 class="page-title">學員管理</h1>
      <p class="page-subtitle">共 {{ total }} 位指派學員</p>
    </header>

    <!-- Search Bar -->
    <div class="search-section">
      <div class="apple-search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜尋學員姓名、電話或會員編號"
          @input="debouncedSearch"
        />
        <button
          v-if="searchQuery"
          class="search-clear"
          @click="clearSearch"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" stroke="white" stroke-width="2" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Filter Pills -->
    <div class="filter-section">
      <div class="filter-scroll">
        <!-- Role Filters -->
        <button
          class="filter-pill"
          :class="{ active: roleFilter === '' }"
          @click="setRoleFilter('')"
        >
          全部
        </button>
        <button
          class="filter-pill"
          :class="{ active: roleFilter === 'PRIMARY' }"
          @click="setRoleFilter('PRIMARY')"
        >
          <span class="filter-dot primary" />
          主教練
        </button>
        <button
          class="filter-pill"
          :class="{ active: roleFilter === 'SECONDARY' }"
          @click="setRoleFilter('SECONDARY')"
        >
          <span class="filter-dot secondary" />
          副教練
        </button>

        <span class="filter-divider" />

        <!-- Status Filters -->
        <button
          class="filter-pill"
          :class="{ active: statusFilter === 'ACTIVE' }"
          @click="setStatusFilter(statusFilter === 'ACTIVE' ? '' : 'ACTIVE')"
        >
          有效合約
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="apple-spinner" />
      <p>載入學員資料中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="students.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <h3>尚未有指派的學員</h3>
      <p>當有學員指派給您時，將會顯示在這裡</p>
    </div>

    <!-- Student List -->
    <div v-else class="student-list">
      <div class="list-card">
        <div
          v-for="(student, index) in students"
          :key="student.id"
          class="student-item stagger-item"
          :style="{ animationDelay: `${index * 0.05}s` }"
          @click="goToStudent(student.id)"
        >
          <!-- Avatar -->
          <div class="student-avatar" :class="getRoleClass(student.coach_role)">
            <span>{{ getInitials(student.full_name) }}</span>
          </div>

          <!-- Content -->
          <div class="student-content">
            <div class="student-header">
              <h3 class="student-name">{{ student.full_name }}</h3>
              <span class="role-badge" :class="getRoleBadgeClass(student.coach_role)">
                {{ student.coach_role === 'PRIMARY' ? '主教練' : '副教練' }}
              </span>
            </div>
            <p class="student-meta">
              {{ student.member_code }} · {{ formatPhone(student.phone ?? '') }}
            </p>

            <!-- Stats & Tags -->
            <div class="student-footer">
              <div class="student-stats">
                <span class="stat-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ student.completed_classes }} 堂
                </span>
                <span class="stat-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {{ student.active_contracts }} 合約
                </span>
              </div>

              <span v-if="student.current_goal" class="goal-badge">
                {{ getGoalText(student.current_goal) }}
              </span>
            </div>
          </div>

          <!-- Chevron -->
          <div class="student-chevron">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="students.length > 0 && students.length < total" class="load-more">
      <button class="load-more-button" @click="loadMore">
        <span>載入更多</span>
        <span class="load-more-count">{{ students.length }} / {{ total }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { students, loading, total, fetchStudents } = useStudents()

const searchQuery = ref('')
const roleFilter = ref('')
const statusFilter = ref('')
const offset = ref(0)
const limit = 20

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    offset.value = 0
    loadStudents()
  }, 300)
}

const clearSearch = () => {
  searchQuery.value = ''
  offset.value = 0
  loadStudents()
}

const setRoleFilter = (role: string) => {
  roleFilter.value = role
  offset.value = 0
  loadStudents()
}

const setStatusFilter = (status: string) => {
  statusFilter.value = status
  offset.value = 0
  loadStudents()
}

const loadStudents = async () => {
  await fetchStudents({
    search: searchQuery.value || undefined,
    role: roleFilter.value as 'PRIMARY' | 'SECONDARY' || undefined,
    status: statusFilter.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  await fetchStudents({
    search: searchQuery.value || undefined,
    role: roleFilter.value as 'PRIMARY' | 'SECONDARY' || undefined,
    status: statusFilter.value || undefined,
    limit,
    offset: offset.value,
  })
}

const goToStudent = (id: string) => {
  router.push(`/students/${id}`)
}

const getInitials = (name: string) => {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

const formatPhone = (phone: string) => {
  if (!phone) return ''
  // Format: 0912-XXX-XXX
  if (phone.length === 10) {
    return `${phone.slice(0, 4)}-XXX-${phone.slice(7)}`
  }
  return phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1-XXX-$3')
}

const getRoleClass = (role: string) => {
  return role === 'PRIMARY' ? 'role-primary' : 'role-secondary'
}

const getRoleBadgeClass = (role: string) => {
  return role === 'PRIMARY' ? 'badge-primary' : 'badge-secondary'
}

const getGoalText = (goalType: string) => {
  const goals: Record<string, string> = {
    WEIGHT_LOSS: '減重',
    MUSCLE_GAIN: '增肌',
    BODY_SHAPE: '體態雕塑',
    HEALTH: '健康維持',
    OTHER: '其他',
  }
  return goals[goalType] || goalType
}

onMounted(() => {
  loadStudents()
})
</script>

<style scoped>
/* ============================================
   APPLE-STYLE STUDENTS PAGE
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

/* Search Section */
.search-section {
  padding: 16px 20px;
}

.apple-search-bar {
  position: relative;
  display: flex;
  align-items: center;
}

.apple-search-bar input {
  width: 100%;
  height: 40px;
  padding: 0 40px 0 40px;
  background: var(--fill-tertiary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s var(--ease-apple);
}

.apple-search-bar input::placeholder {
  color: var(--text-tertiary);
}

.apple-search-bar input:focus {
  background: var(--fill-secondary);
}

.search-icon {
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-clear {
  position: absolute;
  right: 8px;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-clear svg {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
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

.filter-dot.primary {
  background: var(--apple-blue);
}

.filter-dot.secondary {
  background: var(--apple-green);
}

.filter-pill.active .filter-dot {
  background: white;
}

.filter-divider {
  width: 1px;
  height: 24px;
  background: var(--separator);
  margin: 0 4px;
  flex-shrink: 0;
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

/* Student List */
.student-list {
  padding: 0 20px;
}

.list-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--separator);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.student-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  transition: background-color 0.15s var(--ease-apple);
}

.student-item:not(:last-child) {
  border-bottom: 0.5px solid var(--separator);
}

.student-item:hover {
  background: var(--fill-quaternary);
}

.student-item:active {
  background: var(--fill-tertiary);
}

/* Avatar */
.student-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
  margin-right: 14px;
}

.student-avatar.role-primary {
  background: linear-gradient(135deg, var(--apple-blue) 0%, var(--apple-teal) 100%);
}

.student-avatar.role-secondary {
  background: linear-gradient(135deg, var(--apple-green) 0%, var(--apple-teal) 100%);
}

/* Content */
.student-content {
  flex: 1;
  min-width: 0;
}

.student-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.student-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
}

.role-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.role-badge.badge-primary {
  background: rgba(0, 122, 255, 0.12);
  color: var(--apple-blue);
}

.role-badge.badge-secondary {
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

.student-meta {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0 0 8px 0;
}

.student-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.student-stats {
  display: flex;
  gap: 12px;
}

.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-item svg {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
}

.goal-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

/* Chevron */
.student-chevron {
  width: 20px;
  height: 20px;
  color: var(--text-quaternary);
  flex-shrink: 0;
  margin-left: 8px;
}

.student-chevron svg {
  width: 100%;
  height: 100%;
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

  .search-section {
    padding: 20px 24px;
  }

  .filter-section {
    padding: 0 24px 20px 24px;
  }

  .student-list {
    padding: 0 24px;
  }

  .load-more {
    padding: 24px;
  }
}
</style>
