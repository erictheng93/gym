<script setup lang="ts">
/**
 * New Workout Page
 * Record a new workout
 */
import type { Exercise } from '../../../schemas/workout.schema'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const toast = useToast()
const { createWorkout } = useWorkouts()

// Form state
const form = reactive({
  date: new Date().toISOString().split('T')[0],
  duration: null as number | null,
  calories: null as number | null,
  notes: '',
})
const exercises = ref<Exercise[]>([])
const isSubmitting = ref(false)

// Add new exercise
const addExercise = () => {
  exercises.value.push({
    name: '',
    sets: undefined,
    reps: undefined,
    weight: undefined,
    duration: undefined,
    distance: undefined,
    notes: undefined,
  })
}

// Remove exercise
const removeExercise = (index: number) => {
  exercises.value.splice(index, 1)
}

// Update exercise
const updateExercise = (index: number, value: Exercise) => {
  exercises.value[index] = value
}

// Submit handler
const handleSubmit = async () => {
  // Validation
  if (!form.duration && exercises.value.length === 0) {
    toast.error('請輸入運動時長或至少一項運動項目')
    return
  }

  // Filter out empty exercises
  const validExercises = exercises.value.filter(e => e.name.trim())

  isSubmitting.value = true

  try {
    const result = await createWorkout({
      date: form.date,
      duration: form.duration,
      calories: form.calories,
      exercises: validExercises.length > 0 ? validExercises : undefined,
      notes: form.notes.trim() || undefined,
    })

    if (result.success) {
      toast.success('運動已記錄')
      router.replace('/fitness/workouts')
    } else {
      toast.error(result.message)
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="new-workout-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness/workouts" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">記錄運動</h1>
      <div class="header-spacer" />
    </div>

    <!-- Form -->
    <form class="workout-form" @submit.prevent="handleSubmit">
      <!-- Date -->
      <div class="form-group">
        <label for="date" class="form-label">日期</label>
        <input
          id="date"
          v-model="form.date"
          type="date"
          class="form-input"
          :max="new Date().toISOString().split('T')[0]"
        >
      </div>

      <!-- Duration & Calories Row -->
      <div class="form-row">
        <div class="form-group">
          <label for="duration" class="form-label">
            時長
            <span class="unit">(分鐘)</span>
          </label>
          <input
            id="duration"
            v-model.number="form.duration"
            type="number"
            class="form-input"
            inputmode="numeric"
            min="1"
            max="480"
            placeholder="例如：60"
          >
        </div>
        <div class="form-group">
          <label for="calories" class="form-label">
            消耗
            <span class="unit">(大卡)</span>
          </label>
          <input
            id="calories"
            v-model.number="form.calories"
            type="number"
            class="form-input"
            inputmode="numeric"
            min="0"
            max="5000"
            placeholder="例如：300"
          >
        </div>
      </div>

      <!-- Exercises Section -->
      <div class="exercises-section">
        <div class="section-header">
          <h2 class="section-title">運動項目</h2>
          <button type="button" class="add-exercise-btn" @click="addExercise">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增
          </button>
        </div>

        <div v-if="exercises.length > 0" class="exercises-list">
          <ExerciseForm
            v-for="(exercise, index) in exercises"
            :key="index"
            :model-value="exercise"
            :index="index"
            @update:model-value="updateExercise(index, $event)"
            @remove="removeExercise(index)"
          />
        </div>

        <p v-else class="exercises-hint">
          點擊「新增」按鈕添加運動項目，如深蹲、跑步等
        </p>
      </div>

      <!-- Notes -->
      <div class="form-group">
        <label for="notes" class="form-label">備註（選填）</label>
        <textarea
          id="notes"
          v-model="form.notes"
          class="form-textarea"
          placeholder="今天的感覺、特別的事項..."
          rows="3"
          maxlength="1000"
        />
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="submit-btn"
        :disabled="isSubmitting"
      >
        <span v-if="!isSubmitting">儲存紀錄</span>
        <span v-else class="loading-spinner" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.new-workout-page {
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

.workout-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.unit {
  font-size: 12px;
  font-weight: 400;
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

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.exercises-section {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.add-exercise-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  cursor: pointer;
}

.add-exercise-btn:active {
  background-color: #059669;
}

.exercises-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exercises-hint {
  font-size: 13px;
  color: var(--color-text-tertiary);
  text-align: center;
  padding: 16px;
  margin: 0;
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
