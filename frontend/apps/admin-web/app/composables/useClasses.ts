/**
 * 課程管理 Composable
 * 管理課程定義的 CRUD 操作
 */

import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Class, ClassCategory } from '~/types/directus'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

export const useClasses = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()

  const classes = useState<Class[]>('classes', () => [])
  const isLoading = useState('classes_loading', () => false)
  const totalCount = useState('classes_total', () => 0)

  /**
   * 獲取課程列表
   */
  const fetchClasses = async (options?: {
    page?: number
    limit?: number
    search?: string
    branchId?: string
    categoryId?: string
    isActive?: boolean
    difficulty?: string
  }) => {
    isLoading.value = true
    const { page = 1, limit = 20, search, branchId, categoryId, isActive, difficulty } = options || {}

    try {
      const filter: Record<string, unknown> = {}

      if (search) {
        filter._or = [
          { name: { _contains: search } },
          { description: { _contains: search } }
        ]
      }
      if (branchId) filter.branch_id = { _eq: branchId }
      if (categoryId) filter.category_id = { _eq: categoryId }
      if (typeof isActive === 'boolean') filter.is_active = { _eq: isActive }
      if (difficulty) filter.difficulty_level = { _eq: difficulty }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('classes', {
            filter,
            fields: [
              '*',
              'branch.id', 'branch.name',
              'instructor.id', 'instructor.full_name',
              'class_category.id', 'class_category.name', 'class_category.color', 'class_category.icon'
            ],
            sort: ['-date_created'],
            limit,
            offset: (page - 1) * limit
          })
        ),
        directus.request(
          aggregate('classes', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      classes.value = data as Class[]
      totalCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      handleError(error, {
        context: 'useClasses.fetchClasses',
        customMessage: '載入課程資料失敗'
      })
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 獲取單一課程詳情
   */
  const getClass = async (id: string): Promise<Class | null> => {
    try {
      const data = await directus.request(
        readItem('classes', id, {
          fields: [
            '*',
            'branch.*',
            'instructor.*',
            'class_category.*'
          ]
        })
      )
      return data as Class
    } catch (error) {
      handleError(error, {
        context: 'useClasses.getClass',
        customMessage: '載入課程資料失敗'
      })
      return null
    }
  }

  /**
   * 新增課程
   */
  const createClass = async (classData: Partial<Class>): Promise<Class | null> => {
    try {
      const data = await directus.request(createItem('classes', classData))
      return data as Class
    } catch (error) {
      handleError(error, {
        context: 'useClasses.createClass',
        customMessage: '建立課程失敗'
      })
      return null
    }
  }

  /**
   * 更新課程
   */
  const updateClass = async (id: string, classData: Partial<Class>): Promise<Class | null> => {
    try {
      const data = await directus.request(updateItem('classes', id, classData))
      return data as Class
    } catch (error) {
      handleError(error, {
        context: 'useClasses.updateClass',
        customMessage: '更新課程失敗'
      })
      return null
    }
  }

  /**
   * 刪除課程
   */
  const deleteClass = async (id: string): Promise<boolean> => {
    try {
      await directus.request(deleteItem('classes', id))
      return true
    } catch (error) {
      handleError(error, {
        context: 'useClasses.deleteClass',
        customMessage: '刪除課程失敗'
      })
      return false
    }
  }

  /**
   * 切換課程啟用狀態
   */
  const toggleClassActive = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      await directus.request(updateItem('classes', id, { is_active: isActive }))
      return true
    } catch (error) {
      handleError(error, {
        context: 'useClasses.toggleClassActive',
        customMessage: isActive ? '啟用課程失敗' : '停用課程失敗'
      })
      return false
    }
  }

  /**
   * 獲取課程統計
   */
  const getClassStats = async (branchId?: string) => {
    try {
      const filter: Record<string, unknown> = {}
      if (branchId) filter.branch_id = { _eq: branchId }

      const [totalResult, activeResult] = await Promise.all([
        directus.request(
          aggregate('classes', {
            aggregate: { count: '*' },
            query: { filter }
          })
        ),
        directus.request(
          aggregate('classes', {
            aggregate: { count: '*' },
            query: { filter: { ...filter, is_active: { _eq: true } } }
          })
        )
      ])

      return {
        total: Number(totalResult[0]?.count) || 0,
        active: Number(activeResult[0]?.count) || 0
      }
    } catch (error) {
      handleError(error, {
        context: 'useClasses.getClassStats',
        showToast: false
      })
      return { total: 0, active: 0 }
    }
  }

  return {
    classes,
    isLoading,
    totalCount,
    fetchClasses,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    toggleClassActive,
    getClassStats
  }
}
