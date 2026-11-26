import { useFetch } from '~/composables/core/useFetch'
import type { Contract } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'

const inFlightContractsMap = new Map<string, Promise<void>>()
const inFlightSingleContractMap = new Map<string, Promise<Contract | null>>()
const inFlightContractStatsMap = new Map<string, Promise<{ active: number; expired: number; draft: number }>>()

export const useContracts = () => {
  const { apiFetch, readItems, readItem, createItem, updateItem } = useFetch()
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
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force && inFlightContractsMap.has(key)) {
      return inFlightContractsMap.get(key)
    }

    const promise = (async () => {
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
        inFlightContractsMap.delete(key)
      }
    })()

    inFlightContractsMap.set(key, promise)
    return promise
  }

  const getContract = async (id: string, force = false): Promise<Contract | null> => {
    if (!force && inFlightSingleContractMap.has(id)) {
      return inFlightSingleContractMap.get(id)!
    }

    const promise = (async () => {
      try {
        const data = await readItem<Contract>('contracts', id)
        return data
      } catch (error) {
        handleError(error, {
          context: 'useContracts.getContract',
          customMessage: MESSAGES.ERRORS.CONTRACT_FETCH_FAILED
        })
        return null
      } finally {
        inFlightSingleContractMap.delete(id)
      }
    })()

    inFlightSingleContractMap.set(id, promise)
    return promise
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

  // 啟用草稿合約（DRAFT → ACTIVE，後端同時將會員設為 ACTIVE）
  const activateContract = async (id: string) => {
    try {
      const { data } = await apiFetch<Contract>(`/contracts/${id}/activate`, { method: 'POST' })
      invalidateCache([CACHE_KEYS.CONTRACTS, CACHE_KEYS.MEMBERS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useContracts.activateContract',
        customMessage: MESSAGES.ERRORS.CONTRACT_ACTIVATE_FAILED
      })
      return null
    }
  }

  // 暫停合約：由後端驗證日期、計算天數並延長到期日（同一 transaction 寫入異動紀錄）
  const pauseContract = async (id: string, pause: { startDate: string; endDate: string; reason?: string }) => {
    try {
      const { data } = await apiFetch<Contract>(`/contracts/${id}/pause`, { method: 'POST', body: pause })
      invalidateCache([CACHE_KEYS.CONTRACTS, CACHE_KEYS.MEMBERS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useContracts.pauseContract',
        customMessage: MESSAGES.ERRORS.CONTRACT_PAUSE_FAILED
      })
      return null
    }
  }

  // 統計資料
  const getContractStats = async (branchId?: string, force = false) => {
    const defaultStats = { active: 0, expired: 0, draft: 0 }
    const key = branchId || '__all__'

    if (!force && inFlightContractStatsMap.has(key)) {
      return inFlightContractStatsMap.get(key)!
    }

    const promise = (async () => {
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
      } finally {
        inFlightContractStatsMap.delete(key)
      }
    })()

    inFlightContractStatsMap.set(key, promise)
    return promise
  }

  return {
    contracts,
    isLoading,
    totalCount,
    fetchContracts,
    getContract,
    createContract,
    updateContract,
    activateContract,
    pauseContract,
    getContractStats
  }
}
