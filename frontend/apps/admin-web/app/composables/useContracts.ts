import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type { Contract } from '~/types/directus'

export const useContracts = () => {
  const directus = useDirectus()
  const contracts = useState<Contract[]>('contracts', () => [])
  const isLoading = useState('contracts_loading', () => false)

  const fetchContracts = async (options?: {
    memberId?: string
    branchId?: string
    status?: string
    search?: string
    limit?: number
  }) => {
    isLoading.value = true
    const { memberId, branchId, status, search, limit = 50 } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (memberId) filter.member_id = { _eq: memberId }
      if (branchId) filter.branch_id = { _eq: branchId }
      if (status) filter.contract_status = { _eq: status }

      // Add search filter
      if (search) {
        filter._or = [
          { contract_no: { _icontains: search } },
          { 'member_id': { 'full_name': { _icontains: search } } },
          { 'member_id': { 'member_code': { _icontains: search } } }
        ]
      }

      const data = await directus.request(
        readItems('contracts', {
          filter,
          fields: ['*', 'member_id.full_name', 'member_id.member_code', 'plan_id.name', 'branch_id.name'],
          sort: ['-date_created'],
          limit
        })
      )
      contracts.value = data as Contract[]
    } catch (error) {
      console.error('Failed to fetch contracts:', error)
    } finally {
      isLoading.value = false
    }
  }

  const getContract = async (id: string) => {
    const data = await directus.request(
      readItem('contracts', id, {
        fields: [
          '*',
          'member_id.*',
          'plan_id.*',
          'branch_id.*',
          'sales_person_id.*',
          'logs.*',
          'logs.created_by_employee.id',
          'logs.created_by_employee.full_name',
          'logs.branch_id.id',
          'logs.branch_id.name',
          'logs.original_member_id.id',
          'logs.original_member_id.full_name',
          'logs.target_member_id.id',
          'logs.target_member_id.full_name',
          'payments.*'
        ]
      })
    )
    return data as Contract
  }

  const createContract = async (contract: Partial<Contract>) => {
    // 自動計算 end_date
    if (contract.start_date && contract.plan_id) {
      // 這部分邏輯可以在 Directus Hook 中處理
    }
    const data = await directus.request(createItem('contracts', contract))
    return data
  }

  const updateContract = async (id: string, contract: Partial<Contract>) => {
    const data = await directus.request(updateItem('contracts', id, contract))
    return data
  }

  // 統計資料
  const getContractStats = async (branchId?: string) => {
    const filter: Record<string, unknown> = {}
    if (branchId) filter.branch_id = { _eq: branchId }

    const [active, expired, draft] = await Promise.all([
      directus.request(aggregate('contracts', {
        aggregate: { count: '*' },
        query: { filter: { ...filter, contract_status: { _eq: 'ACTIVE' } } }
      })),
      directus.request(aggregate('contracts', {
        aggregate: { count: '*' },
        query: { filter: { ...filter, contract_status: { _eq: 'EXPIRED' } } }
      })),
      directus.request(aggregate('contracts', {
        aggregate: { count: '*' },
        query: { filter: { ...filter, contract_status: { _eq: 'DRAFT' } } }
      }))
    ])

    return {
      active: Number(active[0]?.count) || 0,
      expired: Number(expired[0]?.count) || 0,
      draft: Number(draft[0]?.count) || 0
    }
  }

  return {
    contracts,
    isLoading,
    fetchContracts,
    getContract,
    createContract,
    updateContract,
    getContractStats
  }
}
