/**
 * 課程管理 Composable
 * 管理課程定義的 CRUD 操作
 */

import type { Class } from '~/types/schema'
import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

export const useClasses = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
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

      if (branchId) filter.branch_id = branchId
      if (categoryId) filter.category_id = categoryId
      if (typeof isActive === 'boolean') filter.is_active = isActive
      if (difficulty) filter.difficulty_level = difficulty

      const { data, total } = await readItems<Class>('classes', {
        page,
        limit,
        search,
        filter,
        sort: 'date_created',
        sortOrder: 'desc'
      })

      classes.value = data
      totalCount.value = total
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
      const data = await readItem<Class>('classes', id)
      return data
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
  const createClassItem = async (classData: Partial<Class>): Promise<Class | null> => {
    try {
      const data = await createItem<Class>('classes', classData)
      return data
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
  const updateClassItem = async (id: string, classData: Partial<Class>): Promise<Class | null> => {
    try {
      const data = await updateItem<Class>('classes', id, classData)
      return data
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
  const deleteClassItem = async (id: string): Promise<boolean> => {
    try {
      const success = await deleteItem('classes', id)
      return success
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
      const result = await updateItem<Class>('classes', id, { is_active: isActive })
      return result !== null
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
      if (branchId) filter.branch_id = branchId

      const [totalResult, activeResult] = await Promise.all([
        readItems<Class>('classes', { filter, limit: 1 }),
        readItems<Class>('classes', { filter: { ...filter, is_active: true }, limit: 1 })
      ])

      return {
        total: totalResult.total,
        active: activeResult.total
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
    createClass: createClassItem,
    updateClass: updateClassItem,
    deleteClass: deleteClassItem,
    toggleClassActive,
    getClassStats
  }
}
