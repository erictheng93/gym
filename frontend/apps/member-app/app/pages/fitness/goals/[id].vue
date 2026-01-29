<script setup lang="ts">
/**
 * Goal Detail Page
 * View and update a fitness goal
 */
import type { Goal } from '../../../composables/useGoals'
import { GOAL_TYPES, GOAL_STATUSES } from '../../../schemas/goal.schema'
import type { GoalStatus } from '../../../schemas/goal.schema'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { getGoal, updateGoal, deleteGoal, calculateProgress } = useGoals()

const goalId = computed(() => route.params.id as string)
const goal = ref<Goal | null>(null)
const isLoading = ref(true)
const isUpdating = ref(false)
const showDeleteConfirm = ref(false)

// Update form
const updateForm = reactive({
  current_value: '',
  notes: '',
})

// Load goal
const loadGoal = async () => {
  isLoading.value = true
  try {
    goal.value = await getGoal(goalId.value)
    if (!goal.value) {
      toast.error('找不到此目標')
      router.replace('/fitness/goals')
    } else {
      // Initialize form
      updateForm.current_value = (goal.value.current_value?.value as number)?.toString() || ''
      updateForm.notes = goal.value.notes || ''
    }
  } finally {
    isLoading.value = false
  }
}

// Update progress
const handleUpdateProgress = async () => {
  if (!goal.value) return

  isUpdating.value = true
  try {
    const currentValue: Record<string, unknown> = {
      ...goal.value.current_value,
    }

    if (updateForm.current_value) {
      currentValue.value = parseFloat(updateForm.current_value)
    }

    const result = await updateGoal(goal.value.id, {
      current_value: currentValue,
      notes: updateForm.notes.trim() || undefined,
    })

    if (result.success) {
      toast.success('已更新進度')
      await loadGoal()
    } else {
      toast.error(result.message)
    }
  } finally {
    isUpdating.value = false
  }
}

// Update status
const handleStatusChange = async (status: GoalStatus) => {
  if (!goal.value) return

  isUpdating.value = true
  try {
    const result = await updateGoal(goal.value.id, { status })

    if (result.success) {
      const label = GOAL_STATUSES[status]
      toast.success(`目標已標記為「${label}」`)
      await loadGoal()
    } else {
      toast.error(result.message)
    }
  } finally {
    isUpdating.value = false
  }
}

// Delete goal
const handleDelete = async () => {
  if (!goal.value) return

  isUpdating.value = true
  try {
    const result = await deleteGoal(goal.value.id)

    if (result.success) {
      toast.success('目標已刪除')
      router.replace('/fitness/goals')
    } else {
      toast.error(result.message)
    }
  } finally {
    isUpdating.value = false
    showDeleteConfirm.value = false
  }
}

const progress = computed(() => goal.value ? calculateProgress(goal.value) : 0)
const goalTypeLabel = computed(() => goal.value ? GOAL_TYPES[goal.value.goal_type] : '')
const targetDescription = computed(() => (goal.value?.target_value?.description as string) || '-')
const targetValue = computed(() => {
  if (!goal.value?.target_value?.value) return null
  const val = goal.value.target_value.value as number
  const unit = (goal.value.target_value?.unit as string) || ''
  return `${val} ${unit}`.trim()
})
const currentValue = computed(() => {
  if (!goal.value?.current_value?.value) return null
  const val = goal.value.current_value.value as number
  const unit = (goal.value.target_value?.unit as string) || ''
  return `${val} ${unit}`.trim()
})

onMounted(() => {
  loadGoal()
})
</script>

<template>
  <div class="goal-detail-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness/goals" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">目標詳情</h1>
      <button
        v-if="goal"
        class="delete-btn"
        @click="showDeleteConfirm = true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner" />
      <p>載入中...</p>
    </div>

    <!-- Goal Content -->
    <template v-else-if="goal">
      <!-- Goal Card -->
      <div class="goal-card">
        <span class="goal-type">{{ goalTypeLabel }}</span>
        <h2 class="goal-target">{{ targetDescription }}</h2>
        <GoalProgressBar
          v-if="goal.status === 'IN_PROGRESS'"
          :progress="progress"
          :height="10"
        />
        <div v-if="targetValue" class="goal-values">
          <div class="value-item">
            <span class="value-label">目標</span>
            <span class="value-text">{{ targetValue }}</span>
          </div>
          <div v-if="currentValue" class="value-item">
            <span class="value-label">目前</span>
            <span class="value-text">{{ currentValue }}</span>
          </div>
        </div>
        <div v-if="goal.target_date" class="goal-date">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          目標日期：{{ goal.target_date }}
        </div>
      </div>

      <!-- Update Progress (only for IN_PROGRESS) -->
      <section v-if="goal.status === 'IN_PROGRESS'" class="section">
        <h3 class="section-title">更新進度</h3>
        <div class="update-form">
          <div class="form-group">
            <label for="current_value">目前數值</label>
            <input
              id="current_value"
              v-model="updateForm.current_value"
              type="number"
              class="form-input"
              inputmode="decimal"
              step="0.1"
              :placeholder="`目前: ${currentValue || '未記錄'}`"
            >
          </div>
          <div class="form-group">
            <label for="notes">備註</label>
            <textarea
              id="notes"
              v-model="updateForm.notes"
              class="form-textarea"
              rows="2"
              placeholder="記錄進展"
            />
          </div>
          <button
            class="update-btn"
            :disabled="isUpdating"
            @click="handleUpdateProgress"
          >
            <span v-if="!isUpdating">更新進度</span>
            <span v-else class="loading-spinner-sm" />
          </button>
        </div>
      </section>

      <!-- Notes -->
      <section v-if="goal.notes" class="section">
        <h3 class="section-title">備註</h3>
        <p class="notes-text">{{ goal.notes }}</p>
      </section>

      <!-- Status Actions -->
      <section v-if="goal.status === 'IN_PROGRESS'" class="section">
        <h3 class="section-title">目標狀態</h3>
        <div class="status-actions">
          <button
            class="status-btn achieved"
            :disabled="isUpdating"
            @click="handleStatusChange('ACHIEVED')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            標記為達成
          </button>
          <button
            class="status-btn abandoned"
            :disabled="isUpdating"
            @click="handleStatusChange('ABANDONED')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            放棄目標
          </button>
        </div>
      </section>

      <!-- Reactivate -->
      <section v-else class="section">
        <button
          class="reactivate-btn"
          :disabled="isUpdating"
          @click="handleStatusChange('IN_PROGRESS')"
        >
          重新啟動目標
        </button>
      </section>
    </template>

    <!-- Delete Confirmation -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="modal-overlay" @click="showDeleteConfirm = false">
        <div class="modal-content" @click.stop>
          <h3>確認刪除</h3>
          <p>確定要刪除這個目標嗎？此操作無法復原。</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showDeleteConfirm = false">取消</button>
            <button class="btn-delete" :disabled="isUpdating" @click="handleDelete">
              <span v-if="!isUpdating">刪除</span>
              <span v-else class="loading-spinner-sm" />
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.goal-detail-page {
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

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: none;
  border: none;
  color: var(--color-error);
  cursor: pointer;
  transition: background-color 0.2s;
}

.delete-btn:active {
  background-color: rgba(239, 68, 68, 0.1);
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

.goal-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
}

.goal-type {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary);
  background-color: rgba(16, 185, 129, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
  margin-bottom: 12px;
}

.goal-target {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 16px;
}

.goal-values {
  display: flex;
  gap: 24px;
  margin-top: 16px;
}

.value-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.value-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.value-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.goal-date {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px;
}

.update-form {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px;
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text);
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.update-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  margin-top: 8px;
}

.update-btn:active:not(:disabled) {
  background-color: #059669;
}

.update-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.notes-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  margin: 0;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
}

.status-actions {
  display: flex;
  gap: 12px;
}

.status-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.status-btn.achieved {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #16a34a;
}

.status-btn.achieved:active:not(:disabled) {
  background-color: rgba(34, 197, 94, 0.2);
}

.status-btn.abandoned {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.status-btn.abandoned:active:not(:disabled) {
  background-color: var(--color-border);
}

.status-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reactivate-btn {
  width: 100%;
  padding: 14px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-primary);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
}

.reactivate-btn:active:not(:disabled) {
  background-color: rgba(16, 185, 129, 0.05);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
}

.modal-content {
  background-color: var(--color-surface);
  border-radius: 16px;
  padding: 24px;
  max-width: 320px;
  width: 100%;
}

.modal-content h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 8px;
}

.modal-content p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 20px;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel,
.btn-delete {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.btn-delete {
  background-color: var(--color-error);
  border: none;
  color: white;
}

.btn-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
