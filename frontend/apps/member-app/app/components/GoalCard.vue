<script setup lang="ts">
/**
 * Goal Card Component
 * Displays a fitness goal with progress
 */
import type { Goal } from '../composables/useGoals'
import { GOAL_TYPES, GOAL_STATUSES } from '../schemas/goal.schema'

const props = defineProps<{
  goal: Goal
}>()

const emit = defineEmits<{
  click: [goal: Goal]
}>()

const { calculateProgress } = useGoals()

const progress = computed(() => calculateProgress(props.goal))

const goalTypeLabel = computed(() => GOAL_TYPES[props.goal.goal_type] || props.goal.goal_type)
const statusLabel = computed(() => GOAL_STATUSES[props.goal.status] || props.goal.status)

const statusColor = computed(() => {
  switch (props.goal.status) {
    case 'ACHIEVED': return 'success'
    case 'ABANDONED': return 'muted'
    default: return 'primary'
  }
})

const targetDescription = computed(() => {
  const target = props.goal.target_value
  return (target?.description as string) || '-'
})

const handleClick = () => {
  emit('click', props.goal)
}
</script>

<template>
  <div class="goal-card" @click="handleClick">
    <div class="goal-header">
      <span class="goal-type">{{ goalTypeLabel }}</span>
      <span class="goal-status" :class="`status-${statusColor}`">
        {{ statusLabel }}
      </span>
    </div>
    <h3 class="goal-target">{{ targetDescription }}</h3>
    <GoalProgressBar
      v-if="goal.status === 'IN_PROGRESS'"
      :progress="progress"
      :color="statusColor"
    />
    <div class="goal-footer">
      <span v-if="goal.target_date" class="goal-date">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        目標日期：{{ goal.target_date }}
      </span>
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
  </div>
</template>

<style scoped>
.goal-card {
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

.goal-card:active {
  background-color: var(--color-border);
}

.goal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.goal-type {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary);
  background-color: rgba(16, 185, 129, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
}

.goal-status {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 10px;
}

.status-primary {
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.status-success {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-muted {
  background-color: var(--color-border);
  color: var(--color-text-secondary);
}

.goal-target {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  line-height: 1.4;
}

.goal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.goal-date {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.arrow-icon {
  color: var(--color-text-tertiary);
}
</style>
