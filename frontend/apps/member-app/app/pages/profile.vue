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
const apiUrl = config.public.directusUrl
const { member, logout, fetchMember, getAuthHeader } = useMemberAuth()
const toast = useToast()
const { handleError } = useApiError()
const profileForm = useFormValidation(updateProfileSchema)

// 編輯模式
const isEditing = ref(false)
const isSaving = ref(false)

// 編輯表單
const editForm = reactive({
  full_name: '',
  phone: '',
  email: '',
  emergency_contact: '',
  emergency_phone: '',
})

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
    const response = await $fetch<{ data: MemberDetail[] }>(`${apiUrl}/items/members`, {
      headers: getAuthHeader(),
      params: {
        'filter[id][_eq]': member.value.id,
        'fields': 'id,member_code,full_name,phone,email,gender,birthday,emergency_contact,emergency_phone,branch_id,branch.name,member_status,date_created,avatar',
        'limit': 1,
      },
    })

    if (response.data && response.data.length > 0) {
      memberDetail.value = {
        ...response.data[0],
        created_at: response.data[0].date_created,
      } as MemberDetail
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
    await $fetch(`${apiUrl}/items/members/${member.value.id}`, {
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
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
}

// 格式化性別
const formatGender = (gender: string | null) => {
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
  { icon: 'history', label: '入場紀錄', description: '查看進出場記錄', path: '/profile/checkins' },
  { icon: 'payment', label: '付款紀錄', description: '交易與帳單明細', path: '/profile/payments' },
  { icon: 'bell', label: '通知設定', description: '管理推播與提醒', path: '/profile/notifications' },
  { icon: 'help', label: '聯絡客服', description: '問題諮詢與回報', path: '/profile/support' },
]

onMounted(() => {
  loadMemberDetail()
})
</script>

<template>
  <div class="profile-page">
    <!-- Profile Header Card -->
    <div class="profile-header-card">
      <div class="profile-bg-pattern" />
      <div class="profile-header-content">
        <div class="avatar-wrapper">
          <div class="avatar">
            {{ member?.full_name?.charAt(0) || 'M' }}
          </div>
          <div
            class="status-badge"
            :class="getStatusInfo(member?.member_status || '').class"
          >
            {{ getStatusInfo(member?.member_status || '').label }}
          </div>
        </div>
        <h1 class="profile-name">{{ member?.full_name }}</h1>
        <p class="profile-code">{{ member?.member_code }}</p>
        <p v-if="member?.branch_name" class="profile-branch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {{ member?.branch_name }}
        </p>
      </div>
    </div>

    <!-- Quick Stats -->
    <div v-if="memberDetail" class="stats-row">
      <div class="stat-item">
        <span class="stat-value">{{ membershipDuration || '-' }}</span>
        <span class="stat-label">會員年資</span>
      </div>
      <div class="stat-divider" />
      <div class="stat-item">
        <span class="stat-value">{{ member?.activeContract ? '有效' : '無' }}</span>
        <span class="stat-label">合約狀態</span>
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

    <!-- Menu Section -->
    <section class="section">
      <h2 class="section-title">更多功能</h2>
      <div class="menu-list">
        <NuxtLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="menu-item"
        >
          <span class="menu-icon">
            <svg v-if="item.icon === 'history'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <svg v-else-if="item.icon === 'payment'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="1" y="4" width="22" height="16" rx="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <svg v-else-if="item.icon === 'bell'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <svg v-else-if="item.icon === 'help'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <div class="menu-content">
            <span class="menu-label">{{ item.label }}</span>
            <span class="menu-description">{{ item.description }}</span>
          </div>
          <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </NuxtLink>
      </div>
    </section>

    <!-- Logout Button -->
    <button class="logout-btn" @click="handleLogout">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      登出
    </button>

    <!-- App Version -->
    <p class="app-version">Gym Nexus v1.0.0</p>
  </div>
</template>

<style scoped>
.profile-page {
  padding: 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

/* Header Card */
.profile-header-card {
  position: relative;
  padding: 32px 24px;
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
  border-radius: 24px;
  margin-bottom: 16px;
  overflow: hidden;
}

.profile-bg-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.08) 0%, transparent 40%);
}

.profile-header-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.avatar-wrapper {
  position: relative;
  margin-bottom: 16px;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.2);
  border: 3px solid rgba(255, 255, 255, 0.3);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
}

.status-badge {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.status-active {
  background-color: rgba(255, 255, 255, 0.95);
  color: var(--color-primary);
}

.status-expired {
  background-color: rgba(239, 68, 68, 0.9);
  color: white;
}

.status-suspended {
  background-color: rgba(245, 158, 11, 0.9);
  color: white;
}

.status-inactive {
  background-color: rgba(107, 114, 128, 0.9);
  color: white;
}

.profile-name {
  font-size: 24px;
  font-weight: 700;
  color: white;
  margin-bottom: 4px;
}

.profile-code {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  font-family: monospace;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.profile-branch {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

/* Stats Row */
.stats-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 16px 20px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  margin-bottom: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.stat-divider {
  width: 1px;
  height: 32px;
  background-color: var(--color-border);
}

/* Section */
.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.edit-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn:active {
  background-color: var(--color-border);
}

/* Info Card */
.info-card {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
}

.info-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.info-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  text-align: right;
}

.email-value {
  word-break: break-all;
  max-width: 200px;
}

/* Edit Card */
.edit-card {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 20px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.input-group input {
  width: 100%;
  padding: 14px 16px;
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-group input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.input-group input::placeholder {
  color: var(--color-text-tertiary);
}

.edit-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-cancel,
.btn-save {
  flex: 1;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.btn-cancel:active:not(:disabled) {
  background-color: var(--color-border);
}

.btn-save {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-primary);
  border: none;
  color: white;
}

.btn-save:active:not(:disabled) {
  background-color: #059669;
}

.btn-cancel:disabled,
.btn-save:disabled {
  opacity: 0.6;
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
  gap: 8px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* Menu List */
.menu-list {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  text-decoration: none;
  color: var(--color-text);
  transition: background-color 0.2s ease;
}

.menu-item:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.menu-item:active {
  background-color: var(--color-border);
}

.menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: rgba(16, 185, 129, 0.1);
  border-radius: 12px;
  color: var(--color-primary);
}

.menu-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-label {
  font-size: 15px;
  font-weight: 500;
}

.menu-description {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.menu-arrow {
  color: var(--color-text-tertiary);
}

/* Logout */
.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 16px;
  background-color: transparent;
  border: 1px solid var(--color-error);
  border-radius: 14px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-error);
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-bottom: 24px;
}

.logout-btn:active {
  background-color: rgba(239, 68, 68, 0.1);
}

.app-version {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-tertiary);
}
</style>
