<script setup lang="ts">
import { MESSAGES, PAGES, STATUS, LABELS } from '~/constants'
import { validateUUIDParam } from '~/utils/validation'

definePageMeta({
  middleware: 'auth',
  validate: validateUUIDParam('memberId')
})

const route = useRoute()
const router = useRouter()
const { getMember, deleteMember } = useMembers()
const { fetchContracts, contracts: memberContracts } = useContracts()

const member = ref<Awaited<ReturnType<typeof getMember>> | null>(null)
const isLoading = ref(true)
const isDeleting = ref(false)
const showDeleteModal = ref(false)
const loadError = ref(false)

const memberId = computed(() => route.params.memberId as string)

const loadMember = async () => {
  isLoading.value = true
  loadError.value = false
  try {
    member.value = await getMember(memberId.value)
    if (!member.value) {
      loadError.value = true
      useToast().error(MESSAGES.ERRORS.MEMBER_LOAD_FAILED)
      return
    }
    await fetchContracts({ memberId: memberId.value })
  } catch (error) {
    console.error('Failed to load member:', error)
    loadError.value = true
    useToast().error(MESSAGES.ERRORS.MEMBER_LOAD_FAILED)
  } finally {
    isLoading.value = false
  }
}

onMounted(loadMember)

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const getStatusBadge = (status: string) => {
  const normalizedStatus = status?.toUpperCase()
  const map: Record<string, { label: string; class: string }> = {
    ACTIVE: { label: STATUS.MEMBER.ACTIVE, class: 'badge-success' },
    EXPIRED: { label: STATUS.MEMBER.EXPIRED, class: 'badge-error' },
    SUSPENDED: { label: STATUS.MEMBER.PAUSED, class: 'badge-warning' },
    BANNED: { label: STATUS.MEMBER.SUSPENDED, class: 'badge-error' }
  }
  return map[normalizedStatus] || { label: status, class: '' }
}

const getContractStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    DRAFT: { label: STATUS.CONTRACT.DRAFT, class: '' },
    ACTIVE: { label: STATUS.CONTRACT.ACTIVE, class: 'badge-success' },
    PAUSED: { label: STATUS.CONTRACT.PAUSED, class: 'badge-warning' },
    EXPIRED: { label: STATUS.CONTRACT.EXPIRED, class: 'badge-error' },
    TERMINATED: { label: STATUS.CONTRACT.TERMINATED, class: 'badge-error' }
  }
  return map[status] || { label: status, class: '' }
}

const getGenderLabel = (gender: string | null) => {
  const map: Record<string, string> = {
    M: LABELS.GENDER.MALE,
    F: LABELS.GENDER.FEMALE,
    O: LABELS.GENDER.OTHER,
    MALE: LABELS.GENDER.MALE,
    FEMALE: LABELS.GENDER.FEMALE,
    OTHER: LABELS.GENDER.OTHER
  }
  return gender ? map[gender] || gender : '—'
}

const handleDelete = async () => {
  if (!member.value) return
  isDeleting.value = true
  try {
    await deleteMember(member.value.id)
    useToast().success(MESSAGES.SUCCESS.MEMBER_DELETED)
    router.push('/members')
  } catch (error) {
    console.error('Failed to delete member:', error)
    useToast().error(MESSAGES.ERRORS.MEMBER_DELETE_FAILED)
  } finally {
    isDeleting.value = false
    showDeleteModal.value = false
  }
}
</script>

<template>
  <div class="member-detail-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="error-container">
      <div class="error-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </div>
      <h2 class="error-title">無法載入會員資料</h2>
      <p class="error-desc text-secondary">會員可能不存在或您沒有權限查看此會員</p>
      <div class="error-actions">
        <button class="btn btn-secondary" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <button class="btn btn-primary" @click="loadMember">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          重試
        </button>
      </div>
    </div>

    <template v-else-if="member">
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <div class="header-actions">
          <NuxtLink :to="`/members/${member.id}/edit`" class="btn btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
            編輯
          </NuxtLink>
          <button class="btn btn-ghost btn-danger" @click="showDeleteModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            刪除
          </button>
        </div>
      </header>

      <!-- Profile Hero -->
      <section class="profile-hero glass-card">
        <div class="profile-avatar-large">
          {{ member.fullName?.[0] || '?' }}
        </div>
        <div class="profile-info">
          <div class="profile-header-row">
            <h1 class="text-display">{{ member.fullName }}</h1>
            <span :class="['badge badge-large', getStatusBadge(member.status).class]">
              {{ getStatusBadge(member.status).label }}
            </span>
          </div>
          <div class="profile-meta">
            <span class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />
              </svg>
              {{ member.memberCode }}
            </span>
            <span v-if="member.branchId" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              所屬分店
            </span>
            <span v-if="member.joinDate" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
              </svg>
              {{ formatDate(member.joinDate) }} 加入
            </span>
          </div>
        </div>
      </section>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Contact Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            {{ MESSAGES.COMMON.CONTACT_INFO }}
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>電話</label>
              <span>{{ member.phone || '—' }}</span>
            </div>
            <div class="info-item">
              <label>Email</label>
              <span>{{ member.email || '—' }}</span>
            </div>
            <div class="info-item">
              <label>緊急聯絡人</label>
              <span>{{ member.emergencyContact || '—' }}</span>
            </div>
            <div class="info-item">
              <label>緊急聯絡電話</label>
              <span>{{ member.emergencyPhone || '—' }}</span>
            </div>
          </div>
        </section>

        <!-- Personal Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            {{ MESSAGES.COMMON.PERSONAL_INFO }}
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>性別</label>
              <span>{{ getGenderLabel(member.gender) }}</span>
            </div>
            <div class="info-item">
              <label>生日</label>
              <span>{{ formatDate(member.birthday) }}</span>
            </div>
            <div class="info-item">
              <label>身高</label>
              <span>{{ member.height ? `${member.height} cm` : '—' }}</span>
            </div>
            <div class="info-item">
              <label>業務</label>
              <span>{{ member.salesPersonId ? '已指派' : '—' }}</span>
            </div>
          </div>
        </section>

        <!-- Tags -->
        <section v-if="member.tags && member.tags.length > 0" class="detail-card card tags-card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" />
            </svg>
            {{ MESSAGES.FORM.TAGS }}
          </h3>
          <div class="tags-list">
            <span v-for="tag in member.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </section>
      </div>

      <!-- Contracts Section -->
      <section class="contracts-section">
        <div class="section-header">
          <h2 class="text-title-1">{{ PAGES.MEMBERS.CONTRACT_HISTORY }}</h2>
          <NuxtLink :to="`/contracts/new?member=${member.id}`" class="btn btn-primary btn-small">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            {{ PAGES.CONTRACTS.ADD_CONTRACT }}
          </NuxtLink>
        </div>

        <div v-if="memberContracts.length === 0" class="empty-contracts card">
          <div class="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
          </div>
          <p class="text-secondary">{{ PAGES.MEMBERS.NO_CONTRACTS }}</p>
        </div>

        <div v-else class="contracts-grid">
          <NuxtLink
            v-for="contract in memberContracts"
            :key="contract.id"
            :to="`/contracts/${contract.id}`"
            class="contract-card card card-interactive"
          >
            <div class="contract-header">
              <code class="contract-no">{{ contract.contractNo }}</code>
              <span :class="['badge', getContractStatusBadge(contract.contractStatus || '').class]">
                {{ getContractStatusBadge(contract.contractStatus || '').label }}
              </span>
            </div>
            <h4 class="plan-name">{{ contract.plan?.name || '—' }}</h4>
            <div class="contract-dates">
              <span>{{ formatDate(contract.startDate) }}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
              <span>{{ formatDate(contract.endDate) }}</span>
            </div>
            <div class="contract-amount">
              NT$ {{ contract.totalAmount?.toLocaleString() || 0 }}
            </div>
          </NuxtLink>
        </div>
      </section>
    </template>

    <!-- Delete Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-danger">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </div>
          <h3 class="modal-title">{{ MESSAGES.CONFIRM.DELETE_TITLE }}</h3>
          <p class="modal-desc text-secondary">
            {{ PAGES.MEMBERS.DELETE_WARNING }}「{{ member?.fullName }}」
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showDeleteModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button class="btn btn-danger" :disabled="isDeleting" @click="handleDelete">
              {{ isDeleting ? MESSAGES.ACTIONS.DELETING : MESSAGES.CONFIRM.CONFIRM_DELETE }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.member-detail-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
}

/* Error State */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
  min-height: 400px;
}

.error-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: rgba(239, 68, 68, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-error);
  margin-bottom: var(--space-lg);
}

.error-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-sm);
}

.error-desc {
  font-size: 15px;
  margin-bottom: var(--space-xl);
  max-width: 400px;
}

.error-actions {
  display: flex;
  gap: var(--space-md);
}

.loading-spinner-large {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
  animation: fadeDown 0.5s var(--ease-out);
}

@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-10px); }
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.back-btn:hover {
  background: var(--color-accent-light);
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn-danger {
  color: var(--color-error);
}

.btn-danger:hover {
  background: rgba(255, 59, 48, 0.1);
}

/* Profile Hero */
.profile-hero {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-2xl);
  margin-bottom: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.profile-avatar-large {
  width: 100px;
  height: 100px;
  border-radius: var(--radius-2xl);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: 600;
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
}

.profile-header-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.badge-large {
  font-size: 14px;
  padding: 6px 14px;
}

.profile-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--color-text-secondary);
  font-size: 15px;
}

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.detail-card {
  padding: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.detail-card:nth-child(1) { animation-delay: 0.15s; }
.detail-card:nth-child(2) { animation-delay: 0.2s; }
.detail-card:nth-child(3) { animation-delay: 0.25s; }

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-lg);
}

.card-title svg {
  color: var(--color-accent);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.info-item label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.info-item span {
  font-size: 15px;
  color: var(--color-text-primary);
}

/* Tags */
.tags-card {
  grid-column: 1 / -1;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.tag {
  padding: 6px 14px;
  background: var(--color-accent-light);
  color: var(--color-accent);
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
}

/* Contracts Section */
.contracts-section {
  animation: fadeUp 0.6s var(--ease-out) 0.3s backwards;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.contracts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-md);
}

.contract-card {
  padding: var(--space-lg);
  text-decoration: none;
  color: inherit;
}

.contract-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.contract-no {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.plan-name {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: var(--space-sm);
}

.contract-dates {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-md);
}

.contract-amount {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-accent);
}

.empty-contracts {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2xl);
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-md);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s var(--ease-out);
}

@keyframes fadeIn {
  from { opacity: 0; }
}

.modal-content {
  width: 100%;
  max-width: 400px;
  padding: var(--space-xl);
  margin: var(--space-lg);
  text-align: center;
  animation: modalIn 0.3s var(--ease-spring);
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95); }
}

.modal-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

.modal-icon-danger {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: var(--space-sm);
}

.modal-desc {
  font-size: 15px;
  margin-bottom: var(--space-xl);
}

.modal-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
}

.btn-danger {
  background: var(--color-error);
  color: white;
}

.btn-danger:hover {
  background: #e6352a;
}

/* Responsive */
@media (max-width: 768px) {
  .profile-hero {
    flex-direction: column;
    text-align: center;
    padding: var(--space-xl);
  }

  .profile-header-row {
    flex-direction: column;
  }

  .profile-meta {
    justify-content: center;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
  }
}
</style>
