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
      新增教學資源
    </h1>

    <form class="space-y-4" @submit.prevent="handleSubmit">
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
          placeholder="例如：槓鈴深蹲"
        />
      </div>

      <!-- Type -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          類型 <span class="text-red-500">*</span>
        </label>
        <select
          v-model="form.type"
          required
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        >
          <option value="EXERCISE">動作</option>
          <option value="VIDEO">影片</option>
          <option value="DOCUMENT">文件</option>
        </select>
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
          placeholder="例如：下肢訓練"
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
              placeholder="例如：股四頭肌"
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
              placeholder="例如：槓鈴"
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
          placeholder="動作簡介..."
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

      <!-- Video URL (for VIDEO type) -->
      <div v-if="form.type === 'VIDEO'">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          影片網址
        </label>
        <input
          v-model="form.video_url"
          type="url"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          placeholder="https://..."
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
          placeholder="https://..."
        />
      </div>

      <!-- Submit -->
      <div class="pt-4">
        <button
          type="submit"
          class="w-full py-3 bg-blue-600 text-white font-medium rounded-lg disabled:opacity-50"
          :disabled="submitting || !form.name"
        >
          {{ submitting ? '儲存中...' : '儲存資源' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { success, error: showError } = useToast()
const { createMaterial } = useTeachingMaterials()

const submitting = ref(false)
const form = ref({
  name: '',
  type: 'EXERCISE' as 'EXERCISE' | 'VIDEO' | 'DOCUMENT',
  category: '',
  difficulty: '',
  muscle_groups: [''] as string[],
  equipment: [''] as string[],
  description: '',
  instructions: [''] as string[],
  tips: [''] as string[],
  common_mistakes: [''] as string[],
  video_url: '',
  thumbnail_url: '',
})

const handleSubmit = async () => {
  submitting.value = true

  const data = {
    name: form.value.name,
    type: form.value.type,
    category: form.value.category || undefined,
    difficulty: form.value.difficulty || undefined,
    muscle_groups: form.value.muscle_groups.filter(m => m.trim()),
    equipment: form.value.equipment.filter(e => e.trim()),
    description: form.value.description || undefined,
    instructions: form.value.instructions.filter(i => i.trim()),
    tips: form.value.tips.filter(t => t.trim()),
    common_mistakes: form.value.common_mistakes.filter(m => m.trim()),
    video_url: form.value.video_url || undefined,
    thumbnail_url: form.value.thumbnail_url || undefined,
  }

  const result = await createMaterial(data)

  if (result.success) {
    success('教學資源已建立')
    router.push('/library')
  } else {
    showError(result.message || '建立失敗')
  }

  submitting.value = false
}
</script>
