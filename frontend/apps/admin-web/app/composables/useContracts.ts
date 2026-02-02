import { useFetch } from '~/composables/core/useFetch'
import type { Contract } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'

export const useContracts = () => {
  const { readItems, readItem, createItem, updateItem } = useFetch()
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
    const { page = 1, limit = 20, memberId, branchId, status, search } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (memberId) filter.member_id = memberId
      if (branchId) filter.branch_id = branchId
      if (status) filter.contract_status = status

      const { data, total } = await readItems<Contract>('contracts', {
        page,
        limit,
        search,
        filter,
        sort: 'date_created',
        sortOrder: 'desc'
      })

      contracts.value = data
      totalCount.value = total
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
      const data = await readItem<Contract>('contracts', id)
      return data
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
      const data = await createItem<Contract>('contracts', contract)
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
      const data = await updateItem<Contract>('contracts', id, contract)
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
      // Fetch stats for each status in parallel
      const [activeResult, expiredResult, draftResult] = await Promise.all([
        readItems<Contract>('contracts', {
          limit: 1,
          filter: {
            ...(branchId && { branch_id: branchId }),
            contract_status: 'ACTIVE'
          }
        }),
        readItems<Contract>('contracts', {
          limit: 1,
          filter: {
            ...(branchId && { branch_id: branchId }),
            contract_status: 'EXPIRED'
          }
        }),
        readItems<Contract>('contracts', {
          limit: 1,
          filter: {
            ...(branchId && { branch_id: branchId }),
            contract_status: 'DRAFT'
          }
        })
      ])

      return {
        active: activeResult.total,
        expired: expiredResult.total,
        draft: draftResult.total
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
