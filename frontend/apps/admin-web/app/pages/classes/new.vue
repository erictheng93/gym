<script setup lang="ts">
/**
 * 新增課程頁面 (POST /api/classes)
 */
import { PAGES } from '~/constants'
import ClassForm from '~/components/classes/ClassForm.vue'
import type { ClassInput } from '~/composables/useClasses'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const { createClass } = useClasses()
const isSubmitting = ref(false)

const handleSubmit = async (input: ClassInput) => {
  isSubmitting.value = true
  try {
    const result = await createClass(input)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('課程已建立')
    await navigateTo(`/classes/${result.data.id}`)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader :title="PAGES.CLASSES.ADD_CLASS" :description="PAGES.CLASSES.DESCRIPTION" />
    <ClassForm :submitting="isSubmitting" submit-label="建立課程" cancel-to="/classes" @submit="handleSubmit" />
  </PageContainer>
</template>
