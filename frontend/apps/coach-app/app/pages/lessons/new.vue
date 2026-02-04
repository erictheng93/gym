<template>
  <div class="form-page">
    <!-- Header -->
    <div class="form-header">
      <button class="back-button" @click="router.back()">
        <svg class="back-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span>返回</span>
      </button>
      <h1 class="page-title">新增教案</h1>
      <div class="header-spacer" />
    </div>

    <!-- Form Content -->
    <div class="form-content">
      <form @submit.prevent="handleSubmit">
        <!-- Basic Info Section -->
        <div class="form-section">
          <h2 class="section-title">基本資訊</h2>
          <div class="section-card">
            <div class="form-group">
              <label class="form-label">
                標題 <span class="required">*</span>
              </label>
              <input
                v-model="form.title"
                type="text"
                required
                class="form-input"
                placeholder="例如：上肢力量訓練"
              />
            </div>

            <div class="form-group">
              <label class="form-label">課程時長（分鐘）</label>
              <div class="duration-picker">
                <button
                  type="button"
                  class="duration-btn"
                  :class="{ active: form.duration_minutes === 30 }"
                  @click="form.duration_minutes = 30"
                >
                  30
                </button>
                <button
                  type="button"
                  class="duration-btn"
                  :class="{ active: form.duration_minutes === 45 }"
                  @click="form.duration_minutes = 45"
                >
                  45
                </button>
                <button
                  type="button"
                  class="duration-btn"
                  :class="{ active: form.duration_minutes === 60 }"
                  @click="form.duration_minutes = 60"
                >
                  60
                </button>
                <button
                  type="button"
                  class="duration-btn"
                  :class="{ active: form.duration_minutes === 90 }"
                  @click="form.duration_minutes = 90"
                >
                  90
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">難度</label>
              <div class="difficulty-picker">
                <button
                  type="button"
                  class="difficulty-btn beginner"
                  :class="{ active: form.difficulty === 'BEGINNER' }"
                  @click="form.difficulty = 'BEGINNER'"
                >
                  <span class="difficulty-dot" />
                  初階
                </button>
                <button
                  type="button"
                  class="difficulty-btn intermediate"
                  :class="{ active: form.difficulty === 'INTERMEDIATE' }"
                  @click="form.difficulty = 'INTERMEDIATE'"
                >
                  <span class="difficulty-dot" />
                  中階
                </button>
                <button
                  type="button"
                  class="difficulty-btn advanced"
                  :class="{ active: form.difficulty === 'ADVANCED' }"
                  @click="form.difficulty = 'ADVANCED'"
                >
                  <span class="difficulty-dot" />
                  進階
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Template Section -->
        <div class="form-section">
          <h2 class="section-title">範本設定</h2>
          <div class="section-card">
            <div class="toggle-row">
              <div class="toggle-info">
                <span class="toggle-label">儲存為範本</span>
                <span class="toggle-desc">可被其他教練複製使用</span>
              </div>
              <button
                type="button"
                class="toggle-switch"
                :class="{ active: form.is_template }"
                @click="form.is_template = !form.is_template"
              >
                <span class="toggle-thumb" />
              </button>
            </div>

            <div v-if="form.is_template" class="form-group mt-4">
              <label class="form-label">範本分類</label>
              <input
                v-model="form.template_category"
                type="text"
                class="form-input"
                placeholder="例如：力量訓練、有氧、體態"
              />
            </div>
          </div>
        </div>

        <!-- Objectives Section -->
        <div class="form-section">
          <h2 class="section-title">訓練目標</h2>
          <div class="section-card">
            <div class="list-items">
              <div
                v-for="(obj, idx) in form.objectives"
                :key="idx"
                class="list-item"
              >
                <input
                  v-model="form.objectives[idx]"
                  type="text"
                  class="list-input"
                  placeholder="輸入目標"
                />
                <button
                  type="button"
                  class="list-delete"
                  @click="form.objectives.splice(idx, 1)"
                >
                  <svg class="delete-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <button type="button" class="add-item-btn" @click="form.objectives.push('')">
              <svg class="add-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              新增目標
            </button>
          </div>
        </div>

        <!-- Exercises Section -->
        <div class="form-section">
          <h2 class="section-title">訓練內容</h2>

          <div class="exercise-section">
            <div class="exercise-header warmup">
              <span class="exercise-icon">🔥</span>
              <span class="exercise-title">熱身動作</span>
            </div>
            <div class="section-card">
              <ExerciseList v-model="form.warmup_exercises" />
            </div>
          </div>

          <div class="exercise-section">
            <div class="exercise-header main">
              <span class="exercise-icon">💪</span>
              <span class="exercise-title">主要訓練</span>
            </div>
            <div class="section-card">
              <ExerciseList v-model="form.main_exercises" />
            </div>
          </div>

          <div class="exercise-section">
            <div class="exercise-header cooldown">
              <span class="exercise-icon">🧘</span>
              <span class="exercise-title">收操/伸展</span>
            </div>
            <div class="section-card">
              <ExerciseList v-model="form.cooldown_exercises" />
            </div>
          </div>
        </div>

        <!-- Notes Section -->
        <div class="form-section">
          <h2 class="section-title">備註</h2>
          <div class="section-card">
            <textarea
              v-model="form.notes"
              class="form-textarea"
              rows="4"
              placeholder="其他注意事項..."
            />
          </div>
        </div>

        <!-- Submit Button -->
        <div class="submit-section">
          <button
            type="submit"
            class="submit-btn"
            :disabled="submitting || !form.title"
          >
            <span v-if="submitting" class="btn-spinner" />
            {{ submitting ? '儲存中...' : '儲存教案' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Exercise } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { success, error: showError } = useToast()
const { createPlan } = useLessonPlans()

const submitting = ref(false)
const form = ref({
  title: '',
  is_template: false,
  template_category: '',
  difficulty: '',
  duration_minutes: 60,
  objectives: [''] as string[],
  warmup_exercises: [] as Exercise[],
  main_exercises: [] as Exercise[],
  cooldown_exercises: [] as Exercise[],
  notes: '',
})

const handleSubmit = async () => {
  submitting.value = true

  const data = {
    title: form.value.title,
    is_template: form.value.is_template,
    template_category: form.value.is_template ? form.value.template_category : undefined,
    difficulty: form.value.difficulty || undefined,
    duration_minutes: form.value.duration_minutes,
    objectives: form.value.objectives.filter(o => o.trim()),
    warmup_exercises: form.value.warmup_exercises,
    main_exercises: form.value.main_exercises,
    cooldown_exercises: form.value.cooldown_exercises,
    notes: form.value.notes || undefined,
  }

  const result = await createPlan(data)

  if (result.success) {
    success('教案已建立')
    router.push('/lessons')
  } else {
    showError(result.message || '建立教案失敗')
  }

  submitting.value = false
}
</script>

<style scoped>
.form-page {
  min-height: 100vh;
  background: var(--bg-primary);
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

/* Header */
.form-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-bottom: 0.5px solid var(--border-color);
}

.back-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--apple-blue);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.back-icon {
  width: 20px;
  height: 20px;
}

.page-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-spacer {
  width: 60px;
}

/* Form Content */
.form-content {
  padding: 16px;
}

/* Section */
.form-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-left: 4px;
  margin-bottom: 10px;
}

.section-card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

/* Form Group */
.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.required {
  color: var(--apple-red);
}

.form-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--apple-blue);
}

.form-input::placeholder {
  color: var(--text-tertiary);
}

/* Duration Picker */
.duration-picker {
  display: flex;
  gap: 10px;
}

.duration-btn {
  flex: 1;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  background: var(--bg-secondary);
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.duration-btn.active {
  background: rgba(0, 122, 255, 0.12);
  border-color: var(--apple-blue);
  color: var(--apple-blue);
}

/* Difficulty Picker */
.difficulty-picker {
  display: flex;
  gap: 10px;
}

.difficulty-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  background: var(--bg-secondary);
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.difficulty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.difficulty-btn.beginner.active {
  background: rgba(52, 199, 89, 0.12);
  border-color: var(--apple-green);
  color: var(--apple-green);
}

.difficulty-btn.intermediate.active {
  background: rgba(255, 149, 0, 0.12);
  border-color: var(--apple-orange);
  color: var(--apple-orange);
}

.difficulty-btn.advanced.active {
  background: rgba(255, 59, 48, 0.12);
  border-color: var(--apple-red);
  color: var(--apple-red);
}

/* Toggle Row */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.toggle-desc {
  font-size: 13px;
  color: var(--text-tertiary);
}

.toggle-switch {
  position: relative;
  width: 52px;
  height: 32px;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.toggle-switch.active {
  background: var(--apple-green);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 28px;
  height: 28px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s var(--ease-spring);
}

.toggle-switch.active .toggle-thumb {
  transform: translateX(20px);
}

.mt-4 {
  margin-top: 16px;
}

/* List Items */
.list-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.list-item {
  display: flex;
  gap: 10px;
}

.list-input {
  flex: 1;
  padding: 12px 14px;
  font-size: 15px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
}

.list-input:focus {
  outline: none;
  border-color: var(--apple-blue);
}

.list-delete {
  padding: 12px;
  background: rgba(255, 59, 48, 0.1);
  border: none;
  border-radius: 10px;
  color: var(--apple-red);
  cursor: pointer;
  transition: background 0.2s;
}

.list-delete:active {
  background: rgba(255, 59, 48, 0.2);
}

.delete-icon {
  width: 18px;
  height: 18px;
}

.add-item-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  border: 2px dashed var(--border-color);
  border-radius: 10px;
  color: var(--apple-blue);
  cursor: pointer;
  transition: all 0.2s;
}

.add-item-btn:hover {
  border-color: var(--apple-blue);
  background: rgba(0, 122, 255, 0.05);
}

.add-icon {
  width: 18px;
  height: 18px;
}

/* Exercise Section */
.exercise-section {
  margin-bottom: 16px;
}

.exercise-section:last-child {
  margin-bottom: 0;
}

.exercise-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px 12px 0 0;
  margin-bottom: -1px;
}

.exercise-header.warmup {
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.15), rgba(255, 159, 10, 0.1));
}

.exercise-header.main {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.15), rgba(90, 200, 250, 0.1));
}

.exercise-header.cooldown {
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.1));
}

.exercise-icon {
  font-size: 18px;
}

.exercise-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Form Textarea */
.form-textarea {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  resize: none;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--apple-blue);
}

/* Submit Section */
.submit-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-top: 0.5px solid var(--border-color);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  padding: 16px;
  font-size: 17px;
  font-weight: 600;
  background: var(--apple-blue);
  border: none;
  border-radius: 14px;
  color: white;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn:not(:disabled):active {
  transform: scale(0.98);
}

.btn-spinner {
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

/* Dark Mode */
:root.dark .section-card {
  background: var(--card-bg);
}

/* Responsive */
@media (min-width: 768px) {
  .form-content {
    max-width: 600px;
    margin: 0 auto;
  }
}
</style>
