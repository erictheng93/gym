import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Member } from '~/types/directus'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

export const useMembers = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()

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
      const filter: Record<string, unknown> = {}

      if (search) {
        filter._or = [
          { full_name: { _contains: search } },
          { member_code: { _contains: search } },
          { phone: { _contains: search } }
        ]
      }
      if (branchId) filter.branch_id = { _eq: branchId }
      if (status) filter.member_status = { _eq: status }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('members', {
            filter,
            fields: ['*', 'branch.name', 'sales_person.full_name'],
            sort: ['-date_created'],
            limit,
            offset: (page - 1) * limit
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
