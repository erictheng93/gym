<script setup lang="ts">
/**
 * Workout Card Component
 * Displays a workout log summary
 */
import type { Workout } from '../composables/useWorkouts'

const props = defineProps<{
  workout: Workout
}>()

const emit = defineEmits<{
  click: [workout: Workout]
}>()

const { formatDate, formatDuration, formatCalories } = useWorkouts()

const exerciseCount = computed(() => {
  return props.workout.exercises?.length || 0
})

const handleClick = () => {
  emit('click', props.workout)
}
</script>

<template>
  <div class="workout-card" @click="handleClick">
    <div class="workout-header">
      <span class="workout-date">{{ formatDate(workout.date) }}</span>
      <svg
        class="arrow-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
    <div class="workout-stats">
      <div v-if="workout.duration" class="stat-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{{ formatDuration(workout.duration) }}</span>
      </div>
      <div v-if="workout.calories" class="stat-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2c.5 7-1 12-4 14 1-2 1.5-4 1-7-1 3-5 6-5 10 0 3 3 5 8 5s8-2 8-5c0-3-2-5-3-7-.5 1-1 2-2 2.5 1-3 0-8-3-12.5z" />
        </svg>
        <span>{{ formatCalories(workout.calories) }}</span>
      </div>
      <div v-if="exerciseCount > 0" class="stat-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
        </svg>
        <span>{{ exerciseCount }} 項運動</span>
      </div>
    </div>
    <p v-if="workout.notes" class="workout-notes">{{ workout.notes }}</p>
  </div>
</template>

<style scoped>
.workout-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.workout-card:active {
  background-color: var(--color-border);
}

.workout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.workout-date {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.arrow-icon {
  color: var(--color-text-tertiary);
}

.workout-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-item svg {
  color: var(--color-primary);
}

.workout-notes {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
