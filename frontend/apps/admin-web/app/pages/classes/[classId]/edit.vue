<script setup lang="ts">
/**
 * 編輯課程頁面 (PATCH /api/classes/:id)
 */
import { PAGES } from '~/constants'
import ClassForm from '~/components/classes/ClassForm.vue'
import type { ApiClassDetail, ClassInput } from '~/composables/useClasses'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const { getClass, updateClass } = useClasses()

const classId = computed(() => String(route.params.classId))
const classItem = ref<ApiClassDetail | null>(null)
const isLoading = ref(true)
const isSubmitting = ref(false)

onMounted(async () => {
  classItem.value = await getClass(classId.value)
  isLoading.value = false
})

const handleSubmit = async (input: ClassInput) => {
  isSubmitting.value = true
  try {
    const result = await updateClass(classId.value, input)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('課程已更新')
    await navigateTo(`/classes/${classId.value}`)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader :title="PAGES.CLASSES.EDIT_CLASS" :description="classItem?.name" />
    <div v-if="isLoading" class="state-text">載入中…</div>
    <div v-else-if="!classItem" class="state-text">找不到此課程</div>
    <ClassForm
      v-else
      :initial="classItem"
      :submitting="isSubmitting"
      submit-label="儲存變更"
      :cancel-to="`/classes/${classId}`"
      @submit="handleSubmit"
    />
  </PageContainer>
</template>

<style scoped>
.state-text {
  padding: var(--space-xl);
  color: var(--color-text-secondary);
}
</style>
