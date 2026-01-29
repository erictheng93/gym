<script setup lang="ts">
/**
 * Issue Detail Page
 * View issue details and resolution
 */
import type { Issue } from '../../../composables/useIssues'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { getIssue, getTypeLabel, formatDate, canEdit, updateIssue } = useIssues()

const issueId = computed(() => route.params.id as string)
const issue = ref<Issue | null>(null)
const isLoading = ref(true)
const isEditing = ref(false)
const isSaving = ref(false)

// Edit form
const editForm = reactive({
  title: '',
  content: '',
})

// Load issue
const loadIssue = async () => {
  isLoading.value = true
  try {
    issue.value = await getIssue(issueId.value)
    if (!issue.value) {
      toast.error('找不到此問題')
      router.replace('/profile/issues')
    }
  } finally {
    isLoading.value = false
  }
}

// Start editing
const startEdit = () => {
  if (!issue.value || !canEdit(issue.value)) return
  editForm.title = issue.value.title
  editForm.content = issue.value.content
  isEditing.value = true
}

// Cancel editing
const cancelEdit = () => {
  isEditing.value = false
}

// Save edit
const saveEdit = async () => {
  if (!issue.value) return

  if (!editForm.title.trim()) {
    toast.error('請輸入標題')
    return
  }

  if (!editForm.content.trim()) {
    toast.error('請輸入內容')
    return
  }

  isSaving.value = true
  try {
    const result = await updateIssue(issue.value.id, {
      title: editForm.title.trim(),
      content: editForm.content.trim(),
    })

    if (result.success) {
      toast.success('已更新')
      isEditing.value = false
      await loadIssue()
    } else {
      toast.error(result.message)
    }
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  loadIssue()
})
</script>

<template>
  <div class="issue-detail-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/profile/issues" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">問題詳情</h1>
      <button
        v-if="issue && canEdit(issue) && !isEditing"
        class="edit-btn"
        @click="startEdit"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <div v-else class="header-spacer" />
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner" />
      <p>載入中...</p>
    </div>

    <!-- Issue Content -->
    <template v-else-if="issue">
      <!-- Status Card -->
      <div class="status-card">
        <div class="status-row">
          <span class="status-label">狀態</span>
          <IssueStatusBadge :status="issue.status" />
        </div>
        <div class="status-row">
          <span class="status-label">類型</span>
          <span class="status-value">{{ getTypeLabel(issue.type) }}</span>
        </div>
        <div class="status-row">
          <span class="status-label">提交時間</span>
          <span class="status-value">{{ formatDate(issue.created_at) }}</span>
        </div>
        <div v-if="issue.resolved_at" class="status-row">
          <span class="status-label">解決時間</span>
          <span class="status-value">{{ formatDate(issue.resolved_at) }}</span>
        </div>
        <div v-if="issue.assigned_to_name" class="status-row">
          <span class="status-label">處理人員</span>
          <span class="status-value">{{ issue.assigned_to_name }}</span>
        </div>
      </div>

      <!-- View Mode -->
      <template v-if="!isEditing">
        <!-- Title & Content -->
        <section class="content-section">
          <h2 class="content-title">{{ issue.title }}</h2>
          <p class="content-text">{{ issue.content }}</p>
        </section>

        <!-- Resolution -->
        <section v-if="issue.resolution" class="resolution-section">
          <h3 class="section-title">處理結果</h3>
          <div class="resolution-card">
            <p class="resolution-text">{{ issue.resolution }}</p>
          </div>
        </section>
      </template>

      <!-- Edit Mode -->
      <template v-else>
        <div class="edit-form">
          <div class="form-group">
            <label for="edit-title" class="form-label">標題</label>
            <input
              id="edit-title"
              v-model="editForm.title"
              type="text"
              class="form-input"
              maxlength="100"
            >
          </div>
          <div class="form-group">
            <label for="edit-content" class="form-label">詳細說明</label>
            <textarea
              id="edit-content"
              v-model="editForm.content"
              class="form-textarea"
              rows="6"
              maxlength="2000"
            />
          </div>
          <div class="edit-actions">
            <button class="btn-cancel" :disabled="isSaving" @click="cancelEdit">
              取消
            </button>
            <button class="btn-save" :disabled="isSaving" @click="saveEdit">
              <span v-if="!isSaving">儲存</span>
              <span v-else class="loading-spinner-sm" />
            </button>
          </div>
        </div>
      </template>

      <!-- Note about editing -->
      <p v-if="!canEdit(issue) && !issue.resolution" class="edit-note">
        問題處理中，無法修改內容
      </p>
    </template>
  </div>
</template>

<style scoped>
.issue-detail-page {
  padding: 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--color-text);
  transition: background-color 0.2s;
}

.back-btn:active {
  background-color: var(--color-border);
}

.page-title {
  flex: 1;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.2s;
}

.edit-btn:active {
  background-color: rgba(16, 185, 129, 0.1);
}

.header-spacer {
  width: 36px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--color-text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 4px 0;
  margin-bottom: 20px;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}

.status-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.status-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.status-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.content-section {
  margin-bottom: 24px;
}

.content-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px;
}

.content-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  margin: 0;
}

.resolution-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px;
}

.resolution-card {
  background-color: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
  padding: 16px;
}

.resolution-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  margin: 0;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input,
.form-textarea {
  padding: 14px 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 120px;
}

.edit-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn-cancel,
.btn-save {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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

.loading-spinner-sm {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.edit-note {
  font-size: 13px;
  color: var(--color-text-tertiary);
  text-align: center;
  margin-top: 16px;
}
</style>
