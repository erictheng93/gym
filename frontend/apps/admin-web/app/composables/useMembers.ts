import type { Member } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'
import { useFetch } from '~/composables/core/useFetch'

export const useMembers = () => {
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()

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
    const { page = 1, limit = 20, search, branchId, status } = options || {}

    try {
      const result = await readItems<Member>('members', {
        page,
        limit,
        search,
        filter: {
          branchId,
          status
        },
        sort: 'dateCreated',
        sortOrder: 'desc'
      })

      members.value = result.data
      totalCount.value = result.total
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
      return await readItem<Member>('members', id)
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
      const data = await createItem<Member>('members', member)
      invalidateCache([CACHE_KEYS.MEMBERS])
      return data
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
      const data = await updateItem<Member>('members', id, member)
      invalidateCache([CACHE_KEYS.MEMBERS])
      return data
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
      const result = await deleteItem('members', id)
      if (result) {
        invalidateCache([CACHE_KEYS.MEMBERS, CACHE_KEYS.CONTRACTS])
      }
      return result
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
