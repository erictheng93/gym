/**
 * useLessonPlans - Lesson Plans Management Composable
 *
 * Handles creating, editing, and managing lesson plans.
 */

import type { LessonPlan, Exercise } from '../types/coach'

interface LessonPlansResponse {
  success: boolean
  data: LessonPlan[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

interface TemplatesResponse {
  success: boolean
  data: LessonPlan[]
  categories: string[]
}

interface LessonPlanResponse {
  success: boolean
  data: LessonPlan
}

export const useLessonPlans = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useCoachAuth()

  const plans = ref<LessonPlan[]>([])
  const templates = ref<LessonPlan[]>([])
  const categories = ref<string[]>([])
  const loading = ref(false)
  const total = ref(0)

  /**
   * Fetch lesson plans
   */
  const fetchPlans = async (params?: {
    is_template?: boolean
    category?: string
    difficulty?: string
    search?: string
    limit?: number
    offset?: number
  }): Promise<void> => {
    loading.value = true
    try {
      const response = await $fetch<LessonPlansResponse>(`${apiUrl}/api/coach/lesson-plans`, {
        headers: getAuthHeader(),
        query: params,
      })

      if (response.success) {
        plans.value = response.data
        total.value = response.meta.total
      }
    } catch (error) {
      console.error('Failed to fetch lesson plans:', error)
      plans.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch templates
   */
  const fetchTemplates = async (params?: {
    category?: string
    difficulty?: string
    limit?: number
    offset?: number
  }): Promise<void> => {
    loading.value = true
    try {
      const response = await $fetch<TemplatesResponse>(`${apiUrl}/api/coach/lesson-plans/templates`, {
        headers: getAuthHeader(),
        query: params,
      })

      if (response.success) {
        templates.value = response.data
        categories.value = response.categories || []
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error)
      templates.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Get lesson plan details
   */
  const getPlan = async (id: string): Promise<LessonPlan | null> => {
    try {
      const response = await $fetch<LessonPlanResponse>(
        `${apiUrl}/api/coach/lesson-plans/${id}`,
        {
          headers: getAuthHeader(),
        }
      )

      return response.success ? response.data : null
    } catch (error) {
      console.error('Failed to fetch lesson plan:', error)
      return null
    }
  }

  /**
   * Create lesson plan
   */
  const createPlan = async (data: {
    title: string
    objectives?: string[]
    warmup_exercises?: Exercise[]
    main_exercises?: Exercise[]
    cooldown_exercises?: Exercise[]
    notes?: string
    is_template?: boolean
    template_category?: string
    difficulty?: string
    duration_minutes?: number
    session_id?: string
  }): Promise<{ success: boolean; message?: string; data?: { id: string } }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
        data: { id: string; title: string }
      }>(`${apiUrl}/api/coach/lesson-plans`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '建立教案失敗'
      return { success: false, message }
    }
  }

  /**
   * Update lesson plan
   */
  const updatePlan = async (
    id: string,
    data: Partial<{
      title: string
      objectives: string[]
      warmup_exercises: Exercise[]
      main_exercises: Exercise[]
      cooldown_exercises: Exercise[]
      notes: string
      is_template: boolean
      template_category: string
      difficulty: string
      duration_minutes: number
      session_id: string
    }>
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/api/coach/lesson-plans/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '更新教案失敗'
      return { success: false, message }
    }
  }

  /**
   * Delete lesson plan
   */
  const deletePlan = async (id: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/api/coach/lesson-plans/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '刪除教案失敗'
      return { success: false, message }
    }
  }

  /**
   * Copy a template to create a new plan
   */
  const copyPlan = async (
    id: string,
    data?: {
      title?: string
      session_id?: string
    }
  ): Promise<{ success: boolean; message?: string; data?: { id: string } }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
        data: { id: string; title: string }
      }>(`${apiUrl}/api/coach/lesson-plans/${id}/copy`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data || {},
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '複製教案失敗'
      return { success: false, message }
    }
  }

  return {
    // State
    plans,
    templates,
    categories,
    loading,
    total,

    // Actions
    fetchPlans,
    fetchTemplates,
    getPlan,
    createPlan,
    updatePlan,
    deletePlan,
    copyPlan,
  }
}
