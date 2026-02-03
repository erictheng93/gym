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

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <!-- Not Found -->
    <div v-else-if="!plan" class="py-12 text-center text-gray-500">
      找不到教案
    </div>

    <!-- Plan Detail -->
    <template v-else>
      <!-- Header -->
      <div class="flex justify-between items-start mb-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">
            {{ plan.title }}
          </h1>
          <div class="flex items-center gap-2 mt-1">
            <span
              v-if="plan.difficulty"
              class="text-xs px-2 py-0.5 rounded-full"
              :class="getDifficultyClass(plan.difficulty)"
            >
              {{ getDifficultyText(plan.difficulty) }}
            </span>
            <span v-if="plan.duration_minutes" class="text-xs text-gray-500">
              {{ plan.duration_minutes }}分鐘
            </span>
            <span v-if="plan.is_template" class="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full">
              範本
            </span>
          </div>
        </div>
        <button
          v-if="!isEditing"
          class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
          @click="startEdit"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>

      <!-- View Mode -->
      <template v-if="!isEditing">
        <!-- Objectives -->
        <div v-if="plan.objectives?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-2">訓練目標</h2>
          <ul class="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
            <li v-for="(obj, idx) in plan.objectives" :key="idx">{{ obj }}</li>
          </ul>
        </div>

        <!-- Warmup -->
        <div v-if="plan.warmup_exercises?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-2">熱身動作</h2>
          <ExerciseDisplay :exercises="plan.warmup_exercises" />
        </div>

        <!-- Main -->
        <div v-if="plan.main_exercises?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-2">主要訓練</h2>
          <ExerciseDisplay :exercises="plan.main_exercises" />
        </div>

        <!-- Cooldown -->
        <div v-if="plan.cooldown_exercises?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-2">收操/伸展</h2>
          <ExerciseDisplay :exercises="plan.cooldown_exercises" />
        </div>

        <!-- Notes -->
        <div v-if="plan.notes" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-2">備註</h2>
          <p class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ plan.notes }}</p>
        </div>
      </template>

      <!-- Edit Mode -->
      <form v-else class="space-y-4" @submit.prevent="handleUpdate">
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
            儲存為範本
          </label>
        </div>

        <!-- Template Category -->
        <div v-if="form.is_template">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            範本分類
          </label>
          <input
            v-model="form.template_category"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
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

        <!-- Actions -->
        <div class="flex gap-2 pt-4">
          <button
            type="button"
            class="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg"
            @click="cancelEdit"
          >
            取消
          </button>
          <button
            type="submit"
            class="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg disabled:opacity-50"
            :disabled="submitting || !form.title"
          >
            {{ submitting ? '儲存中...' : '儲存變更' }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Exercise, LessonPlan } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const { success, error: showError } = useToast()
const { getPlan, updatePlan } = useLessonPlans()

const loading = ref(true)
const plan = ref<LessonPlan | null>(null)
const isEditing = ref(false)
const submitting = ref(false)

const form = ref({
  title: '',
  is_template: false,
  template_category: '',
  difficulty: '' as '' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED',
  duration_minutes: 60,
  objectives: [] as string[],
  warmup_exercises: [] as Exercise[],
  main_exercises: [] as Exercise[],
  cooldown_exercises: [] as Exercise[],
  notes: '',
})

const getDifficultyClass = (difficulty: string) => {
  const classes: Record<string, string> = {
    BEGINNER: 'bg-green-100 text-green-800',
    INTERMEDIATE: 'bg-yellow-100 text-yellow-800',
    ADVANCED: 'bg-red-100 text-red-800',
  }
  return classes[difficulty] || 'bg-gray-100 text-gray-600'
}

const getDifficultyText = (difficulty: string) => {
  const texts: Record<string, string> = {
    BEGINNER: '初階',
    INTERMEDIATE: '中階',
    ADVANCED: '進階',
  }
  return texts[difficulty] || difficulty
}

const startEdit = () => {
  if (!plan.value) return
  form.value = {
    title: plan.value.title,
    is_template: plan.value.is_template || false,
    template_category: plan.value.template_category || '',
    difficulty: plan.value.difficulty || '',
    duration_minutes: plan.value.duration_minutes || 60,
    objectives: [...(plan.value.objectives || [])],
    warmup_exercises: [...(plan.value.warmup_exercises || [])],
    main_exercises: [...(plan.value.main_exercises || [])],
    cooldown_exercises: [...(plan.value.cooldown_exercises || [])],
    notes: plan.value.notes || '',
  }
  isEditing.value = true
}

const cancelEdit = () => {
  isEditing.value = false
}

const handleUpdate = async () => {
  submitting.value = true

  const data = {
    title: form.value.title,
    is_template: form.value.is_template,
    template_category: form.value.is_template ? form.value.template_category : undefined,
    difficulty: (form.value.difficulty || undefined) as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | undefined,
    duration_minutes: form.value.duration_minutes,
    objectives: form.value.objectives.filter(o => o.trim()),
    warmup_exercises: form.value.warmup_exercises,
    main_exercises: form.value.main_exercises,
    cooldown_exercises: form.value.cooldown_exercises,
    notes: form.value.notes || undefined,
  }

  const result = await updatePlan(route.params.id as string, data)

  if (result.success) {
    success('教案已更新')
    plan.value = { ...plan.value!, ...data }
    isEditing.value = false
  } else {
    showError(result.message || '更新失敗')
  }

  submitting.value = false
}

onMounted(async () => {
  loading.value = true
  const result = await getPlan(route.params.id as string)
  if (result) {
    plan.value = result
  }
  loading.value = false
})
</script>
