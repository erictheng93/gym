/**
 * 課程類別管理 Composable
 * 管理課程類別的 CRUD 操作
 */

import type { ClassCategory } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

export const useClassCategories = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
  const { handleError } = useErrorHandler()
  const categories = useState<ClassCategory[]>('class_categories', () => [])
  const isLoading = useState('class_categories_loading', () => false)
  const totalCount = useState('class_categories_total', () => 0)

  /**
   * 獲取課程類別列表
   */
  const fetchCategories = async (options?: {
    parentId?: string | null
    isActive?: boolean
    search?: string
    limit?: number
    page?: number
  }) => {
    isLoading.value = true
    const { parentId, isActive, search, limit = 100, page = 1 } = options || {}

    try {
      const filter: Record<string, unknown> = {}

      // 篩選父類別
      if (parentId === null) {
        filter.parent_id_null = true
      } else if (parentId) {
        filter.parent_id = parentId
      }

      // 篩選啟用狀態
      if (isActive !== undefined) {
        filter.is_active = isActive
      }

      const { data, total } = await readItems<ClassCategory>('class_categories', {
        page,
        limit,
        search,
        filter,
        sort: 'sort'
      })

      categories.value = data
      totalCount.value = total
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.fetchCategories',
        customMessage: MESSAGES.ERRORS.CATEGORY_FETCH_FAILED
      })
      categories.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 獲取所有根類別（用於樹狀選擇器）
   */
  const fetchRootCategories = async () => {
    try {
      const { data } = await readItems<ClassCategory>('class_categories', {
        filter: {
          parent_id_null: true,
          is_active: true
        },
        sort: 'sort'
      })
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.fetchRootCategories',
        customMessage: MESSAGES.ERRORS.CATEGORY_FETCH_FAILED
      })
      return []
    }
  }

  /**
   * 獲取類別樹（包含子類別）
   */
  const fetchCategoryTree = async () => {
    try {
      const { data } = await readItems<ClassCategory>('class_categories', {
        filter: {
          is_active: true,
          status: 'published'
        },
        limit: 1000,
        sort: 'sort'
      })

      // 建構樹狀結構
      const items = data
      const rootItems = items.filter(item => !item.parent_id)

      const buildTree = (parentId: string | null): ClassCategory[] => {
        return items
          .filter(item => item.parent_id === parentId)
          .map(item => ({
            ...item,
            children: buildTree(item.id)
          }))
      }

      return rootItems.map(item => ({
        ...item,
        children: buildTree(item.id)
      }))
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.fetchCategoryTree',
        customMessage: MESSAGES.ERRORS.CATEGORY_FETCH_FAILED
      })
      return []
    }
  }

  /**
   * 獲取單一類別
   */
  const getCategory = async (id: string) => {
    try {
      const data = await readItem<ClassCategory>('class_categories', id)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.getCategory',
        customMessage: MESSAGES.ERRORS.CATEGORY_FETCH_FAILED
      })
      return null
    }
  }

  /**
   * 建立類別
   */
  const createCategory = async (category: Partial<ClassCategory>) => {
    try {
      const data = await createItem<ClassCategory>('class_categories', category)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.createCategory',
        customMessage: MESSAGES.ERRORS.CATEGORY_CREATE_FAILED
      })
      return null
    }
  }

  /**
   * 更新類別
   */
  const updateCategoryItem = async (id: string, category: Partial<ClassCategory>) => {
    try {
      const data = await updateItem<ClassCategory>('class_categories', id, category)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.updateCategory',
        customMessage: MESSAGES.ERRORS.CATEGORY_UPDATE_FAILED
      })
      return null
    }
  }

  /**
   * 刪除類別
   */
  const deleteCategoryItem = async (id: string) => {
    try {
      const success = await deleteItem('class_categories', id)
      return success
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.deleteCategory',
        customMessage: MESSAGES.ERRORS.CATEGORY_DELETE_FAILED
      })
      return false
    }
  }

  /**
   * 取得類別統計
   */
  const getCategoryStats = async () => {
    try {
      const [totalResult, activeResult, rootResult] = await Promise.all([
        readItems<ClassCategory>('class_categories', { limit: 1 }),
        readItems<ClassCategory>('class_categories', {
          filter: { is_active: true },
          limit: 1
        }),
        readItems<ClassCategory>('class_categories', {
          filter: { parent_id_null: true },
          limit: 1
        })
      ])

      return {
        total: totalResult.total,
        active: activeResult.total,
        root: rootResult.total
      }
    } catch (error) {
      handleError(error, {
        context: 'useClassCategories.getCategoryStats',
        showToast: false
      })
      return { total: 0, active: 0, root: 0 }
    }
  }

  return {
    categories,
    isLoading,
    totalCount,
    fetchCategories,
    fetchRootCategories,
    fetchCategoryTree,
    getCategory,
    createCategory,
    updateCategory: updateCategoryItem,
    deleteCategory: deleteCategoryItem,
    getCategoryStats
  }
}
