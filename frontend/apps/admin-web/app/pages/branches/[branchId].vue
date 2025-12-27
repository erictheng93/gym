<script setup lang="ts">
import { MESSAGES, PAGES, STATUS, LABELS } from '~/constants'
import type { Branch, Employee } from '~/types/directus'

definePageMeta({
  middleware: 'auth',
  validate: (route) => {
    const id = route.params.branchId as string
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  }
})

const route = useRoute()
const router = useRouter()
const { fetchBranch, fetchBranchEmployees, updateBranch, deleteBranch } = useBranches()

const branch = ref<Branch | null>(null)
const employees = ref<Employee[]>([])
const isLoading = ref(true)
const isDeleting = ref(false)
const showDeleteModal = ref(false)
const showArchiveModal = ref(false)

const branchId = computed(() => route.params.branchId as string)

const loadBranch = async () => {
  isLoading.value = true
  try {
    branch.value = await fetchBranch(branchId.value)
    employees.value = await fetchBranchEmployees(branchId.value)
  } catch (error) {
    console.error('Failed to load branch:', error)
    useToast().error(MESSAGES.ERRORS.BRANCH_LOAD_FAILED)
  } finally {
    isLoading.value = false
  }
}

onMounted(loadBranch)

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const branchTypeLabel = (type: string) => {
  return type === 'HEADQUARTER' ? LABELS.BRANCH_TYPE.HEADQUARTER : LABELS.BRANCH_TYPE.BRANCH
}

const handleToggleStatus = async () => {
  if (!branch.value) return
  try {
    const newStatus = branch.value.status === 'active' ? 'archived' : 'active'
    await updateBranch(branch.value.id, { status: newStatus })
    branch.value.status = newStatus
    useToast().success(newStatus === 'active' ? MESSAGES.SUCCESS.BRANCH_ACTIVATED : MESSAGES.SUCCESS.BRANCH_ARCHIVED)
    showArchiveModal.value = false
  } catch (error) {
    console.error('Failed to update branch status:', error)
    useToast().error(MESSAGES.ERRORS.BRANCH_UPDATE_STATUS_FAILED)
  }
}

const handleDelete = async () => {
  if (!branch.value) return
  isDeleting.value = true
  try {
    await deleteBranch(branch.value.id)
    useToast().success(MESSAGES.SUCCESS.BRANCH_DELETED)
    router.push('/branches')
  } catch (error) {
    console.error('Failed to delete branch:', error)
    useToast().error(MESSAGES.ERRORS.BRANCH_DELETE_FAILED)
  } finally {
    isDeleting.value = false
    showDeleteModal.value = false
  }
}
</script>

<template>
  <div class="branch-detail-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <template v-else-if="branch">
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          {{ MESSAGES.ACTIONS.BACK }}
        </button>
        <div class="header-actions">
          <NuxtLink :to="`/branches/${branch.id}/edit`" class="btn btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              <path d="m15 5 4 4"/>
            </svg>
            {{ MESSAGES.FORM.EDIT }}
          </NuxtLink>
          <button
            class="btn btn-ghost"
            :class="branch.status === 'active' ? 'btn-warning' : 'btn-success'"
            @click="showArchiveModal = true"
          >
            <svg v-if="branch.status === 'active'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {{ branch.status === 'active' ? PAGES.BRANCHES.ARCHIVE_BRANCH : PAGES.BRANCHES.ACTIVATE_BRANCH }}
          </button>
          <button class="btn btn-ghost btn-danger" @click="showDeleteModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
            {{ MESSAGES.FORM.DELETE }}
          </button>
        </div>
      </header>

      <!-- Branch Hero -->
      <section class="branch-hero glass-card">
        <div class="branch-icon-large" :class="branch.type === 'HEADQUARTER' ? 'hq' : 'branch'">
          <svg v-if="branch.type === 'HEADQUARTER'" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div class="branch-info">
          <div class="branch-header-row">
            <h1 class="text-display">{{ branch.name }}</h1>
            <div class="branch-badges">
              <span class="badge badge-large" :class="branch.type === 'HEADQUARTER' ? 'badge-hq' : 'badge-branch'">
                {{ branchTypeLabel(branch.type) }}
              </span>
              <span v-if="branch.status === 'archived'" class="badge badge-large badge-archived">
                {{ STATUS.DISABLED }}
              </span>
              <span v-else class="badge badge-large badge-success">
                {{ STATUS.OPERATING }}
              </span>
            </div>
          </div>
          <div class="branch-meta">
            <span v-if="branch.address" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {{ branch.address }}
            </span>
            <span v-if="branch.phone" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {{ branch.phone }}
            </span>
          </div>
        </div>
      </section>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Basic Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            {{ PAGES.BRANCHES.BASIC_INFO }}
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>{{ PAGES.BRANCHES.BRANCH_NAME }}</label>
              <span>{{ branch.name }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.BRANCHES.BRANCH_TYPE }}</label>
              <span>{{ branchTypeLabel(branch.type) }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.BRANCHES.STATUS }}</label>
              <span :class="branch.status === 'active' ? 'text-success' : 'text-secondary'">
                {{ branch.status === 'active' ? STATUS.OPERATING : STATUS.DISABLED }}
              </span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.BRANCHES.TAX_ID }}</label>
              <span>{{ branch.tax_id || '—' }}</span>
            </div>
          </div>
        </section>

        <!-- Contact Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            {{ PAGES.BRANCHES.CONTACT_INFO }}
          </h3>
          <div class="info-grid">
            <div class="info-item full-width">
              <label>{{ PAGES.BRANCHES.ADDRESS }}</label>
              <span>{{ branch.address || '—' }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.BRANCHES.PHONE }}</label>
              <span>{{ branch.phone || '—' }}</span>
            </div>
          </div>
        </section>

        <!-- System Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            系統資訊
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>{{ PAGES.BRANCHES.CREATED_AT }}</label>
              <span>{{ formatDate(branch.date_created) }}</span>
            </div>
            <div class="info-item">
              <label>{{ PAGES.BRANCHES.UPDATED_AT }}</label>
              <span>{{ formatDate(branch.date_updated) }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Employees Section -->
      <section class="employees-section">
        <div class="section-header">
          <h2 class="text-title-1">
            {{ PAGES.BRANCHES.EMPLOYEES }}
            <span class="employee-count">({{ employees.length }})</span>
          </h2>
          <NuxtLink to="/hr/employees/new" class="btn btn-primary btn-small">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/><path d="M12 5v14"/>
            </svg>
            {{ PAGES.EMPLOYEES.ADD_EMPLOYEE }}
          </NuxtLink>
        </div>

        <div v-if="employees.length === 0" class="empty-employees card">
          <div class="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p class="text-secondary">{{ PAGES.BRANCHES.NO_EMPLOYEES }}</p>
        </div>

        <div v-else class="employees-grid">
          <NuxtLink
            v-for="employee in employees"
            :key="employee.id"
            :to="`/hr/employees/${employee.id}`"
            class="employee-card card card-interactive"
          >
            <div class="employee-avatar">
              {{ employee.full_name[0] }}
            </div>
            <div class="employee-info">
              <h4 class="employee-name">{{ employee.full_name }}</h4>
              <span class="employee-title">{{ employee.job_title?.name || '—' }}</span>
            </div>
            <svg class="card-arrow" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </NuxtLink>
        </div>
      </section>
    </template>

    <!-- Not Found -->
    <div v-else class="not-found card">
      <h2>{{ PAGES.BRANCHES.ERROR_NOT_FOUND }}</h2>
      <NuxtLink to="/branches" class="btn btn-primary">{{ MESSAGES.ACTIONS.BACK }}</NuxtLink>
    </div>

    <!-- Archive Modal -->
    <Teleport to="body">
      <div v-if="showArchiveModal" class="modal-overlay" @click.self="showArchiveModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon" :class="branch?.status === 'active' ? 'modal-icon-warning' : 'modal-icon-success'">
            <svg v-if="branch?.status === 'active'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h3 class="modal-title">
            {{ branch?.status === 'active' ? PAGES.BRANCHES.ARCHIVE_BRANCH : PAGES.BRANCHES.ACTIVATE_BRANCH }}
          </h3>
          <p class="modal-desc text-secondary">
            {{ branch?.status === 'active' ? PAGES.BRANCHES.CONFIRM_ARCHIVE : `確定要啟用「${branch?.name}」嗎？` }}
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showArchiveModal = false">{{ MESSAGES.FORM.CANCEL }}</button>
            <button
              class="btn"
              :class="branch?.status === 'active' ? 'btn-warning' : 'btn-success'"
              @click="handleToggleStatus"
            >
              {{ MESSAGES.ACTIONS.CONFIRM }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-danger">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </div>
          <h3 class="modal-title">{{ PAGES.BRANCHES.DELETE_BRANCH }}</h3>
          <p class="modal-desc text-secondary">{{ PAGES.BRANCHES.CONFIRM_DELETE }}</p>
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
.branch-detail-page {
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
  flex-wrap: wrap;
}

.btn-warning {
  color: #ff9500;
}

.btn-warning:hover {
  background: rgba(255, 149, 0, 0.1);
}

.btn-success {
  color: var(--color-success);
}

.btn-success:hover {
  background: rgba(52, 199, 89, 0.1);
}

.btn-danger {
  color: var(--color-error);
}

.btn-danger:hover {
  background: rgba(255, 59, 48, 0.1);
}

/* Branch Hero */
.branch-hero {
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

.branch-icon-large {
  width: 100px;
  height: 100px;
  border-radius: var(--radius-2xl);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.branch-icon-large.hq {
  background: linear-gradient(135deg, #ff9500, #ff5e3a);
}

.branch-icon-large.branch {
  background: linear-gradient(135deg, #0071e3, #00c7be);
}

.branch-info {
  flex: 1;
}

.branch-header-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
  flex-wrap: wrap;
}

.branch-badges {
  display: flex;
  gap: var(--space-sm);
}

.badge-large {
  font-size: 14px;
  padding: 6px 14px;
}

.badge-hq {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.badge-branch {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-accent);
}

.badge-archived {
  background: rgba(142, 142, 147, 0.1);
  color: var(--color-text-tertiary);
}

.branch-meta {
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

.info-item.full-width {
  grid-column: 1 / -1;
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

.text-success {
  color: var(--color-success) !important;
}

/* Employees Section */
.employees-section {
  animation: fadeUp 0.6s var(--ease-out) 0.3s backwards;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.employee-count {
  font-weight: 400;
  color: var(--color-text-secondary);
}

.employees-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-md);
}

.employee-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  text-decoration: none;
  color: inherit;
}

.employee-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #5856d6, #af52de);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  flex-shrink: 0;
}

.employee-info {
  flex: 1;
  min-width: 0;
}

.employee-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.employee-title {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.card-arrow {
  color: var(--color-text-quaternary);
  transition: transform var(--duration-fast) var(--ease-out);
}

.employee-card:hover .card-arrow {
  transform: translateX(4px);
  color: var(--color-accent);
}

.empty-employees {
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

/* Not Found */
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-3xl);
  text-align: center;
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

.modal-icon-warning {
  background: rgba(255, 149, 0, 0.15);
  color: #ff9500;
}

.modal-icon-success {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
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

.modal-actions .btn-warning {
  background: #ff9500;
  color: white;
}

.modal-actions .btn-warning:hover {
  background: #e68600;
}

.modal-actions .btn-success {
  background: var(--color-success);
  color: white;
}

.modal-actions .btn-success:hover {
  background: #2fb855;
}

.modal-actions .btn-danger {
  background: var(--color-error);
  color: white;
}

.modal-actions .btn-danger:hover {
  background: #e6352a;
}

/* Responsive */
@media (max-width: 768px) {
  .branch-hero {
    flex-direction: column;
    text-align: center;
    padding: var(--space-xl);
  }

  .branch-header-row {
    flex-direction: column;
  }

  .branch-meta {
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

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }
}
</style>
