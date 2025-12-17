<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  validate: (route) => {
    const id = route.params.employeeId as string
    // UUID v4 格式驗證
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  }
})

const route = useRoute()
const router = useRouter()
const { getEmployee, deleteEmployee } = useEmployees()

const employee = ref<Awaited<ReturnType<typeof getEmployee>> | null>(null)
const isLoading = ref(true)
const isDeleting = ref(false)
const showDeleteModal = ref(false)

const employeeId = computed(() => route.params.employeeId as string)

const loadEmployee = async () => {
  isLoading.value = true
  try {
    employee.value = await getEmployee(employeeId.value)
  } catch (error) {
    console.error('Failed to load employee:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(loadEmployee)

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return '—'
  return `NT$ ${amount.toLocaleString()}`
}

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    ACTIVE: { label: '在職', class: 'badge-success' },
    RESIGNED: { label: '離職', class: 'badge-error' },
    LEAVE: { label: '留停', class: 'badge-warning' }
  }
  return map[status] || { label: status, class: '' }
}

const getEmploymentTypeBadge = (type: string) => {
  const map: Record<string, { label: string; class: string }> = {
    FULL_TIME: { label: '正職', class: 'badge-info' },
    PART_TIME: { label: '兼職', class: 'badge-secondary' },
    FREELANCE: { label: '外包', class: 'badge-secondary' }
  }
  return map[type] || { label: type, class: '' }
}

const handleDelete = async () => {
  if (!employee.value) return
  isDeleting.value = true
  try {
    await deleteEmployee(employee.value.id)
    router.push('/employees')
  } catch (error) {
    console.error('Failed to delete employee:', error)
  } finally {
    isDeleting.value = false
    showDeleteModal.value = false
  }
}
</script>

<template>
  <div class="employee-detail-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">載入中...</p>
    </div>

    <template v-else-if="employee">
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          返回
        </button>
        <div class="header-actions">
          <NuxtLink :to="`/employees/${employee.id}/edit`" class="btn btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              <path d="m15 5 4 4"/>
            </svg>
            編輯
          </NuxtLink>
          <button class="btn btn-ghost btn-danger" @click="showDeleteModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
            刪除
          </button>
        </div>
      </header>

      <!-- Profile Hero -->
      <section class="profile-hero glass-card">
        <div class="profile-avatar-large">
          {{ employee.full_name[0] }}
        </div>
        <div class="profile-info">
          <div class="profile-header-row">
            <h1 class="text-display">{{ employee.full_name }}</h1>
            <span :class="['badge badge-large', getStatusBadge(employee.employment_status).class]">
              {{ getStatusBadge(employee.employment_status).label }}
            </span>
          </div>
          <div class="profile-meta">
            <span v-if="employee.employee_code" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>
              </svg>
              {{ employee.employee_code }}
            </span>
            <span v-if="employee.job_title" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
              {{ employee.job_title.name }}
            </span>
            <span v-if="employee.branch" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              {{ employee.branch.name }}
            </span>
            <span v-if="employee.date_created" class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
              </svg>
              {{ formatDate(employee.date_created) }} 加入
            </span>
          </div>
        </div>
      </section>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Employment Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
            任職資訊
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>任職狀態</label>
              <span :class="['badge', getStatusBadge(employee.employment_status).class]">
                {{ getStatusBadge(employee.employment_status).label }}
              </span>
            </div>
            <div class="info-item">
              <label>聘用類型</label>
              <span :class="['badge', getEmploymentTypeBadge(employee.employment_type).class]">
                {{ getEmploymentTypeBadge(employee.employment_type).label }}
              </span>
            </div>
            <div class="info-item">
              <label>所屬分店</label>
              <span>{{ employee.branch?.name || '—' }}</span>
            </div>
            <div class="info-item">
              <label>職位</label>
              <span>{{ employee.job_title?.name || '—' }}</span>
            </div>
          </div>
        </section>

        <!-- Salary Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            薪資資訊
          </h3>
          <div class="info-grid">
            <div class="info-item info-item-full">
              <label>基本薪資</label>
              <span class="salary-amount">{{ formatCurrency(employee.basic_salary) }}</span>
            </div>
          </div>
        </section>

        <!-- Record Info -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
            </svg>
            紀錄資訊
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>建立日期</label>
              <span>{{ formatDate(employee.date_created) }}</span>
            </div>
            <div class="info-item">
              <label>最後更新</label>
              <span>{{ formatDate(employee.date_updated) }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- Delete Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
        <div class="modal-content glass-card">
          <div class="modal-icon modal-icon-danger">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </div>
          <h3 class="modal-title">確定要刪除嗎？</h3>
          <p class="modal-desc text-secondary">
            刪除後將無法恢復員工「{{ employee?.full_name }}」的資料。
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showDeleteModal = false">取消</button>
            <button class="btn btn-danger" :disabled="isDeleting" @click="handleDelete">
              {{ isDeleting ? '刪除中...' : '確定刪除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.employee-detail-page {
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
  background: linear-gradient(135deg, #34c759, #30d158);
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

.info-item-full {
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

.salary-amount {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-accent);
}

/* Badge variants */
.badge-info {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.badge-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
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

.modal-actions .btn-danger {
  background: var(--color-error);
  color: white;
}

.modal-actions .btn-danger:hover {
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
