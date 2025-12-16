import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Member } from '~/types/directus'

export const useMembers = () => {
  const directus = useDirectus()
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
      console.error('Failed to fetch members:', error)
    } finally {
      isLoading.value = false
    }
  }

  const getMember = async (id: string) => {
    const data = await directus.request(
      readItem('members', id, {
        fields: ['*', 'branch.*', 'sales_person.*', 'contracts.*']
      })
    )
    return data as Member
  }

  const createMember = async (member: Partial<Member>) => {
    const data = await directus.request(createItem('members', member))
    return data
  }

  const updateMember = async (id: string, member: Partial<Member>) => {
    const data = await directus.request(updateItem('members', id, member))
    return data
  }

  const deleteMember = async (id: string) => {
    await directus.request(deleteItem('members', id))
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
