<script setup lang="ts">
/**
 * Workout Detail Page
 * View and edit a workout log
 */
import type { Workout } from '../../../composables/useWorkouts'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { getWorkout, deleteWorkout, formatDate, formatDuration, formatCalories } = useWorkouts()

const workoutId = computed(() => route.params.id as string)
const workout = ref<Workout | null>(null)
const isLoading = ref(true)
const isDeleting = ref(false)
const showDeleteConfirm = ref(false)

// Load workout
const loadWorkout = async () => {
  isLoading.value = true
  try {
    workout.value = await getWorkout(workoutId.value)
    if (!workout.value) {
      toast.error('找不到此運動紀錄')
      router.replace('/fitness/workouts')
    }
  } finally {
    isLoading.value = false
  }
}

// Delete workout
const handleDelete = async () => {
  if (!workout.value) return

  isDeleting.value = true
  try {
    const result = await deleteWorkout(workout.value.id)

    if (result.success) {
      toast.success('紀錄已刪除')
      router.replace('/fitness/workouts')
    } else {
      toast.error(result.message)
    }
  } finally {
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}

onMounted(() => {
  loadWorkout()
})
</script>

<template>
  <div class="workout-detail-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness/workouts" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">運動詳情</h1>
      <button
        v-if="workout"
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

    <!-- Workout Content -->
    <template v-else-if="workout">
      <!-- Summary Card -->
      <div class="summary-card">
        <h2 class="workout-date">{{ formatDate(workout.date) }}</h2>
        <div class="stats-row">
          <div v-if="workout.duration" class="stat-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div class="stat-content">
              <span class="stat-value">{{ formatDuration(workout.duration) }}</span>
              <span class="stat-label">運動時長</span>
            </div>
          </div>
          <div v-if="workout.calories" class="stat-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2c.5 7-1 12-4 14 1-2 1.5-4 1-7-1 3-5 6-5 10 0 3 3 5 8 5s8-2 8-5c0-3-2-5-3-7-.5 1-1 2-2 2.5 1-3 0-8-3-12.5z" />
            </svg>
            <div class="stat-content">
              <span class="stat-value">{{ formatCalories(workout.calories) }}</span>
              <span class="stat-label">消耗熱量</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Exercises -->
      <section v-if="workout.exercises && workout.exercises.length > 0" class="section">
        <h3 class="section-title">運動項目</h3>
        <div class="exercises-list">
          <div
            v-for="(exercise, index) in workout.exercises"
            :key="index"
            class="exercise-item"
          >
            <div class="exercise-header">
              <span class="exercise-number">#{{ index + 1 }}</span>
              <span class="exercise-name">{{ exercise.name }}</span>
            </div>
            <div class="exercise-details">
              <span v-if="exercise.sets" class="detail">{{ exercise.sets }} 組</span>
              <span v-if="exercise.reps" class="detail">{{ exercise.reps }} 次</span>
              <span v-if="exercise.weight" class="detail">{{ exercise.weight }} kg</span>
              <span v-if="exercise.duration" class="detail">{{ exercise.duration }} 分鐘</span>
              <span v-if="exercise.distance" class="detail">{{ exercise.distance }} km</span>
            </div>
            <p v-if="exercise.notes" class="exercise-notes">{{ exercise.notes }}</p>
          </div>
        </div>
      </section>

      <!-- Notes -->
      <section v-if="workout.notes" class="section">
        <h3 class="section-title">備註</h3>
        <p class="notes-text">{{ workout.notes }}</p>
      </section>

      <!-- Edit Button -->
      <NuxtLink :to="`/fitness/workouts/new?edit=${workout.id}`" class="edit-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        編輯紀錄
      </NuxtLink>
    </template>

    <!-- Delete Confirmation -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="modal-overlay" @click="showDeleteConfirm = false">
        <div class="modal-content" @click.stop>
          <h3>確認刪除</h3>
          <p>確定要刪除這筆運動紀錄嗎？此操作無法復原。</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showDeleteConfirm = false">取消</button>
            <button class="btn-delete" :disabled="isDeleting" @click="handleDelete">
              <span v-if="!isDeleting">刪除</span>
              <span v-else class="loading-spinner-sm" />
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.workout-detail-page {
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

.summary-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
}

.workout-date {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 16px;
}

.stats-row {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-item svg {
  color: var(--color-primary);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.stat-label {
  font-size: 12px;
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

.exercises-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.exercise-item {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 16px;
}

.exercise-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.exercise-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  background-color: rgba(16, 185, 129, 0.1);
  padding: 4px 8px;
  border-radius: 10px;
}

.exercise-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.exercise-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.detail {
  font-size: 13px;
  color: var(--color-text-secondary);
  padding: 4px 10px;
  background-color: var(--color-background);
  border-radius: 8px;
}

.exercise-notes {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 10px 0 0;
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

.edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-primary);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
}

.edit-btn:active {
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
