<script setup lang="ts">
/**
 * Exercise Form Component
 * Form for adding/editing individual exercise items
 */
import type { Exercise } from '../schemas/workout.schema'
import { COMMON_EXERCISES } from '../schemas/workout.schema'

const props = withDefaults(defineProps<{
  modelValue?: Exercise
  index?: number
}>(), {
  index: 0,
})

const emit = defineEmits<{
  'update:modelValue': [value: Exercise]
  remove: []
}>()

const exercise = reactive<Exercise>({
  name: props.modelValue?.name || '',
  sets: props.modelValue?.sets,
  reps: props.modelValue?.reps,
  weight: props.modelValue?.weight,
  duration: props.modelValue?.duration,
  distance: props.modelValue?.distance,
  notes: props.modelValue?.notes,
})

// Watch for changes and emit
watch(exercise, (newVal) => {
  emit('update:modelValue', { ...newVal })
}, { deep: true })

// Exercise type detection
const isCardio = computed(() => {
  const cardioNames = ['跑步', '飛輪', '橢圓', '划船', '游泳', '走路']
  return cardioNames.some(name => exercise.name.includes(name))
})

const showQuickSelect = ref(false)

const selectExercise = (name: string) => {
  exercise.name = name
  showQuickSelect.value = false
}

const handleRemove = () => {
  emit('remove')
}
</script>

<template>
  <div class="exercise-form">
    <div class="form-header">
      <span class="exercise-number">#{{ index + 1 }}</span>
      <button type="button" class="remove-btn" @click="handleRemove">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Exercise Name -->
    <div class="input-group">
      <label>運動名稱</label>
      <div class="name-input-wrapper">
        <input
          v-model="exercise.name"
          type="text"
          placeholder="例如：深蹲、跑步機"
          @focus="showQuickSelect = true"
        >
        <button
          v-if="!showQuickSelect"
          type="button"
          class="toggle-btn"
          @click="showQuickSelect = true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Quick Select -->
    <div v-if="showQuickSelect" class="quick-select">
      <button
        v-for="ex in COMMON_EXERCISES"
        :key="ex.name"
        type="button"
        class="quick-option"
        :class="{ active: exercise.name === ex.name }"
        @click="selectExercise(ex.name)"
      >
        {{ ex.name }}
      </button>
    </div>

    <!-- Strength Training Fields -->
    <div v-if="!isCardio" class="field-row">
      <div class="input-group">
        <label>組數</label>
        <input
          v-model.number="exercise.sets"
          type="number"
          inputmode="numeric"
          placeholder="3"
          min="1"
          max="20"
        >
      </div>
      <div class="input-group">
        <label>次數</label>
        <input
          v-model.number="exercise.reps"
          type="number"
          inputmode="numeric"
          placeholder="12"
          min="1"
          max="100"
        >
      </div>
      <div class="input-group">
        <label>重量 (kg)</label>
        <input
          v-model.number="exercise.weight"
          type="number"
          inputmode="decimal"
          placeholder="20"
          min="0"
          step="0.5"
        >
      </div>
    </div>

    <!-- Cardio Fields -->
    <div v-else class="field-row">
      <div class="input-group">
        <label>時長 (分鐘)</label>
        <input
          v-model.number="exercise.duration"
          type="number"
          inputmode="numeric"
          placeholder="30"
          min="1"
          max="300"
        >
      </div>
      <div class="input-group">
        <label>距離 (km)</label>
        <input
          v-model.number="exercise.distance"
          type="number"
          inputmode="decimal"
          placeholder="5"
          min="0"
          step="0.1"
        >
      </div>
    </div>

    <!-- Notes -->
    <div class="input-group">
      <label>備註</label>
      <input
        v-model="exercise.notes"
        type="text"
        placeholder="選填"
      >
    </div>
  </div>
</template>

<style scoped>
.exercise-form {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.exercise-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  background-color: rgba(16, 185, 129, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all 0.2s;
}

.remove-btn:active {
  background-color: var(--color-border);
  color: var(--color-error);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.input-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.input-group input {
  padding: 10px 12px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text);
}

.input-group input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.name-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.name-input-wrapper input {
  flex: 1;
  padding-right: 36px;
}

.toggle-btn {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.quick-select {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.quick-option {
  padding: 6px 12px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.quick-option.active,
.quick-option:active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.field-row {
  display: flex;
  gap: 10px;
}

.field-row .input-group {
  flex: 1;
}
</style>
