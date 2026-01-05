import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { ClassCategory } from '~/types/directus'
import { MESSAGES } from '~/constants'

export const useClassCategories = () => {
  const directus = useDirectus()
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
        filter.parent_id = { _null: true }
      } else if (parentId) {
        filter.parent_id = { _eq: parentId }
      }

      // 篩選啟用狀態
      if (isActive !== undefined) {
        filter.is_active = { _eq: isActive }
      }

      // 搜尋
      if (search) {
        filter._or = [
          { name: { _icontains: search } },
          { name_en: { _icontains: search } },
          { code: { _icontains: search } }
        ]
      }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('class_categories', {
            filter,
            fields: ['*', 'parent.id', 'parent.name', 'parent.code', 'children.id', 'owner_branch.id', 'owner_branch.name'],
            sort: ['sort', 'name'],
            limit,
            offset: (page - 1) * limit
          })
        ),
        directus.request(
          aggregate('class_categories', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      categories.value = data as ClassCategory[]
      totalCount.value = Number(countResult[0]?.count) || 0
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
      const data = await directus.request(
        readItems('class_categories', {
          filter: {
            parent_id: { _null: true },
            is_active: { _eq: true }
          },
          fields: ['id', 'code', 'name', 'name_en', 'icon', 'color'],
          sort: ['sort', 'name']
        })
      )
      return data as ClassCategory[]
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
      const data = await directus.request(
        readItems('class_categories', {
          filter: {
            is_active: { _eq: true },
            status: { _eq: 'published' }
          },
          fields: ['id', 'code', 'name', 'name_en', 'parent_id', 'icon', 'color', 'sort', 'description'],
          sort: ['sort', 'name'],
          limit: -1
        })
      )

      // 建構樹狀結構
      const items = data as ClassCategory[]
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
      const data = await directus.request(
        readItem('class_categories', id, {
          fields: ['*', 'parent.id', 'parent.name', 'parent.code', 'owner_branch.id', 'owner_branch.name']
        })
      )
      return data as ClassCategory
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
      const data = await directus.request(createItem('class_categories', category))
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
  const updateCategory = async (id: string, category: Partial<ClassCategory>) => {
    try {
      const data = await directus.request(updateItem('class_categories', id, category))
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
  const deleteCategory = async (id: string) => {
    try {
      await directus.request(deleteItem('class_categories', id))
      return true
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
      const [total, active, rootCount] = await Promise.all([
        directus.request(aggregate('class_categories', { aggregate: { count: '*' } })),
        directus.request(aggregate('class_categories', {
          aggregate: { count: '*' },
          query: { filter: { is_active: { _eq: true } } }
        })),
        directus.request(aggregate('class_categories', {
          aggregate: { count: '*' },
          query: { filter: { parent_id: { _null: true } } }
        }))
      ])

      return {
        total: Number(total[0]?.count) || 0,
        active: Number(active[0]?.count) || 0,
        root: Number(rootCount[0]?.count) || 0
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
    updateCategory,
    deleteCategory,
    getCategoryStats
  }
}
