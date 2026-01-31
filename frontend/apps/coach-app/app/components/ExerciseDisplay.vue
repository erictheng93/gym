<template>
  <div class="space-y-2">
    <div
      v-for="(exercise, idx) in exercises"
      :key="idx"
      class="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
    >
      <span class="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center text-sm font-medium">
        {{ idx + 1 }}
      </span>
      <div class="flex-1">
        <p class="font-medium text-gray-900 dark:text-white">{{ exercise.name }}</p>
        <div class="flex flex-wrap gap-2 mt-1 text-sm text-gray-500">
          <span v-if="exercise.sets">{{ exercise.sets }}組</span>
          <span v-if="exercise.reps">{{ exercise.reps }}次</span>
          <span v-if="exercise.weight">{{ exercise.weight }}</span>
          <span v-if="exercise.rest_seconds">休息{{ exercise.rest_seconds }}秒</span>
        </div>
        <p v-if="exercise.notes" class="mt-1 text-sm text-gray-400 italic">
          {{ exercise.notes }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Exercise } from '~/types/coach'

defineProps<{
  exercises: Exercise[]
}>()
</script>
