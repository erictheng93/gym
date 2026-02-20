/**
 * Tests for useTeachingMaterials composable
 *
 * Tests teaching materials library management including:
 * - Fetching materials list with filtering
 * - Categories, muscle groups, equipment metadata
 * - Search functionality
 * - CRUD operations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock data
const mockMaterials = [
  {
    id: 'mat-1',
    type: 'EXERCISE',
    category: '力量訓練',
    name: '啞鈴肩推',
    description: '基礎肩部力量訓練動作',
    muscle_groups: ['shoulders', 'triceps'],
    equipment: ['dumbbell'],
    difficulty: 'INTERMEDIATE',
    instructions: ['坐姿挺胸', '啞鈴舉至肩膀高度', '向上推舉'],
    tips: ['保持核心穩定', '避免聳肩'],
    common_mistakes: ['過度弓背', '速度太快'],
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'mat-2',
    type: 'VIDEO',
    category: '有氧訓練',
    name: 'HIIT 間歇訓練教學',
    description: '高強度間歇訓練影片',
    video_url: 'https://example.com/hiit.mp4',
    thumbnail_url: 'https://example.com/hiit-thumb.jpg',
    muscle_groups: ['full_body'],
    equipment: [],
    difficulty: 'ADVANCED',
    created_at: '2024-01-10T00:00:00Z',
  },
  {
    id: 'mat-3',
    type: 'DOCUMENT',
    category: '伸展放鬆',
    name: '運動後伸展指南',
    description: '全身伸展動作指南文件',
    file_id: 'file-1',
    difficulty: 'BEGINNER',
    created_at: '2024-01-05T00:00:00Z',
  },
]

const mockCategories = {
  EXERCISE: [
    { category: '力量訓練', count: 15 },
    { category: '伸展放鬆', count: 8 },
  ],
  VIDEO: [
    { category: '有氧訓練', count: 5 },
  ],
  DOCUMENT: [
    { category: '伸展放鬆', count: 3 },
  ],
}

const mockMuscleGroups = ['shoulders', 'triceps', 'chest', 'back', 'legs', 'core', 'full_body']
const mockEquipment = ['dumbbell', 'barbell', 'kettlebell', 'resistance_band', 'bodyweight']

const mockMaterialDetail = {
  ...mockMaterials[0],
  related: [
    {
      id: 'mat-4',
      type: 'EXERCISE',
      name: '槓鈴肩推',
      category: '力量訓練',
      difficulty: 'ADVANCED',
      muscle_groups: ['shoulders', 'triceps'],
    },
  ],
}

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

vi.stubGlobal('ref', (initial: unknown) => ({ value: initial }))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useCoachAuth
vi.stubGlobal('useCoachAuth', () => ({
  getAuthHeader: () => ({ 'X-Coach-Token': 'test-token' }),
}))

// Import after mocks
import { useTeachingMaterials } from './useTeachingMaterials'

describe('useTeachingMaterials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('fetchMaterials', () => {
    it('should fetch materials successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockMaterials,
        meta: { total: 3, limit: 20, offset: 0 },
      })

      const { materials, total, fetchMaterials } = useTeachingMaterials()
      await fetchMaterials()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(materials.value).toEqual(mockMaterials)
      expect(total.value).toBe(3)
    })

    it('should support filtering by type', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMaterials[0]],
        meta: { total: 1, limit: 20, offset: 0 },
      })

      const { fetchMaterials } = useTeachingMaterials()
      await fetchMaterials({ type: 'EXERCISE' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials',
        expect.objectContaining({
          query: { type: 'EXERCISE' },
        })
      )
    })

    it('should support filtering by difficulty', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMaterials[0]],
        meta: { total: 1, limit: 20, offset: 0 },
      })

      const { fetchMaterials } = useTeachingMaterials()
      await fetchMaterials({ difficulty: 'INTERMEDIATE' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials',
        expect.objectContaining({
          query: { difficulty: 'INTERMEDIATE' },
        })
      )
    })

    it('should support filtering by muscle_groups and equipment', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMaterials[0]],
        meta: { total: 1, limit: 20, offset: 0 },
      })

      const { fetchMaterials } = useTeachingMaterials()
      await fetchMaterials({ muscle_groups: 'shoulders', equipment: 'dumbbell' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials',
        expect.objectContaining({
          query: { muscle_groups: 'shoulders', equipment: 'dumbbell' },
        })
      )
    })

    it('should support pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMaterials[2]],
        meta: { total: 3, limit: 1, offset: 2 },
      })

      const { fetchMaterials } = useTeachingMaterials()
      await fetchMaterials({ limit: 1, offset: 2 })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials',
        expect.objectContaining({
          query: { limit: 1, offset: 2 },
        })
      )
    })

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { materials, total, fetchMaterials } = useTeachingMaterials()
      await fetchMaterials()

      expect(materials.value).toEqual([])
      expect(total.value).toBe(0)
    })

    it('should set loading state during fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockMaterials,
        meta: { total: 3, limit: 20, offset: 0 },
      })

      const { loading, fetchMaterials } = useTeachingMaterials()
      expect(loading.value).toBe(false)

      const fetchPromise = fetchMaterials()
      // loading is set synchronously before await
      expect(loading.value).toBe(true)

      await fetchPromise
      expect(loading.value).toBe(false)
    })
  })

  describe('fetchCategories', () => {
    it('should fetch categories grouped by type', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCategories,
      })

      const { categoriesByType, fetchCategories } = useTeachingMaterials()
      await fetchCategories()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/categories',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(categoriesByType.value).toEqual(mockCategories)
    })

    it('should handle categories fetch error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { categoriesByType, fetchCategories } = useTeachingMaterials()
      await fetchCategories()

      expect(categoriesByType.value).toEqual({})
    })
  })

  describe('fetchMuscleGroups', () => {
    it('should fetch muscle groups', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockMuscleGroups,
      })

      const { muscleGroups, fetchMuscleGroups } = useTeachingMaterials()
      await fetchMuscleGroups()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/muscle-groups',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(muscleGroups.value).toEqual(mockMuscleGroups)
    })

    it('should handle fetch error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { muscleGroups, fetchMuscleGroups } = useTeachingMaterials()
      await fetchMuscleGroups()

      expect(muscleGroups.value).toEqual([])
    })
  })

  describe('fetchEquipment', () => {
    it('should fetch equipment types', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockEquipment,
      })

      const { equipment, fetchEquipment } = useTeachingMaterials()
      await fetchEquipment()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/equipment',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(equipment.value).toEqual(mockEquipment)
    })

    it('should handle fetch error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { equipment, fetchEquipment } = useTeachingMaterials()
      await fetchEquipment()

      expect(equipment.value).toEqual([])
    })
  })

  describe('searchMaterials', () => {
    it('should search materials by query', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMaterials[0]],
      })

      const { searchMaterials } = useTeachingMaterials()
      const results = await searchMaterials({ q: '啞鈴' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/search',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
          query: { q: '啞鈴' },
        })
      )
      expect(results).toEqual([mockMaterials[0]])
    })

    it('should search with multiple filters', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMaterials[0]],
      })

      const { searchMaterials } = useTeachingMaterials()
      await searchMaterials({
        q: '肩',
        muscle_groups: 'shoulders',
        equipment: 'dumbbell',
        difficulty: 'INTERMEDIATE',
        types: 'EXERCISE',
        limit: 10,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/search',
        expect.objectContaining({
          query: {
            q: '肩',
            muscle_groups: 'shoulders',
            equipment: 'dumbbell',
            difficulty: 'INTERMEDIATE',
            types: 'EXERCISE',
            limit: 10,
          },
        })
      )
    })

    it('should return empty array on search error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { searchMaterials } = useTeachingMaterials()
      const results = await searchMaterials({ q: 'test' })

      expect(results).toEqual([])
    })
  })

  describe('getMaterial', () => {
    it('should fetch material details with related materials', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockMaterialDetail,
      })

      const { getMaterial } = useTeachingMaterials()
      const result = await getMaterial('mat-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/mat-1',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(result).toEqual(mockMaterialDetail)
      expect(result!.related).toHaveLength(1)
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getMaterial } = useTeachingMaterials()
      const result = await getMaterial('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('createMaterial', () => {
    it('should create a material successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教學資源已建立',
        data: { id: 'mat-new', type: 'EXERCISE', name: '新動作' },
      })

      const { createMaterial } = useTeachingMaterials()
      const result = await createMaterial({
        type: 'EXERCISE',
        name: '新動作',
        category: '力量訓練',
        muscle_groups: ['chest'],
        equipment: ['barbell'],
        difficulty: 'BEGINNER',
      })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-Coach-Token': 'test-token' },
          body: {
            type: 'EXERCISE',
            name: '新動作',
            category: '力量訓練',
            muscle_groups: ['chest'],
            equipment: ['barbell'],
            difficulty: 'BEGINNER',
          },
        })
      )
    })

    it('should create a video material', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教學資源已建立',
        data: { id: 'mat-new', type: 'VIDEO', name: '教學影片' },
      })

      const { createMaterial } = useTeachingMaterials()
      const result = await createMaterial({
        type: 'VIDEO',
        name: '教學影片',
        video_url: 'https://example.com/video.mp4',
      })

      expect(result.success).toBe(true)
    })

    it('should handle create error', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '名稱已存在' },
      })

      const { createMaterial } = useTeachingMaterials()
      const result = await createMaterial({
        type: 'EXERCISE',
        name: '啞鈴肩推',
      })

      expect(result.success).toBe(false)
      expect(result.message).toBe('名稱已存在')
    })

    it('should use default error message when no specific message', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Unknown error'))

      const { createMaterial } = useTeachingMaterials()
      const result = await createMaterial({
        type: 'EXERCISE',
        name: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.message).toBe('建立教學資源失敗')
    })
  })

  describe('updateMaterial', () => {
    it('should update a material successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教學資源已更新',
      })

      const { updateMaterial } = useTeachingMaterials()
      const result = await updateMaterial('mat-1', {
        name: '啞鈴側平舉',
        description: '更新後的描述',
        muscle_groups: ['shoulders'],
      })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/mat-1',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'X-Coach-Token': 'test-token' },
          body: {
            name: '啞鈴側平舉',
            description: '更新後的描述',
            muscle_groups: ['shoulders'],
          },
        })
      )
    })

    it('should handle update error', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '更新失敗' },
      })

      const { updateMaterial } = useTeachingMaterials()
      const result = await updateMaterial('mat-1', { name: 'Updated' })

      expect(result.success).toBe(false)
      expect(result.message).toBe('更新失敗')
    })

    it('should use default error message on unknown error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Unknown'))

      const { updateMaterial } = useTeachingMaterials()
      const result = await updateMaterial('mat-1', { name: 'Updated' })

      expect(result.success).toBe(false)
      expect(result.message).toBe('更新教學資源失敗')
    })
  })

  describe('deleteMaterial', () => {
    it('should delete a material successfully (soft delete)', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教學資源已刪除',
      })

      const { deleteMaterial } = useTeachingMaterials()
      const result = await deleteMaterial('mat-1')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/teaching-materials/mat-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
    })

    it('should handle delete error', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '無權限刪除' },
      })

      const { deleteMaterial } = useTeachingMaterials()
      const result = await deleteMaterial('mat-1')

      expect(result.success).toBe(false)
      expect(result.message).toBe('無權限刪除')
    })

    it('should use default error message on unknown error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Unknown'))

      const { deleteMaterial } = useTeachingMaterials()
      const result = await deleteMaterial('mat-1')

      expect(result.success).toBe(false)
      expect(result.message).toBe('刪除教學資源失敗')
    })
  })
})
