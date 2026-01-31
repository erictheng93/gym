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
    <div v-else-if="!material" class="py-12 text-center text-gray-500">
      找不到教學資源
    </div>

    <!-- Material Detail -->
    <div v-else>
      <!-- Media Display -->
      <div class="aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden mb-4">
        <!-- Video -->
        <video
          v-if="material.type === 'VIDEO' && material.video_url"
          :src="material.video_url"
          controls
          class="w-full h-full object-contain"
        />
        <!-- Image -->
        <img
          v-else-if="material.thumbnail_url"
          :src="material.thumbnail_url"
          :alt="material.name"
          class="w-full h-full object-contain"
        />
        <!-- Placeholder -->
        <div v-else class="w-full h-full flex items-center justify-center">
          <svg class="w-24 h-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      <!-- Header -->
      <div class="flex justify-between items-start mb-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">
            {{ material.name }}
          </h1>
          <div class="flex items-center gap-2 mt-1">
            <span
              class="px-2 py-0.5 text-xs rounded"
              :class="getTypeBadgeClass(material.type)"
            >
              {{ getTypeText(material.type) }}
            </span>
            <span
              v-if="material.difficulty"
              class="px-2 py-0.5 text-xs rounded"
              :class="getDifficultyClass(material.difficulty)"
            >
              {{ getDifficultyText(material.difficulty) }}
            </span>
          </div>
        </div>
        <button
          class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
          @click="router.push(`/library/${material.id}/edit`)"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>

      <!-- Category -->
      <div v-if="material.category" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-1">分類</h2>
        <p class="text-gray-900 dark:text-white">{{ material.category }}</p>
      </div>

      <!-- Muscle Groups -->
      <div v-if="material.muscle_groups?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">目標肌群</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="muscle in material.muscle_groups"
            :key="muscle"
            class="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm rounded-full"
          >
            {{ muscle }}
          </span>
        </div>
      </div>

      <!-- Equipment -->
      <div v-if="material.equipment?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">所需器材</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="equip in material.equipment"
            :key="equip"
            class="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm rounded-full"
          >
            {{ equip }}
          </span>
        </div>
      </div>

      <!-- Description -->
      <div v-if="material.description" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">說明</h2>
        <p class="text-gray-900 dark:text-white whitespace-pre-wrap">{{ material.description }}</p>
      </div>

      <!-- Instructions -->
      <div v-if="material.instructions?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">動作步驟</h2>
        <ol class="list-decimal list-inside space-y-2 text-gray-900 dark:text-white">
          <li v-for="(step, idx) in material.instructions" :key="idx">
            {{ step }}
          </li>
        </ol>
      </div>

      <!-- Tips -->
      <div v-if="material.tips?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">教學提示</h2>
        <ul class="list-disc list-inside space-y-1 text-gray-900 dark:text-white">
          <li v-for="(tip, idx) in material.tips" :key="idx">
            {{ tip }}
          </li>
        </ul>
      </div>

      <!-- Common Mistakes -->
      <div v-if="material.common_mistakes?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">常見錯誤</h2>
        <ul class="list-disc list-inside space-y-1 text-red-600 dark:text-red-400">
          <li v-for="(mistake, idx) in material.common_mistakes" :key="idx">
            {{ mistake }}
          </li>
        </ul>
      </div>

      <!-- Related Exercises -->
      <div v-if="material.related_materials?.length" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">相關動作</h2>
        <div class="space-y-2">
          <div
            v-for="related in material.related_materials"
            :key="related.id"
            class="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer"
            @click="router.push(`/library/${related.id}`)"
          >
            <div class="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded overflow-hidden">
              <img
                v-if="related.thumbnail_url"
                :src="related.thumbnail_url"
                :alt="related.name"
                class="w-full h-full object-cover"
              />
            </div>
            <span class="font-medium text-gray-900 dark:text-white">{{ related.name }}</span>
          </div>
        </div>
      </div>

      <!-- Metadata -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-sm font-medium text-gray-500 mb-2">資訊</h2>
        <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <p>建立時間：{{ formatDate(material.created_at) }}</p>
          <p v-if="material.created_by_name">建立者：{{ material.created_by_name }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TeachingMaterial } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const { getMaterial } = useTeachingMaterials()

const loading = ref(true)
const material = ref<TeachingMaterial | null>(null)

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

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

onMounted(async () => {
  loading.value = true
  material.value = await getMaterial(route.params.id as string)
  loading.value = false
})
</script>
