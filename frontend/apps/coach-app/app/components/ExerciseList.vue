<template>
  <div class="space-y-2">
    <div
      v-for="(exercise, idx) in modelValue"
      :key="idx"
      class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
    >
      <div class="flex justify-between items-start mb-2">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          動作 {{ idx + 1 }}
        </span>
        <button
          type="button"
          class="p-1 text-red-600 hover:bg-red-50 rounded"
          @click="removeExercise(idx)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="space-y-2">
        <!-- Exercise Name -->
        <input
          v-model="exercise.name"
          type="text"
          placeholder="動作名稱"
          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
        />

        <!-- Sets & Reps Row -->
        <div class="flex gap-2">
          <div class="flex-1">
            <input
              v-model.number="exercise.sets"
              type="number"
              min="1"
              placeholder="組數"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div class="flex-1">
            <input
              v-model="exercise.reps"
              type="text"
              placeholder="次數 (如: 10-12)"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <!-- Weight & Rest Row -->
        <div class="flex gap-2">
          <div class="flex-1">
            <input
              v-model="exercise.weight"
              type="text"
              placeholder="重量 (如: 20kg)"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div class="flex-1">
            <input
              v-model="exercise.rest_seconds"
              type="text"
              placeholder="休息秒數"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <!-- Notes -->
        <input
          v-model="exercise.notes"
          type="text"
          placeholder="備註 (選填)"
          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
        />
      </div>
    </div>

    <!-- Add Exercise Button -->
    <button
      type="button"
      class="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg hover:border-blue-500 hover:text-blue-500 transition-colors"
      @click="addExercise"
    >
      + 新增動作
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Exercise } from '~/types/coach'

const props = defineProps<{
  modelValue: Exercise[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Exercise[]]
}>()

const addExercise = () => {
  const newExercise: Exercise = {
    name: '',
    sets: undefined,
    reps: '',
    weight: '',
    rest_seconds: undefined,
    notes: '',
  }
  emit('update:modelValue', [...props.modelValue, newExercise])
}

const removeExercise = (idx: number) => {
  const updated = [...props.modelValue]
  updated.splice(idx, 1)
  emit('update:modelValue', updated)
}
</script>
