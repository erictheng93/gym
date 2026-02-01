/**
 * useTeachingMaterials - Teaching Materials Library Composable
 *
 * Handles fetching and managing teaching materials (exercises, videos, templates).
 */

import type { TeachingMaterial } from '../types/coach'

interface MaterialsResponse {
  success: boolean
  data: TeachingMaterial[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

interface CategoriesResponse {
  success: boolean
  data: Record<string, Array<{ category: string; count: number }>>
}

interface MaterialDetailResponse {
  success: boolean
  data: TeachingMaterial & {
    related: Array<{
      id: string
      type: string
      name: string
      category: string
      difficulty?: string
      muscle_groups?: string[]
    }>
  }
}

export const useTeachingMaterials = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useCoachAuth()

  const materials = ref<TeachingMaterial[]>([])
  const loading = ref(false)
  const total = ref(0)
  const categoriesByType = ref<Record<string, Array<{ category: string; count: number }>>>({})
  const muscleGroups = ref<string[]>([])
  const equipment = ref<string[]>([])

  /**
   * Fetch teaching materials
   */
  const fetchMaterials = async (params?: {
    type?: string
    category?: string
    difficulty?: string
    muscle_groups?: string
    equipment?: string
    search?: string
    limit?: number
    offset?: number
  }): Promise<void> => {
    loading.value = true
    try {
      const response = await $fetch<MaterialsResponse>(`${apiUrl}/api/coach/teaching-materials`, {
        headers: getAuthHeader(),
        query: params,
      })

      if (response.success) {
        materials.value = response.data
        total.value = response.meta.total
      }
    } catch (error) {
      console.error('Failed to fetch materials:', error)
      materials.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch categories grouped by type
   */
  const fetchCategories = async (): Promise<void> => {
    try {
      const response = await $fetch<CategoriesResponse>(
        `${apiUrl}/api/coach/teaching-materials/categories`,
        {
          headers: getAuthHeader(),
        }
      )

      if (response.success) {
        categoriesByType.value = response.data
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  /**
   * Fetch muscle groups
   */
  const fetchMuscleGroups = async (): Promise<void> => {
    try {
      const response = await $fetch<{ success: boolean; data: string[] }>(
        `${apiUrl}/api/coach/teaching-materials/muscle-groups`,
        {
          headers: getAuthHeader(),
        }
      )

      if (response.success) {
        muscleGroups.value = response.data
      }
    } catch (error) {
      console.error('Failed to fetch muscle groups:', error)
    }
  }

  /**
   * Fetch equipment types
   */
  const fetchEquipment = async (): Promise<void> => {
    try {
      const response = await $fetch<{ success: boolean; data: string[] }>(
        `${apiUrl}/api/coach/teaching-materials/equipment`,
        {
          headers: getAuthHeader(),
        }
      )

      if (response.success) {
        equipment.value = response.data
      }
    } catch (error) {
      console.error('Failed to fetch equipment:', error)
    }
  }

  /**
   * Search materials
   */
  const searchMaterials = async (params: {
    q?: string
    muscle_groups?: string
    equipment?: string
    difficulty?: string
    types?: string
    limit?: number
  }): Promise<TeachingMaterial[]> => {
    try {
      const response = await $fetch<{ success: boolean; data: TeachingMaterial[] }>(
        `${apiUrl}/api/coach/teaching-materials/search`,
        {
          headers: getAuthHeader(),
          query: params,
        }
      )

      return response.success ? response.data : []
    } catch (error) {
      console.error('Failed to search materials:', error)
      return []
    }
  }

  /**
   * Get material details
   */
  const getMaterial = async (id: string): Promise<MaterialDetailResponse['data'] | null> => {
    try {
      const response = await $fetch<MaterialDetailResponse>(
        `${apiUrl}/api/coach/teaching-materials/${id}`,
        {
          headers: getAuthHeader(),
        }
      )

      return response.success ? response.data : null
    } catch (error) {
      console.error('Failed to fetch material:', error)
      return null
    }
  }

  /**
   * Create teaching material
   */
  const createMaterial = async (data: {
    type: string
    category: string
    name: string
    description?: string
    file_id?: string
    video_url?: string
    muscle_groups?: string[]
    equipment?: string[]
    difficulty?: string
    template_content?: Record<string, unknown>
  }): Promise<{ success: boolean; message?: string; data?: { id: string } }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
        data: { id: string; type: string; name: string }
      }>(`${apiUrl}/api/coach/teaching-materials`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '建立教學資源失敗'
      return { success: false, message }
    }
  }

  /**
   * Update teaching material
   */
  const updateMaterial = async (
    id: string,
    data: Partial<{
      category: string
      name: string
      description: string
      file_id: string
      video_url: string
      muscle_groups: string[]
      equipment: string[]
      difficulty: string
      template_content: Record<string, unknown>
      is_active: boolean
    }>
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/api/coach/teaching-materials/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '更新教學資源失敗'
      return { success: false, message }
    }
  }

  /**
   * Delete teaching material (soft delete)
   */
  const deleteMaterial = async (id: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/api/coach/teaching-materials/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '刪除教學資源失敗'
      return { success: false, message }
    }
  }

  return {
    // State
    materials,
    loading,
    total,
    categoriesByType,
    muscleGroups,
    equipment,

    // Actions
    fetchMaterials,
    fetchCategories,
    fetchMuscleGroups,
    fetchEquipment,
    searchMaterials,
    getMaterial,
    createMaterial,
    updateMaterial,
    deleteMaterial,
  }
}
