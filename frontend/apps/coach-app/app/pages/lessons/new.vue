<template>
  <div class="p-4">
    <!-- Back Button -->
    <button
      class="flex items-center text-gray-600 dark:text-gray-400 mb-4"
      @click="router.back()"
    >
      <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      返回
    </button>

    <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
      新增教案
    </h1>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- Title -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          標題 <span class="text-red-500">*</span>
        </label>
        <input
          v-model="form.title"
          type="text"
          required
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          placeholder="例如：上肢力量訓練"
        />
      </div>

      <!-- Is Template -->
      <div class="flex items-center">
        <input
          id="is_template"
          v-model="form.is_template"
          type="checkbox"
          class="w-4 h-4 text-blue-600 border-gray-300 rounded"
        />
        <label for="is_template" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
          儲存為範本（可被其他教練複製使用）
        </label>
      </div>

      <!-- Template Category (if is_template) -->
      <div v-if="form.is_template">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          範本分類
        </label>
        <input
          v-model="form.template_category"
          type="text"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          placeholder="例如：力量訓練、有氧、體態"
        />
      </div>

      <!-- Difficulty -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          難度
        </label>
        <select
          v-model="form.difficulty"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        >
          <option value="">選擇難度</option>
          <option value="BEGINNER">初階</option>
          <option value="INTERMEDIATE">中階</option>
          <option value="ADVANCED">進階</option>
        </select>
      </div>

      <!-- Duration -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          課程時長（分鐘）
        </label>
        <input
          v-model.number="form.duration_minutes"
          type="number"
          min="15"
          max="180"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- Objectives -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          訓練目標
        </label>
        <div class="space-y-2">
          <div
            v-for="(obj, idx) in form.objectives"
            :key="idx"
            class="flex gap-2"
          >
            <input
              v-model="form.objectives[idx]"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              placeholder="輸入目標"
            />
            <button
              type="button"
              class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              @click="form.objectives.splice(idx, 1)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="mt-2 text-sm text-blue-600"
          @click="form.objectives.push('')"
        >
          + 新增目標
        </button>
      </div>

      <!-- Warmup Exercises -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          熱身動作
        </label>
        <ExerciseList v-model="form.warmup_exercises" />
      </div>

      <!-- Main Exercises -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          主要訓練
        </label>
        <ExerciseList v-model="form.main_exercises" />
      </div>

      <!-- Cooldown Exercises -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          收操/伸展
        </label>
        <ExerciseList v-model="form.cooldown_exercises" />
      </div>

      <!-- Notes -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          備註
        </label>
        <textarea
          v-model="form.notes"
          rows="3"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- Submit -->
      <div class="pt-4">
        <button
          type="submit"
          class="w-full py-3 bg-blue-600 text-white font-medium rounded-lg disabled:opacity-50"
          :disabled="submitting || !form.title"
        >
          {{ submitting ? '儲存中...' : '儲存教案' }}
        </button>
      </div>
    </form>
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
