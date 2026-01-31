<template>
  <div class="p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">教案管理</h1>
      <NuxtLink
        to="/lessons/new"
        class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg"
      >
        + 新增教案
      </NuxtLink>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-200 dark:border-gray-700 mb-4">
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="showTemplates
          ? 'border-transparent text-gray-500'
          : 'border-blue-600 text-blue-600'"
        @click="showTemplates = false; loadPlans()"
      >
        我的教案
      </button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="showTemplates
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500'"
        @click="showTemplates = true; loadTemplates()"
      >
        教案範本
      </button>
    </div>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜尋教案標題..."
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        @input="debouncedSearch"
      />
    </div>

    <!-- Category Filter (for templates) -->
    <div v-if="showTemplates && categories.length > 0" class="flex gap-2 mb-4 overflow-x-auto pb-2">
      <button
        class="px-3 py-1.5 text-sm rounded-full whitespace-nowrap"
        :class="selectedCategory === ''
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
        @click="selectedCategory = ''; loadTemplates()"
      >
        全部
      </button>
      <button
        v-for="cat in categories"
        :key="cat"
        class="px-3 py-1.5 text-sm rounded-full whitespace-nowrap"
        :class="selectedCategory === cat
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
        @click="selectedCategory = cat; loadTemplates()"
      >
        {{ cat }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <!-- Empty State -->
    <div v-else-if="displayPlans.length === 0" class="py-12 text-center text-gray-500">
      <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p>{{ showTemplates ? '沒有可用的範本' : '尚未建立教案' }}</p>
    </div>

    <!-- Plans List -->
    <div v-else class="space-y-3">
      <div
        v-for="plan in displayPlans"
        :key="plan.id"
        class="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
      >
        <div class="flex justify-between items-start">
          <div class="flex-1" @click="goToPlan(plan.id)">
            <p class="font-medium text-gray-900 dark:text-white cursor-pointer hover:text-blue-600">
              {{ plan.title }}
            </p>
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
              <span v-if="plan.template_category" class="text-xs text-gray-500">
                {{ plan.template_category }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1">
            <button
              v-if="showTemplates"
              class="p-2 text-blue-600 hover:bg-blue-50 rounded"
              title="複製此範本"
              @click="handleCopy(plan.id)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              v-if="!showTemplates"
              class="p-2 text-red-600 hover:bg-red-50 rounded"
              title="刪除"
              @click="handleDelete(plan.id)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        <div v-if="plan.objectives && plan.objectives.length > 0" class="mt-2 text-sm text-gray-500">
          <ul class="list-disc list-inside">
            <li v-for="(obj, idx) in plan.objectives.slice(0, 2)" :key="idx">{{ obj }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="displayPlans.length < total" class="mt-4 text-center">
      <button
        class="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
        @click="loadMore"
      >
        載入更多
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { success, error: showError } = useToast()
const { plans, templates, categories, loading, total, fetchPlans, fetchTemplates, deletePlan, copyPlan } = useLessonPlans()

const showTemplates = ref(false)
const searchQuery = ref('')
const selectedCategory = ref('')
const offset = ref(0)
const limit = 20

const displayPlans = computed(() => showTemplates.value ? templates.value : plans.value)

let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    offset.value = 0
    if (showTemplates.value) {
      loadTemplates()
    } else {
      loadPlans()
    }
  }, 300)
}

const loadPlans = async () => {
  await fetchPlans({
    is_template: false,
    search: searchQuery.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadTemplates = async () => {
  await fetchTemplates({
    category: selectedCategory.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  if (showTemplates.value) {
    await loadTemplates()
  } else {
    await loadPlans()
  }
}

const goToPlan = (id: string) => {
  router.push(`/lessons/${id}`)
}

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

const handleCopy = async (id: string) => {
  const result = await copyPlan(id)
  if (result.success) {
    success('教案已複製')
    showTemplates.value = false
    await loadPlans()
  } else {
    showError(result.message || '複製失敗')
  }
}

const handleDelete = async (id: string) => {
  if (!confirm('確定要刪除此教案嗎？')) return

  const result = await deletePlan(id)
  if (result.success) {
    success('教案已刪除')
    await loadPlans()
  } else {
    showError(result.message || '刪除失敗')
  }
}

onMounted(() => {
  loadPlans()
})
</script>
