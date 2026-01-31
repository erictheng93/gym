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
      編輯教學資源
    </h1>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <form v-else @submit.prevent="handleSubmit" class="space-y-4">
      <!-- Name -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          名稱 <span class="text-red-500">*</span>
        </label>
        <input
          v-model="form.name"
          type="text"
          required
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- Category -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          分類
        </label>
        <input
          v-model="form.category"
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

      <!-- Muscle Groups -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          目標肌群
        </label>
        <div class="space-y-2">
          <div
            v-for="(muscle, idx) in form.muscle_groups"
            :key="idx"
            class="flex gap-2"
          >
            <input
              v-model="form.muscle_groups[idx]"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
            <button
              type="button"
              class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              @click="form.muscle_groups.splice(idx, 1)"
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
          @click="form.muscle_groups.push('')"
        >
          + 新增肌群
        </button>
      </div>

      <!-- Equipment -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          所需器材
        </label>
        <div class="space-y-2">
          <div
            v-for="(equip, idx) in form.equipment"
            :key="idx"
            class="flex gap-2"
          >
            <input
              v-model="form.equipment[idx]"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
            <button
              type="button"
              class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              @click="form.equipment.splice(idx, 1)"
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
          @click="form.equipment.push('')"
        >
          + 新增器材
        </button>
      </div>

      <!-- Description -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          說明
        </label>
        <textarea
          v-model="form.description"
          rows="3"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- Instructions -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          動作步驟
        </label>
        <div class="space-y-2">
          <div
            v-for="(step, idx) in form.instructions"
            :key="idx"
            class="flex gap-2"
          >
            <span class="flex-shrink-0 w-6 h-10 flex items-center justify-center text-gray-500">
              {{ idx + 1 }}.
            </span>
            <input
              v-model="form.instructions[idx]"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
            <button
              type="button"
              class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              @click="form.instructions.splice(idx, 1)"
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
          @click="form.instructions.push('')"
        >
          + 新增步驟
        </button>
      </div>

      <!-- Tips -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          教學提示
        </label>
        <div class="space-y-2">
          <div
            v-for="(tip, idx) in form.tips"
            :key="idx"
            class="flex gap-2"
          >
            <input
              v-model="form.tips[idx]"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
            <button
              type="button"
              class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              @click="form.tips.splice(idx, 1)"
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
          @click="form.tips.push('')"
        >
          + 新增提示
        </button>
      </div>

      <!-- Common Mistakes -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          常見錯誤
        </label>
        <div class="space-y-2">
          <div
            v-for="(mistake, idx) in form.common_mistakes"
            :key="idx"
            class="flex gap-2"
          >
            <input
              v-model="form.common_mistakes[idx]"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
            <button
              type="button"
              class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              @click="form.common_mistakes.splice(idx, 1)"
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
          @click="form.common_mistakes.push('')"
        >
          + 新增常見錯誤
        </button>
      </div>

      <!-- Video URL -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          影片網址
        </label>
        <input
          v-model="form.video_url"
          type="url"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- Thumbnail URL -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          縮圖網址
        </label>
        <input
          v-model="form.thumbnail_url"
          type="url"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- Actions -->
      <div class="flex gap-2 pt-4">
        <button
          type="button"
          class="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg"
          @click="router.back()"
        >
          取消
        </button>
        <button
          type="submit"
          class="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg disabled:opacity-50"
          :disabled="submitting || !form.name"
        >
          {{ submitting ? '儲存中...' : '儲存變更' }}
        </button>
      </div>

      <!-- Delete Button -->
      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          class="w-full py-3 border border-red-600 text-red-600 font-medium rounded-lg hover:bg-red-50"
          @click="handleDelete"
        >
          刪除資源
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { TeachingMaterial } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const { success, error: showError } = useToast()
const { getMaterial, updateMaterial, deleteMaterial } = useTeachingMaterials()

const loading = ref(true)
const submitting = ref(false)
const material = ref<TeachingMaterial | null>(null)

const form = ref({
  name: '',
  category: '',
  difficulty: '',
  muscle_groups: [] as string[],
  equipment: [] as string[],
  description: '',
  instructions: [] as string[],
  tips: [] as string[],
  common_mistakes: [] as string[],
  video_url: '',
  thumbnail_url: '',
})

const handleSubmit = async () => {
  submitting.value = true

  const data = {
    name: form.value.name,
    category: form.value.category || undefined,
    difficulty: form.value.difficulty || undefined,
    muscle_groups: form.value.muscle_groups.filter(m => m.trim()),
    equipment: form.value.equipment.filter(e => e.trim()),
    description: form.value.description || undefined,
    video_url: form.value.video_url || undefined,
  }

  const result = await updateMaterial(route.params.id as string, data)

  if (result.success) {
    success('教學資源已更新')
    router.push(`/library/${route.params.id}`)
  } else {
    showError(result.message || '更新失敗')
  }

  submitting.value = false
}

const handleDelete = async () => {
  if (!confirm('確定要刪除此教學資源嗎？')) return

  const result = await deleteMaterial(route.params.id as string)

  if (result.success) {
    success('教學資源已刪除')
    router.push('/library')
  } else {
    showError(result.message || '刪除失敗')
  }
}

onMounted(async () => {
  loading.value = true
  material.value = await getMaterial(route.params.id as string)

  if (material.value) {
    form.value = {
      name: material.value.name,
      category: material.value.category || '',
      difficulty: material.value.difficulty || '',
      muscle_groups: [...(material.value.muscle_groups || [])],
      equipment: [...(material.value.equipment || [])],
      description: material.value.description || '',
      instructions: [...(material.value.instructions || [])],
      tips: [...(material.value.tips || [])],
      common_mistakes: [...(material.value.common_mistakes || [])],
      video_url: material.value.video_url || '',
      thumbnail_url: material.value.thumbnail_url || '',
    }
  }

  loading.value = false
})
</script>
