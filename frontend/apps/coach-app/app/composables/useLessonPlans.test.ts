/**
 * Tests for useLessonPlans composable
 *
 * Tests lesson plan management functionality including:
 * - Fetching plans list
 * - CRUD operations
 * - Template handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock data
const mockPlans = [
  {
    id: 'plan-1',
    title: '上肢力量訓練',
    objectives: ['增強肩部力量', '改善核心穩定性'],
    warmup_exercises: [{ name: '手臂繞環', sets: 2, reps: '10' }],
    main_exercises: [{ name: '啞鈴肩推', sets: 3, reps: '12' }],
    cooldown_exercises: [{ name: '肩部伸展', sets: 1, reps: '30秒' }],
    is_template: false,
    difficulty: 'INTERMEDIATE',
    duration_minutes: 60,
    coach_id: 'coach-1',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'plan-2',
    title: '下肢訓練範本',
    objectives: ['增強腿部力量'],
    is_template: true,
    template_category: '力量訓練',
    difficulty: 'BEGINNER',
    duration_minutes: 45,
    coach_id: 'coach-1',
    created_at: '2024-01-10T00:00:00Z',
  },
]

const mockTemplates = [
  {
    ...mockPlans[1],
  },
]

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    directusUrl: 'http://localhost:8055',
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
import { useLessonPlans } from './useLessonPlans'

describe('useLessonPlans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('fetchPlans', () => {
    it('should fetch lesson plans successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockPlans,
        meta: { total: 2, limit: 20, offset: 0 },
      })

      const { plans, total, fetchPlans } = useLessonPlans()
      await fetchPlans()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(plans.value).toEqual(mockPlans)
      expect(total.value).toBe(2)
    })

    it('should support filtering by is_template', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockPlans[0]],
        meta: { total: 1, limit: 20, offset: 0 },
      })

      const { fetchPlans } = useLessonPlans()
      await fetchPlans({ is_template: false })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans',
        expect.objectContaining({
          query: { is_template: false },
        })
      )
    })

    it('should support search query', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockPlans,
        meta: { total: 2, limit: 20, offset: 0 },
      })

      const { fetchPlans } = useLessonPlans()
      await fetchPlans({ search: '上肢' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans',
        expect.objectContaining({
          query: { search: '上肢' },
        })
      )
    })

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { plans, total, fetchPlans } = useLessonPlans()
      await fetchPlans()

      expect(plans.value).toEqual([])
      expect(total.value).toBe(0)
    })
  })

  describe('fetchTemplates', () => {
    it('should fetch templates successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockTemplates,
        categories: ['力量訓練', '有氧', '伸展'],
      })

      const { templates, categories, fetchTemplates } = useLessonPlans()
      await fetchTemplates()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans/templates',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(templates.value).toEqual(mockTemplates)
      expect(categories.value).toEqual(['力量訓練', '有氧', '伸展'])
    })

    it('should support category filter', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockTemplates,
        categories: ['力量訓練'],
      })

      const { fetchTemplates } = useLessonPlans()
      await fetchTemplates({ category: '力量訓練' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans/templates',
        expect.objectContaining({
          query: { category: '力量訓練' },
        })
      )
    })
  })

  describe('getPlan', () => {
    it('should fetch plan details successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockPlans[0],
      })

      const { getPlan } = useLessonPlans()
      const result = await getPlan('plan-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans/plan-1',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(result).toEqual(mockPlans[0])
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getPlan } = useLessonPlans()
      const result = await getPlan('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('createPlan', () => {
    it('should create a plan successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教案已建立',
        data: { id: 'plan-3', title: 'New Plan' },
      })

      const { createPlan } = useLessonPlans()
      const result = await createPlan({
        title: 'New Plan',
        objectives: ['Objective 1'],
        duration_minutes: 60,
      })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans',
        expect.objectContaining({
          method: 'POST',
          body: {
            title: 'New Plan',
            objectives: ['Objective 1'],
            duration_minutes: 60,
          },
        })
      )
    })

    it('should handle create error', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '建立教案失敗' },
      })

      const { createPlan } = useLessonPlans()
      const result = await createPlan({ title: 'New Plan' })

      expect(result.success).toBe(false)
      expect(result.message).toBe('建立教案失敗')
    })
  })

  describe('updatePlan', () => {
    it('should update a plan successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教案已更新',
      })

      const { updatePlan } = useLessonPlans()
      const result = await updatePlan('plan-1', {
        title: 'Updated Title',
        objectives: ['New Objective'],
      })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans/plan-1',
        expect.objectContaining({
          method: 'PUT',
          body: {
            title: 'Updated Title',
            objectives: ['New Objective'],
          },
        })
      )
    })
  })

  describe('deletePlan', () => {
    it('should delete a plan successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教案已刪除',
      })

      const { deletePlan } = useLessonPlans()
      const result = await deletePlan('plan-1')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans/plan-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  describe('copyPlan', () => {
    it('should copy a template successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教案已複製',
        data: { id: 'plan-4', title: '下肢訓練範本 (複製)' },
      })

      const { copyPlan } = useLessonPlans()
      const result = await copyPlan('plan-2')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans/plan-2/copy',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('should copy with custom title', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '教案已複製',
        data: { id: 'plan-4', title: 'Custom Title' },
      })

      const { copyPlan } = useLessonPlans()
      const result = await copyPlan('plan-2', { title: 'Custom Title' })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8055/gym/lesson-plans/plan-2/copy',
        expect.objectContaining({
          body: { title: 'Custom Title' },
        })
      )
    })
  })
})
