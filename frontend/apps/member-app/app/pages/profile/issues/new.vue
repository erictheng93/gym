<script setup lang="ts">
/**
 * New Issue Page
 * Submit a new issue report
 */
import { createIssueSchema, ISSUE_TYPES } from '../../../schemas/issue.schema'
import type { IssueType } from '../../../schemas/issue.schema'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const toast = useToast()
const { createIssue } = useIssues()

// Form state
const form = reactive({
  type: '' as IssueType | '',
  title: '',
  content: '',
})
const isSubmitting = ref(false)
const errors = reactive<Record<string, string>>({})

// Issue types for selection
const issueTypes = Object.entries(ISSUE_TYPES).map(([value, label]) => ({
  value: value as IssueType,
  label,
}))

// Validation
const validateForm = () => {
  // Clear errors
  Object.keys(errors).forEach(key => delete errors[key])

  const result = createIssueSchema.safeParse({
    type: form.type || undefined,
    title: form.title,
    content: form.content,
  })

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0])
      errors[field] = issue.message
    }
    return false
  }

  return true
}

// Submit handler
const handleSubmit = async () => {
  if (!validateForm()) {
    const firstError = Object.values(errors)[0]
    toast.error(firstError || '請檢查輸入')
    return
  }

  isSubmitting.value = true

  try {
    const result = await createIssue({
      type: form.type as IssueType,
      title: form.title,
      content: form.content,
    })

    if (result.success) {
      toast.success('問題已提交')
      router.replace('/profile/issues')
    } else {
      toast.error(result.message)
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="new-issue-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/profile/issues" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">提交問題</h1>
      <div class="header-spacer" />
    </div>

    <!-- Form -->
    <form class="issue-form" @submit.prevent="handleSubmit">
      <!-- Type Selection -->
      <div class="form-group">
        <label class="form-label">問題類型</label>
        <div class="type-options">
          <button
            v-for="issueType in issueTypes"
            :key="issueType.value"
            type="button"
            class="type-option"
            :class="{ active: form.type === issueType.value }"
            @click="form.type = issueType.value"
          >
            <svg
              v-if="issueType.value === 'EQUIPMENT'"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <svg
              v-else-if="issueType.value === 'SERVICE'"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <svg
              v-else-if="issueType.value === 'SUGGESTION'"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="9" y1="18" x2="15" y2="18" />
              <line x1="10" y1="22" x2="14" y2="22" />
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
            </svg>
            <svg
              v-else
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{{ issueType.label }}</span>
          </button>
        </div>
        <span v-if="errors.type" class="error-text">{{ errors.type }}</span>
      </div>

      <!-- Title -->
      <div class="form-group">
        <label for="title" class="form-label">標題</label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          class="form-input"
          placeholder="簡短描述您的問題"
          maxlength="100"
        >
        <div class="input-hint">
          <span v-if="errors.title" class="error-text">{{ errors.title }}</span>
          <span class="char-count">{{ form.title.length }}/100</span>
        </div>
      </div>

      <!-- Content -->
      <div class="form-group">
        <label for="content" class="form-label">詳細說明</label>
        <textarea
          id="content"
          v-model="form.content"
          class="form-textarea"
          placeholder="請詳細描述您遇到的問題、發生時間地點等資訊"
          rows="6"
          maxlength="2000"
        />
        <div class="input-hint">
          <span v-if="errors.content" class="error-text">{{ errors.content }}</span>
          <span class="char-count">{{ form.content.length }}/2000</span>
        </div>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="submit-btn"
        :disabled="isSubmitting"
      >
        <span v-if="!isSubmitting">提交問題</span>
        <span v-else class="loading-spinner" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.new-issue-page {
  padding: 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
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

.header-spacer {
  width: 36px;
}

.issue-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.type-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.type-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background-color: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.type-option.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background-color: rgba(16, 185, 129, 0.05);
}

.type-option svg {
  opacity: 0.6;
}

.type-option.active svg {
  opacity: 1;
  color: var(--color-primary);
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

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 120px;
}

.input-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.char-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.error-text {
  font-size: 12px;
  color: var(--color-error);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 8px;
}

.submit-btn:active:not(:disabled) {
  background-color: #059669;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
