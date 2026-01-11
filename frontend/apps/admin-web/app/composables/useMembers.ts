import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Member } from '~/types/directus'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'
import {
  buildPaginationParams,
  buildSearchFilter,
  buildFilter,
  mergeFilters
} from '~/utils/api-helpers'

export const useMembers = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()

  const members = useState<Member[]>('members', () => [])
  const isLoading = useState('members_loading', () => false)
  const totalCount = useState('members_total', () => 0)

  const fetchMembers = async (options?: {
    page?: number
    limit?: number
    search?: string
    branchId?: string
    status?: string
  }) => {
    isLoading.value = true
    const { search, branchId, status } = options || {}

    try {
      // 使用工具函數建構分頁和過濾器
      const { limit, offset } = buildPaginationParams(options)

      const filter = mergeFilters(
        buildSearchFilter(search, ['full_name', 'member_code', 'phone']),
        buildFilter([
          { field: 'branch_id', value: branchId },
          { field: 'member_status', value: status }
        ])
      )

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('members', {
            filter,
            fields: ['*', 'branch.name', 'sales_person.full_name'],
            sort: ['-date_created'],
            limit,
            offset
          })
        ),
        directus.request(
          aggregate('members', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      members.value = data as Member[]
      totalCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      handleError(error, {
        context: 'useMembers.fetchMembers',
        customMessage: MESSAGES.ERRORS.MEMBER_FETCH_FAILED
      })
    } finally {
      isLoading.value = false
    }
  }

  const getMember = async (id: string): Promise<Member | null> => {
    try {
      const data = await directus.request(
        readItem('members', id, {
          fields: ['*', 'branch.*', 'sales_person.*', 'contracts.*']
        })
      )
      return data as Member
    } catch (error) {
      handleError(error, {
        context: 'useMembers.getMember',
        customMessage: MESSAGES.ERRORS.MEMBER_FETCH_FAILED
      })
      return null
    }
  }

  const createMember = async (member: Partial<Member>): Promise<Member | null> => {
    try {
      const data = await directus.request(createItem('members', member))
      // 失效會員列表緩存
      invalidateCache([CACHE_KEYS.MEMBERS])
      return data as Member
    } catch (error) {
      handleError(error, {
        context: 'useMembers.createMember',
        customMessage: MESSAGES.ERRORS.MEMBER_CREATE_FAILED
      })
      return null
    }
  }

  const updateMember = async (id: string, member: Partial<Member>): Promise<Member | null> => {
    try {
      const data = await directus.request(updateItem('members', id, member))
      // 失效會員列表緩存
      invalidateCache([CACHE_KEYS.MEMBERS])
      return data as Member
    } catch (error) {
      handleError(error, {
        context: 'useMembers.updateMember',
        customMessage: MESSAGES.ERRORS.MEMBER_UPDATE_FAILED
      })
      return null
    }
  }

  const deleteMember = async (id: string): Promise<boolean> => {
    try {
      await directus.request(deleteItem('members', id))
      // 失效會員和合約緩存（刪除會員可能影響合約）
      invalidateCache([CACHE_KEYS.MEMBERS, CACHE_KEYS.CONTRACTS])
      return true
    } catch (error) {
      handleError(error, {
        context: 'useMembers.deleteMember',
        customMessage: MESSAGES.ERRORS.MEMBER_DELETE_FAILED
      })
      return false
    }
  }

  return {
    members,
    isLoading,
    totalCount,
    fetchMembers,
    getMember,
    createMember,
    updateMember,
    deleteMember
  }
}
