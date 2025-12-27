<script setup lang="ts">
/**
 * 職位管理頁面
 *
 * 管理職位與權限設定
 */
import { PAGES, MESSAGES } from '~/constants'
import type { JobTitle } from '~/types/directus'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { jobTitles, isLoading, fetchJobTitles, deleteJobTitle } = useJobTitles()

// Modal state
const showDeleteModal = ref(false)
const selectedJobTitle = ref<JobTitle | null>(null)
const isDeleting = ref(false)

// Load job titles
onMounted(async () => {
  await fetchJobTitles()
})

// Handle edit
const handleEdit = (jobTitle: JobTitle) => {
  router.push(`/hr/job-titles/${jobTitle.id}/edit`)
}

// Handle delete confirm
const confirmDelete = (jobTitle: JobTitle) => {
  selectedJobTitle.value = jobTitle
  showDeleteModal.value = true
}

// Handle delete
const handleDelete = async () => {
  if (!selectedJobTitle.value) return

  isDeleting.value = true
  try {
    await deleteJobTitle(selectedJobTitle.value.id)
    useToast().success(MESSAGES.SUCCESS.JOB_TITLE_DELETED)
    showDeleteModal.value = false
    selectedJobTitle.value = null
    await fetchJobTitles()
  } catch (error) {
    console.error('Failed to delete job title:', error)
    useToast().error(MESSAGES.ERRORS.JOB_TITLE_DELETE_FAILED)
  } finally {
    isDeleting.value = false
  }
}

// Get permission count
const getPermissionCount = (jobTitle: JobTitle) => {
  if (!jobTitle.permissions_config || typeof jobTitle.permissions_config !== 'object') {
    return 0
  }
  let count = 0
  const permissions = jobTitle.permissions_config as Record<string, Record<string, boolean>>
  Object.values(permissions).forEach(module => {
    if (module && typeof module === 'object') {
      Object.values(module).forEach(value => {
        if (value === true) count++
      })
    }
  })
  return count
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="職位管理"
      description="管理職位與權限設定"
    >
      <template #actions>
        <NuxtLink to="/hr/job-titles/new" class="btn btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"/><path d="M12 5v14"/>
          </svg>
          新增職位
        </NuxtLink>
      </template>
    </PageHeader>

    <!-- Content -->
    <div class="page-content">
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>載入中...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="jobTitles.length === 0" class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        <h3>尚無職位</h3>
        <p>建立您的第一個職位以開始管理員工權限</p>
        <NuxtLink to="/hr/job-titles/new" class="btn btn-primary">
          新增職位
        </NuxtLink>
      </div>

      <!-- Job Titles Grid -->
      <div v-else class="job-titles-grid">
        <div
          v-for="jobTitle in jobTitles"
          :key="jobTitle.id"
          class="job-title-card glass-card"
        >
          <div class="card-header">
            <h3>{{ jobTitle.name }}</h3>
            <div class="card-actions">
              <button
                class="icon-btn"
                title="編輯"
                @click="handleEdit(jobTitle)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
                </svg>
              </button>
              <button
                class="icon-btn icon-btn--danger"
                title="刪除"
                @click="confirmDelete(jobTitle)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="card-body">
            <div class="permission-summary">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>{{ getPermissionCount(jobTitle) }} 個權限</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3>刪除職位</h3>
              <button class="modal-close" @click="showDeleteModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
                </svg>
              </button>
            </div>

            <div class="modal-body">
              <div class="warning-message">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
                </svg>
                <p>確定要刪除職位 <strong>{{ selectedJobTitle?.name }}</strong> 嗎？此操作無法復原。</p>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showDeleteModal = false">
                取消
              </button>
              <button class="btn btn-danger" :disabled="isDeleting" @click="handleDelete">
                <svg v-if="isDeleting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {{ isDeleting ? '刪除中...' : '確認刪除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </PageContainer>
</template>

<style scoped>
.job-titles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-lg);
}

.job-title-card {
  padding: var(--space-xl);
  transition: all var(--duration-normal) var(--ease-out);
}

.job-title-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-lg);
}

.card-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.card-actions {
  display: flex;
  gap: var(--space-sm);
}

.icon-btn {
  padding: var(--space-sm);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) var(--ease-out);
}

.icon-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-accent);
}

.icon-btn--danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.card-body {
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.permission-summary {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--color-text-secondary);
  font-size: 14px;
}

.permission-summary svg {
  color: var(--color-accent);
}

.warning-message {
  text-align: center;
  padding: var(--space-xl);
}

.warning-message svg {
  color: var(--color-warning);
  margin-bottom: var(--space-lg);
}

.warning-message p {
  margin: 0;
  color: var(--color-text-secondary);
}

.warning-message strong {
  color: var(--color-text);
}

@media (max-width: 768px) {
  .job-titles-grid {
    grid-template-columns: 1fr;
  }
}
</style>
