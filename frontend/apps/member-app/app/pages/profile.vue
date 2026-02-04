<script setup lang="ts">
/**
 * 個人資料頁面
 * 顯示會員資料、編輯功能、更多選項
 */
import { updateProfileSchema } from '../schemas/profile.schema'
import { useFormValidation } from '../composables/useFormValidation'

definePageMeta({
  middleware: 'auth'
})

const config = useRuntimeConfig()
const apiUrl = config.public.apiBaseUrl
const { member, logout, fetchMember, getAuthHeader } = useMemberAuth()
const toast = useToast()
const { handleError } = useApiError()
const profileForm = useFormValidation(updateProfileSchema)

// 編輯模式
const isEditing = ref(false)
const isSaving = ref(false)

// Pull-to-refresh
const isPulling = ref(false)
const pullDistance = ref(0)
const isRefreshing = ref(false)
const startTouchY = ref(0)
const PULL_THRESHOLD = 80

// 編輯表單
const editForm = reactive({
  full_name: '',
  phone: '',
  email: '',
  emergency_contact: '',
  emergency_phone: '',
})

// API response type
interface MemberApiResponse {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  email: string | null
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null
  birthday: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  branch_id: string | null
  branch: { name: string } | null
  member_status: string
  date_created: string
  avatar: string | null
}

// 完整會員資料
interface MemberDetail {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  email: string | null
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null
  birthday: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  branch_id: string | null
  branch: { name: string } | null
  member_status: string
  created_at: string
  avatar: string | null
}

const memberDetail = ref<MemberDetail | null>(null)
const isLoadingDetail = ref(false)

// 載入完整會員資料
const loadMemberDetail = async () => {
  if (!member.value) return

  isLoadingDetail.value = true
  try {
    const response = await $fetch<{ success: boolean; data: MemberApiResponse }>(`${apiUrl}/api/member/profile`, {
      headers: getAuthHeader(),
    })

    if (response.success && response.data) {
      memberDetail.value = {
        ...response.data,
        created_at: response.data.date_created,
      }
    }
  } catch (error) {
    handleError(error, { fallbackMessage: '無法載入會員資料' })
  } finally {
    isLoadingDetail.value = false
  }
}

// 開始編輯
const startEdit = () => {
  if (memberDetail.value) {
    editForm.full_name = memberDetail.value.full_name || ''
    editForm.phone = memberDetail.value.phone || ''
    editForm.email = memberDetail.value.email || ''
    editForm.emergency_contact = memberDetail.value.emergency_contact || ''
    editForm.emergency_phone = memberDetail.value.emergency_phone || ''
  }
  isEditing.value = true
}

// 取消編輯
const cancelEdit = () => {
  isEditing.value = false
  profileForm.clearErrors()
}

// 儲存編輯
const saveEdit = async () => {
  if (!member.value || !memberDetail.value) return

  // 驗證
  const result = profileForm.validate({
    full_name: editForm.full_name.trim() || undefined,
    phone: editForm.phone.trim() || undefined,
    email: editForm.email.trim() || undefined,
    emergency_contact: editForm.emergency_contact.trim() || undefined,
    emergency_phone: editForm.emergency_phone.trim() || undefined,
  })

  if (!result.success) {
    const firstError = Object.values(profileForm.errors.value)[0]
    toast.error(firstError || '請檢查輸入資料')
    return
  }

  isSaving.value = true
  try {
    await $fetch(`${apiUrl}/api/member/profile`, {
      method: 'PATCH',
      headers: getAuthHeader(),
      body: {
        full_name: result.data.full_name || null,
        phone: result.data.phone || null,
        email: result.data.email || null,
        emergency_contact: result.data.emergency_contact || null,
        emergency_phone: result.data.emergency_phone || null,
      },
    })

    toast.success('資料已更新')
    isEditing.value = false
    profileForm.clearErrors()

    // 重新載入資料
    await Promise.all([fetchMember(), loadMemberDetail()])
  } catch (error) {
    handleError(error, { fallbackMessage: '更新資料失敗' })
  } finally {
    isSaving.value = false
  }
}

// 登出
const handleLogout = async () => {
  if (confirm('確定要登出嗎？')) {
    await logout()
  }
}

// 格式化日期
const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
}

// 格式化性別
const formatGender = (gender: string | null | undefined) => {
  const genderMap: Record<string, string> = {
    MALE: '男',
    FEMALE: '女',
    OTHER: '其他',
  }
  return gender ? genderMap[gender] || '-' : '-'
}

// 格式化會籍狀態
const getStatusInfo = (status: string) => {
  const statusMap: Record<string, { label: string; class: string }> = {
    ACTIVE: { label: '有效會員', class: 'status-active' },
    EXPIRED: { label: '已到期', class: 'status-expired' },
    SUSPENDED: { label: '已暫停', class: 'status-suspended' },
    INACTIVE: { label: '未啟用', class: 'status-inactive' },
  }
  return statusMap[status] || { label: status, class: '' }
}

// 計算會員年資
const membershipDuration = computed(() => {
  if (!memberDetail.value?.created_at) return null

  const created = new Date(memberDetail.value.created_at)
  const now = new Date()
  const years = now.getFullYear() - created.getFullYear()
  const months = now.getMonth() - created.getMonth()

  if (years > 0) {
    return `${years} 年${months > 0 ? ` ${months} 個月` : ''}`
  }
  return months > 0 ? `${months} 個月` : '不到 1 個月'
})

const menuItems = [
  { icon: 'activity', label: '健身追蹤', description: '目標、體態、運動紀錄', path: '/fitness' },
  { icon: 'history', label: '入場紀錄', description: '查看進出場記錄', path: '/profile/checkins' },
  { icon: 'payment', label: '付款紀錄', description: '交易與帳單明細', path: '/profile/payments' },
  { icon: 'bell', label: '通知設定', description: '管理推播與提醒', path: '/profile/notifications' },
  { icon: 'alert', label: '問題回報', description: '回報問題與查看狀態', path: '/profile/issues' },
  { icon: 'help', label: '聯絡客服', description: '問題諮詢與回報', path: '/profile/support' },
]

// Theme settings
const { themeMode, setTheme } = useTheme()

type ThemeModeType = 'light' | 'dark' | 'system'
const themeOptions: { value: ThemeModeType; label: string; icon: string }[] = [
  { value: 'light', label: '淺色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '系統', icon: 'auto' },
]

const handleThemeChange = (mode: ThemeModeType) => {
  setTheme(mode)
}

// Icon color mapping for iOS style
const getIconColor = (icon: string) => {
  const colorMap: Record<string, string> = {
    activity: 'pink',
    history: 'blue',
    payment: 'green',
    bell: 'red',
    alert: 'orange',
    help: 'teal',
  }
  return colorMap[icon] || 'gray'
}

// Pull-to-refresh handlers
const handleTouchStart = (e: TouchEvent) => {
  const touch = e.touches[0]
  if (!touch) return

  if (window.scrollY === 0 && !isRefreshing.value) {
    isPulling.value = true
    startTouchY.value = touch.clientY
  }
}

const handleTouchMove = (e: TouchEvent) => {
  if (!isPulling.value || isRefreshing.value) return

  const touch = e.touches[0]
  if (!touch) return

  const delta = touch.clientY - startTouchY.value
  pullDistance.value = Math.max(0, Math.min(delta, 120))
}

const handleTouchEnd = async () => {
  if (!isPulling.value) return

  if (pullDistance.value >= PULL_THRESHOLD) {
    isRefreshing.value = true
    await handleRefresh()
  }

  isPulling.value = false
  pullDistance.value = 0
  isRefreshing.value = false
}

const handleRefresh = async () => {
  await Promise.all([fetchMember(), loadMemberDetail()])
  toast.success('資料已更新')
}

onMounted(() => {
  loadMemberDetail()
})
</script>

<template>
  <div
    class="profile-page"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Pull-to-refresh indicator -->
    <div
      class="pull-indicator"
      :class="{ visible: isPulling || isRefreshing }"
      :style="{ transform: `translateY(${pullDistance - 40}px)` }"
    >
      <div class="pull-spinner" :class="{ spinning: isRefreshing }" />
    </div>

    <!-- Profile Header - iOS Style -->
    <header class="profile-header">
      <div class="avatar">
        {{ member?.full_name?.charAt(0) || 'M' }}
      </div>
      <h1 class="profile-name">{{ member?.full_name }}</h1>
      <p class="profile-code">{{ member?.member_code }}</p>
      <div
        class="status-badge"
        :class="getStatusInfo(member?.member_status || '').class"
      >
        <span class="status-dot" />
        {{ getStatusInfo(member?.member_status || '').label }}
      </div>
    </header>

    <!-- Quick Stats - iOS Card Style -->
    <div v-if="isLoadingDetail" class="stats-card">
      <div class="stat-item">
        <SkeletonLoader width="60px" height="20px" radius="4px" />
        <span class="stat-label">會員年資</span>
      </div>
      <div class="stat-divider" />
      <div class="stat-item">
        <SkeletonLoader width="40px" height="20px" radius="4px" />
        <span class="stat-label">合約狀態</span>
      </div>
      <div class="stat-divider" />
      <div class="stat-item">
        <SkeletonLoader width="60px" height="20px" radius="4px" />
        <span class="stat-label">所屬分店</span>
      </div>
    </div>
    <div v-else-if="memberDetail" class="stats-card">
      <div class="stat-item">
        <span class="stat-value">{{ membershipDuration || '-' }}</span>
        <span class="stat-label">會員年資</span>
      </div>
      <div class="stat-divider" />
      <div class="stat-item">
        <span class="stat-value">{{ member?.activeContract ? '有效' : '無' }}</span>
        <span class="stat-label">合約狀態</span>
      </div>
      <div class="stat-divider" />
      <div class="stat-item">
        <span class="stat-value">{{ member?.branch_name || '-' }}</span>
        <span class="stat-label">所屬分店</span>
      </div>
    </div>

    <!-- Profile Details Section -->
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">個人資料</h2>
        <button v-if="!isEditing" class="edit-btn" @click="startEdit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          編輯
        </button>
      </div>

      <!-- View Mode -->
      <div v-if="!isEditing" class="info-card">
        <div class="info-row">
          <span class="info-label">姓名</span>
          <span class="info-value">{{ memberDetail?.full_name || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">手機</span>
          <span class="info-value">{{ memberDetail?.phone || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value email-value">{{ memberDetail?.email || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">性別</span>
          <span class="info-value">{{ formatGender(memberDetail?.gender) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">生日</span>
          <span class="info-value">{{ formatDate(memberDetail?.birthday) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">緊急聯絡人</span>
          <span class="info-value">{{ memberDetail?.emergency_contact || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">緊急電話</span>
          <span class="info-value">{{ memberDetail?.emergency_phone || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">加入日期</span>
          <span class="info-value">{{ formatDate(memberDetail?.created_at) }}</span>
        </div>
      </div>

      <!-- Edit Mode -->
      <div v-else class="edit-card">
        <div class="input-group">
          <label for="edit-name">姓名</label>
          <input
            id="edit-name"
            v-model="editForm.full_name"
            type="text"
            placeholder="請輸入姓名"
          >
        </div>
        <div class="input-group">
          <label for="edit-phone">手機</label>
          <input
            id="edit-phone"
            v-model="editForm.phone"
            type="tel"
            placeholder="0912 345 678"
            inputmode="tel"
          >
        </div>
        <div class="input-group">
          <label for="edit-email">Email</label>
          <input
            id="edit-email"
            v-model="editForm.email"
            type="email"
            placeholder="example@email.com"
            inputmode="email"
          >
        </div>
        <div class="input-group">
          <label for="edit-emergency-contact">緊急聯絡人</label>
          <input
            id="edit-emergency-contact"
            v-model="editForm.emergency_contact"
            type="text"
            placeholder="聯絡人姓名"
          >
        </div>
        <div class="input-group">
          <label for="edit-emergency-phone">緊急電話</label>
          <input
            id="edit-emergency-phone"
            v-model="editForm.emergency_phone"
            type="tel"
            placeholder="0912 345 678"
            inputmode="tel"
          >
        </div>

        <div class="edit-actions">
          <button class="btn-cancel" :disabled="isSaving" @click="cancelEdit">
            取消
          </button>
          <button class="btn-save" :disabled="isSaving" @click="saveEdit">
            <span v-if="!isSaving">儲存</span>
            <span v-else class="loading-spinner" />
          </button>
        </div>

        <p class="edit-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          如需修改性別或生日，請至櫃台辦理
        </p>
      </div>
    </section>

    <!-- Appearance Section - Theme Toggle -->
    <section class="list-section">
      <h3 class="list-section-header">外觀設定</h3>
      <div class="list-inset-grouped">
        <div class="theme-row">
          <span class="list-icon purple">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </span>
          <span class="list-title">外觀主題</span>
        </div>
        <div class="theme-selector">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            class="theme-option"
            :class="{ active: themeMode === option.value }"
            @click="handleThemeChange(option.value)"
          >
            <span class="theme-option-icon">
              <!-- Sun icon for light -->
              <svg v-if="option.icon === 'sun'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <!-- Moon icon for dark -->
              <svg v-else-if="option.icon === 'moon'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <!-- Auto icon for system -->
              <svg v-else-if="option.icon === 'auto'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            <span class="theme-option-label">{{ option.label }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Menu Section - iOS Inset Grouped List -->
    <section class="list-section">
      <h3 class="list-section-header">功能選單</h3>
      <div class="list-inset-grouped">
        <NuxtLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="list-row"
        >
          <span class="list-icon" :class="getIconColor(item.icon)">
            <svg v-if="item.icon === 'activity'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <svg v-else-if="item.icon === 'history'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <svg v-else-if="item.icon === 'payment'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="1" y="4" width="22" height="16" rx="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <svg v-else-if="item.icon === 'bell'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <svg v-else-if="item.icon === 'alert'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <svg v-else-if="item.icon === 'help'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <span class="list-title">{{ item.label }}</span>
          <svg class="list-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M1 1l5.5 5.5L1 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </NuxtLink>
      </div>
    </section>

    <!-- Logout - iOS Inset Grouped List -->
    <section class="list-section">
      <div class="list-inset-grouped">
        <button class="list-row logout-row" @click="handleLogout">
          <span class="list-icon red">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span class="list-title logout-text">登出</span>
        </button>
      </div>
    </section>

    <!-- App Version -->
    <p class="app-version">Gym Nexus v1.0.0</p>
  </div>
</template>

<style scoped>
.profile-page {
  padding: 0;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
  position: relative;
}

/* Pull-to-refresh */
.pull-indicator {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(-40px);
  z-index: 10;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.pull-indicator.visible {
  opacity: 1;
}

.pull-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
}

.pull-spinner.spinning {
  animation: spin 0.8s linear infinite;
}

/* iOS Style Profile Header */
.profile-header {
  padding: 24px 16px 20px;
  text-align: center;
}

.avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  /* iOS system blue gradient for avatar */
  background: linear-gradient(180deg, #007aff 0%, #0055cc 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 600;
  margin: 0 auto 12px;
  /* Subtle inner shadow */
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.1);
}

.profile-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.4px;
  margin-bottom: 4px;
}

.profile-code {
  font-family: 'SF Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 13px;
  color: var(--color-text-secondary);
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 500;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-active {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.status-expired {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.status-suspended {
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.status-inactive {
  background: rgba(142, 142, 147, 0.12);
  color: #8e8e93;
}

/* Stats Card - iOS Style */
.stats-card {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin: 0 16px 24px;
  padding: 16px 12px;
  background: var(--color-background);
  border-radius: 12px;
  box-shadow:
    0 0 0 0.5px var(--color-border),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.theme-dark .stats-card {
  background: var(--color-surface);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.stat-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.stat-divider {
  width: 0.5px;
  height: 28px;
  background: var(--color-divider);
}

/* iOS Inset Grouped List Styles */
.list-section {
  margin-bottom: 24px;
}

.list-section-header {
  padding: 8px 36px 8px 16px;
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: -0.08px;
}

.list-inset-grouped {
  margin: 0 16px;
  background: var(--color-background);
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 0 0 0.5px var(--color-border),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.theme-dark .list-inset-grouped {
  background: var(--color-surface);
}

.list-row {
  display: flex;
  align-items: center;
  padding: 11px 16px;
  min-height: 44px;
  gap: 12px;
  text-decoration: none;
  color: var(--color-text);
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s ease;
  -webkit-tap-highlight-color: transparent;
}

.list-row:active {
  background: var(--color-surface);
}

.list-row:not(:last-child) {
  position: relative;
}

.list-row:not(:last-child)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 56px;
  right: 0;
  height: 0.5px;
  background: var(--color-divider);
}

.list-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.list-icon svg {
  color: white;
}

/* Icon colors - iOS system colors */
.list-icon.blue { background: #007aff; }
.list-icon.green { background: #34c759; }
.list-icon.orange { background: #ff9500; }
.list-icon.red { background: #ff3b30; }
.list-icon.purple { background: #af52de; }
.list-icon.pink { background: #ff2d55; }
.list-icon.teal { background: #5ac8fa; }
.list-icon.gray { background: #8e8e93; }

.list-title {
  flex: 1;
  font-size: 17px;
  font-weight: 400;
}

.list-chevron {
  color: rgba(60, 60, 67, 0.3);
  flex-shrink: 0;
}

:root.theme-dark .list-chevron {
  color: rgba(235, 235, 245, 0.3);
}

/* Logout row special styling */
.logout-row {
  font-size: 17px;
}

.logout-text {
  color: #ff3b30;
}

/* Section with title and edit button */
.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  margin-bottom: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: -0.08px;
}

.edit-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 400;
  color: #007aff;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.edit-btn:active {
  background: rgba(0, 122, 255, 0.1);
}

.edit-btn svg {
  display: none;
}

/* Info Card - iOS Inset Grouped Style */
.info-card {
  margin: 0 16px;
  background: var(--color-background);
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 0 0 0.5px var(--color-border),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.theme-dark .info-card {
  background: var(--color-surface);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 16px;
  min-height: 44px;
}

.info-row:not(:last-child) {
  position: relative;
}

.info-row:not(:last-child)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 16px;
  right: 0;
  height: 0.5px;
  background: var(--color-divider);
}

.info-label {
  font-size: 17px;
  color: var(--color-text);
  flex-shrink: 0;
}

.info-value {
  font-size: 17px;
  font-weight: 400;
  color: var(--color-text-secondary);
  text-align: right;
}

.email-value {
  word-break: break-all;
  max-width: 180px;
  font-size: 15px;
}

/* Edit Card - iOS Style */
.edit-card {
  margin: 0 16px;
  background: var(--color-background);
  border-radius: 10px;
  padding: 16px;
  box-shadow:
    0 0 0 0.5px var(--color-border),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.theme-dark .edit-card {
  background: var(--color-surface);
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  padding-left: 4px;
}

.input-group input {
  width: 100%;
  padding: 12px 14px;
  background-color: var(--color-surface);
  border: none;
  border-radius: 10px;
  font-size: 17px;
  color: var(--color-text);
  transition: box-shadow 0.15s ease;
}

:root.theme-dark .input-group input {
  background-color: rgba(118, 118, 128, 0.24);
}

.input-group input:focus {
  outline: none;
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.2);
}

.input-group input::placeholder {
  color: var(--color-text-secondary);
}

.edit-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn-cancel,
.btn-save {
  flex: 1;
  padding: 14px;
  border-radius: 12px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.btn-cancel {
  background-color: var(--color-surface);
  border: none;
  color: #007aff;
}

.btn-cancel:active:not(:disabled) {
  opacity: 0.7;
}

.btn-save {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #007aff;
  border: none;
  color: white;
}

.btn-save:active:not(:disabled) {
  background-color: #0055cc;
}

.btn-cancel:disabled,
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.edit-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 12px;
  background: rgba(0, 122, 255, 0.08);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.edit-hint svg {
  color: #007aff;
  flex-shrink: 0;
}

/* App Version */
.app-version {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  padding: 16px;
}

/* Theme Selector Styles */
.theme-row {
  display: flex;
  align-items: center;
  padding: 11px 16px;
  gap: 12px;
}

.theme-selector {
  display: flex;
  gap: 8px;
  padding: 8px 16px 16px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--color-surface-secondary);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.theme-option:active {
  transform: scale(0.97);
}

.theme-option.active {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
}

.theme-option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
}

.theme-option.active .theme-option-icon {
  background: var(--color-primary);
  color: white;
}

.theme-option-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: color 0.2s ease;
}

.theme-option.active .theme-option-label {
  color: var(--color-primary);
}
</style>
