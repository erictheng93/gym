<template>
  <div class="p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">教學資源庫</h1>
      <NuxtLink
        to="/library/new"
        class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg"
      >
        + 新增資源
      </NuxtLink>
    </div>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜尋動作名稱..."
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        @input="debouncedSearch"
      />
    </div>

    <!-- Filters -->
    <div class="flex gap-2 mb-4 overflow-x-auto pb-2">
      <!-- Category Filter -->
      <select
        v-model="selectedCategory"
        class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        @change="loadMaterials"
      >
        <option value="">所有分類</option>
        <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
      </select>

      <!-- Muscle Group Filter -->
      <select
        v-model="selectedMuscle"
        class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        @change="loadMaterials"
      >
        <option value="">所有肌群</option>
        <option v-for="muscle in muscleGroups" :key="muscle" :value="muscle">{{ muscle }}</option>
      </select>

      <!-- Difficulty Filter -->
      <select
        v-model="selectedDifficulty"
        class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        @change="loadMaterials"
      >
        <option value="">所有難度</option>
        <option value="BEGINNER">初階</option>
        <option value="INTERMEDIATE">中階</option>
        <option value="ADVANCED">進階</option>
      </select>
    </div>

    <!-- Type Tabs -->
    <div class="flex border-b border-gray-200 dark:border-gray-700 mb-4">
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="selectedType === ''
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500'"
        @click="selectedType = ''; loadMaterials()"
      >
        全部
      </button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="selectedType === 'EXERCISE'
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500'"
        @click="selectedType = 'EXERCISE'; loadMaterials()"
      >
        動作
      </button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="selectedType === 'VIDEO'
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500'"
        @click="selectedType = 'VIDEO'; loadMaterials()"
      >
        影片
      </button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="selectedType === 'DOCUMENT'
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500'"
        @click="selectedType = 'DOCUMENT'; loadMaterials()"
      >
        文件
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <!-- Empty State -->
    <div v-else-if="materials.length === 0" class="py-12 text-center text-gray-500">
      <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <p>沒有找到教學資源</p>
    </div>

    <!-- Materials Grid -->
    <div v-else class="grid grid-cols-2 gap-3">
      <div
        v-for="material in materials"
        :key="material.id"
        class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
        @click="goToMaterial(material.id)"
      >
        <!-- Thumbnail -->
        <div class="aspect-video bg-gray-200 dark:bg-gray-700 relative">
          <img
            v-if="material.thumbnail_url"
            :src="material.thumbnail_url"
            :alt="material.name"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path v-if="material.type === 'VIDEO'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <!-- Type Badge -->
          <span
            class="absolute top-2 right-2 px-2 py-0.5 text-xs rounded"
            :class="getTypeBadgeClass(material.type)"
          >
            {{ getTypeText(material.type) }}
          </span>
        </div>

        <!-- Info -->
        <div class="p-3">
          <p class="font-medium text-gray-900 dark:text-white text-sm line-clamp-1">
            {{ material.name }}
          </p>
          <div class="flex items-center gap-1 mt-1">
            <span
              v-if="material.difficulty"
              class="text-xs px-1.5 py-0.5 rounded"
              :class="getDifficultyClass(material.difficulty)"
            >
              {{ getDifficultyText(material.difficulty) }}
            </span>
            <span v-if="material.muscle_groups?.length" class="text-xs text-gray-500">
              {{ material.muscle_groups[0] }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="materials.length < total" class="mt-4 text-center">
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
const {
  materials,
  categoriesByType,
  muscleGroups,
  loading,
  total,
  fetchMaterials,
  fetchCategories,
  fetchMuscleGroups,
} = useTeachingMaterials()

// Flatten categories for the filter dropdown
const categories = computed(() => {
  const allCategories = new Set<string>()
  Object.values(categoriesByType.value).forEach(cats => {
    cats.forEach(c => allCategories.add(c.category))
  })
  return Array.from(allCategories)
})

const searchQuery = ref('')
const selectedCategory = ref('')
const selectedMuscle = ref('')
const selectedDifficulty = ref('')
const selectedType = ref('')
const offset = ref(0)
const limit = 20

let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    offset.value = 0
    loadMaterials()
  }, 300)
}

const loadMaterials = async () => {
  offset.value = 0
  await fetchMaterials({
    search: searchQuery.value || undefined,
    category: selectedCategory.value || undefined,
    muscle_groups: selectedMuscle.value || undefined,
    difficulty: selectedDifficulty.value || undefined,
    type: selectedType.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  await fetchMaterials({
    search: searchQuery.value || undefined,
    category: selectedCategory.value || undefined,
    muscle_groups: selectedMuscle.value || undefined,
    difficulty: selectedDifficulty.value || undefined,
    type: selectedType.value || undefined,
    limit,
    offset: offset.value,
  })
}

const goToMaterial = (id: string) => {
  router.push(`/library/${id}`)
}

const getTypeBadgeClass = (type: string) => {
  const classes: Record<string, string> = {
    EXERCISE: 'bg-blue-600 text-white',
    VIDEO: 'bg-red-600 text-white',
    DOCUMENT: 'bg-gray-600 text-white',
  }
  return classes[type] || 'bg-gray-600 text-white'
}

const getTypeText = (type: string) => {
  const texts: Record<string, string> = {
    EXERCISE: '動作',
    VIDEO: '影片',
    DOCUMENT: '文件',
  }
  return texts[type] || type
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

onMounted(async () => {
  await Promise.all([
    loadMaterials(),
    fetchCategories(),
    fetchMuscleGroups(),
  ])
})
</script>
