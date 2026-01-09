import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type { Contract } from '~/types/directus'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'
import {
  buildPaginationParams,
  buildSearchFilter,
  buildFilter,
  mergeFilters
} from '~/utils/api-helpers'

export const useContracts = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()
  const contracts = useState<Contract[]>('contracts', () => [])
  const isLoading = useState('contracts_loading', () => false)
  const totalCount = useState('contracts_total', () => 0)

  const fetchContracts = async (options?: {
    page?: number
    limit?: number
    memberId?: string
    branchId?: string
    status?: string
    search?: string
  }) => {
    isLoading.value = true
    const { memberId, branchId, status, search } = options || {}

    try {
      // 使用工具函數建構分頁和過濾器
      const { limit, offset } = buildPaginationParams(options)

      const filter = mergeFilters(
        buildSearchFilter(search, ['contract_no']),
        buildFilter([
          { field: 'member_id', value: memberId },
          { field: 'branch_id', value: branchId },
          { field: 'contract_status', value: status }
        ])
      )

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('contracts', {
            filter,
            fields: ['*', 'member_id.full_name', 'member_id.member_code', 'plan_id.name', 'branch_id.name'],
            sort: ['-date_created'],
            limit,
            offset
          })
        ),
        directus.request(
          aggregate('contracts', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      contracts.value = data as Contract[]
      totalCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      handleError(error, {
        context: 'useContracts.fetchContracts',
        customMessage: MESSAGES.ERRORS.CONTRACT_FETCH_FAILED
      })
      contracts.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  const getContract = async (id: string) => {
    try {
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
    } catch (error) {
      handleError(error, {
        context: 'useContracts.getContract',
        customMessage: MESSAGES.ERRORS.CONTRACT_FETCH_FAILED
      })
      return null
    }
  }

  const createContract = async (contract: Partial<Contract>) => {
    try {
      const data = await directus.request(createItem('contracts', contract))
      // 失效合約和會員緩存（新合約可能影響會員狀態）
      invalidateCache([CACHE_KEYS.CONTRACTS, CACHE_KEYS.MEMBERS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useContracts.createContract',
        customMessage: MESSAGES.ERRORS.CONTRACT_CREATE_FAILED
      })
      return null
    }
  }

  const updateContract = async (id: string, contract: Partial<Contract>) => {
    try {
      const data = await directus.request(updateItem('contracts', id, contract))
      // 失效合約和會員緩存（合約狀態變更可能影響會員狀態）
      invalidateCache([CACHE_KEYS.CONTRACTS, CACHE_KEYS.MEMBERS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useContracts.updateContract',
        customMessage: MESSAGES.ERRORS.CONTRACT_UPDATE_FAILED
      })
      return null
    }
  }

  // 統計資料
  const getContractStats = async (branchId?: string) => {
    const defaultStats = { active: 0, expired: 0, draft: 0 }

    try {
      const baseFilter = buildFilter([
        { field: 'branch_id', value: branchId }
      ])

      const [active, expired, draft] = await Promise.all([
        directus.request(aggregate('contracts', {
          aggregate: { count: '*' },
          query: { filter: { ...baseFilter, contract_status: { _eq: 'ACTIVE' } } }
        })),
        directus.request(aggregate('contracts', {
          aggregate: { count: '*' },
          query: { filter: { ...baseFilter, contract_status: { _eq: 'EXPIRED' } } }
        })),
        directus.request(aggregate('contracts', {
          aggregate: { count: '*' },
          query: { filter: { ...baseFilter, contract_status: { _eq: 'DRAFT' } } }
        }))
      ])

      return {
        active: Number(active[0]?.count) || 0,
        expired: Number(expired[0]?.count) || 0,
        draft: Number(draft[0]?.count) || 0
      }
    } catch (error) {
      handleError(error, {
        context: 'useContracts.getContractStats',
        customMessage: MESSAGES.ERRORS.CONTRACT_FETCH_FAILED,
        showToast: false
      })
      return defaultStats
    }
  }

  return {
    contracts,
    isLoading,
    totalCount,
    fetchContracts,
    getContract,
    createContract,
    updateContract,
    getContractStats
  }
}
