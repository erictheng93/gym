import { useFetch } from '~/composables/core/useFetch'
import type { PaymentMethod } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'

// =============================================================================
// Wire format of the staff contracts API (backend/src/routes/contracts.ts)
// =============================================================================

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'TRANSFERRED'
export type ContractPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED'
export type ContractLogType = 'PAUSE' | 'RESUME' | 'EXTEND' | 'TRANSFER' | 'CANCEL' | 'CLASS_USED' | 'RENEWAL'

/** A contract row (CONTRACT_RETURNING): camelCase, decimal columns as strings ("3000.00") */
export interface ApiContract {
  id: string
  contractNo: string
  memberId: string
  planId: string
  branchId: string
  salesPersonId: string | null
  status: ContractStatus
  signDate: string | null
  startDate: string
  originalEndDate: string
  endDate: string
  remainingCounts: number | null
  totalAmount: string | number
  paidAmount: string | number
  paymentStatus: ContractPaymentStatus
  /** files.id of the member's signature PNG (POST /contracts/:id/signature) */
  digitalSignature: string | null
  /** Set on the recipient's contract created by a transfer */
  transferredFromContractId?: string | null
  contractPdf?: string | null
  termsAccepted?: boolean
  notes: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface ContractMember {
  id: string
  fullName: string
  memberCode: string | null
  phone?: string | null
  email?: string | null
}

export interface ContractPlan {
  id: string
  name: string
  planType: 'TIME_BASED' | 'COUNT_BASED'
  price?: number
  durationMonths?: number | null
  classCounts?: number | null
  allowPause?: boolean
  allowTransfer?: boolean
}

/** GET /api/contracts item: the contract nested next to its joined member and plan */
export interface ApiContractListRow {
  contract: ApiContract
  member: ContractMember | null
  plan: (Omit<ContractPlan, 'price'> & { price?: string | number }) | null
}

export interface ApiContractLog {
  id: string
  contractId: string
  logType: ContractLogType
  startDate: string | null
  endDate: string | null
  daysAffected: number | null
  reason: string | null
  originalMemberId?: string | null
  targetMemberId?: string | null
  dateCreated: string | null
  createdByName?: string | null
}

/** GET /api/contracts/:id */
export interface ApiContractDetail extends ApiContractListRow {
  branch: { id: string; name: string } | null
  salesPerson: { id: string; fullName: string } | null
  /** Short-lived URL of the signature image; null when unsigned or storage is not configured */
  signatureUrl?: string | null
  logs: ApiContractLog[]
}

/** A contract as the pages use it: flat, amounts as numbers */
export interface ContractView extends Omit<ApiContract, 'totalAmount' | 'paidAmount'> {
  totalAmount: number
  paidAmount: number
  member: ContractMember | null
  plan: ContractPlan | null
}

export interface ContractDetail extends ContractView {
  branch: { id: string; name: string } | null
  salesPerson: { id: string; fullName: string } | null
  signatureUrl: string | null
  logs: ApiContractLog[]
}

/** Query of GET /api/contracts; names match what the handler reads */
export interface ContractListFilters {
  page?: number
  limit?: number
  memberId?: string
  branchId?: string
  status?: ContractStatus | ''
  /** contract no., member name or member code */
  search?: string
}

/** Body of POST /api/contracts; field names match the backend zod schema exactly */
export interface CreateContractInput {
  memberId: string
  planId: string
  branchId: string
  /** YYYY-MM-DD; the backend derives endDate / remainingCounts from the plan */
  startDate: string
  totalAmount: number
  salesPersonId?: string | null
  notes?: string | null
}

/** Body of POST /api/contracts/:id/cancel */
export interface CancelContractInput {
  reason?: string
  /** Positive amount actually paid back; recorded as a COMPLETED REFUND payment in the same transaction */
  refund?: { amount: number; paymentMethod: PaymentMethod } | null
}

/** Body of POST /api/contracts/:id/transfer (manager and above) */
export interface TransferContractInput {
  toMemberId: string
  /** Optional transfer fee, recorded as a COMPLETED INCOME payment on the new contract */
  fee?: number | null
  paymentMethod?: PaymentMethod
  reason?: string
}

const toNumber = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const toNullableNumber = (value: unknown) => (value === null || value === undefined ? null : toNumber(value))

const normalizePlan = (plan: ApiContractListRow['plan']): ContractPlan | null => {
  if (!plan) return null
  return {
    ...plan,
    ...(plan.price !== undefined ? { price: toNumber(plan.price) } : {}),
    ...(plan.durationMonths !== undefined ? { durationMonths: toNullableNumber(plan.durationMonths) } : {}),
    ...(plan.classCounts !== undefined ? { classCounts: toNullableNumber(plan.classCounts) } : {})
  } as ContractPlan
}

export const normalizeContract = (
  contract: ApiContract,
  member: ContractMember | null = null,
  plan: ApiContractListRow['plan'] = null
): ContractView => ({
  ...contract,
  totalAmount: toNumber(contract.totalAmount),
  paidAmount: toNumber(contract.paidAmount),
  member,
  plan: normalizePlan(plan)
})

export const normalizeContractRow = (row: ApiContractListRow): ContractView =>
  normalizeContract(row.contract, row.member ?? null, row.plan ?? null)

export const normalizeContractDetail = (detail: ApiContractDetail): ContractDetail => ({
  ...normalizeContractRow(detail),
  branch: detail.branch ?? null,
  salesPerson: detail.salesPerson ?? null,
  signatureUrl: detail.signatureUrl ?? null,
  logs: detail.logs ?? []
})

/** Backend error text when it is a readable message, otherwise the fallback */
const errorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query[key] = value
  }
  return query
}

type ListResponse = { data?: ApiContractListRow[]; pagination?: { total?: number }; meta?: { total?: number } }

const inFlightContractsMap = new Map<string, Promise<void>>()
const inFlightSingleContractMap = new Map<string, Promise<ContractDetail | null>>()
const inFlightContractStatsMap = new Map<string, Promise<{ active: number; expired: number; draft: number }>>()

export const useContracts = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()
  const contracts = useState<ContractView[]>('contracts', () => [])
  const isLoading = useState('contracts_loading', () => false)
  const totalCount = useState('contracts_total', () => 0)

  const listContracts = async (filters: ContractListFilters) => {
    const response = await apiFetch<ApiContractListRow[]>('/contracts', {
      params: buildQuery({ ...filters })
    }) as unknown as ListResponse
    return {
      rows: (response.data || []).map(normalizeContractRow),
      total: toNumber(response.pagination?.total ?? response.meta?.total)
    }
  }

  const fetchContracts = async (filters: ContractListFilters = {}, force = false) => {
    const key = JSON.stringify(filters)
    if (!force && inFlightContractsMap.has(key)) {
      return inFlightContractsMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { page = 1, limit = 20, ...rest } = filters

      try {
        const { rows, total } = await listContracts({ page, limit, ...rest })
        contracts.value = rows
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

  const getContract = async (id: string, force = false): Promise<ContractDetail | null> => {
    if (!force && inFlightSingleContractMap.has(id)) {
      return inFlightSingleContractMap.get(id)!
    }

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiContractDetail>(`/contracts/${id}`)
        return data?.contract ? normalizeContractDetail(data) : null
      } catch (error) {
        handleError(error, {
          context: 'useContracts.getContract',
          customMessage: errorMessage(error, MESSAGES.ERRORS.CONTRACT_FETCH_FAILED)
        })
        return null
      } finally {
        inFlightSingleContractMap.delete(id)
      }
    })()

    inFlightSingleContractMap.set(id, promise)
    return promise
  }

  /** POST to a contract action; returns the response data, or null after showing the backend's reason */
  const runAction = async <T>(
    path: string,
    body: unknown,
    context: string,
    fallback: string
  ): Promise<T | null> => {
    try {
      const { data } = await apiFetch<T>(path, { method: 'POST', ...(body !== undefined ? { body } : {}) })
      if (!data) throw new Error(fallback)
      // 合約狀態與金額變更會影響會員狀態與付款資料
      invalidateCache([CACHE_KEYS.CONTRACTS, CACHE_KEYS.MEMBERS, CACHE_KEYS.PAYMENTS])
      return data
    } catch (error) {
      handleError(error, { context, customMessage: errorMessage(error, fallback) })
      return null
    }
  }

  /** Creates a DRAFT contract (activate it after payment). Returns null on failure, after showing why. */
  const createContract = async (input: CreateContractInput): Promise<ContractView | null> => {
    const body: CreateContractInput = {
      memberId: input.memberId,
      planId: input.planId,
      branchId: input.branchId,
      startDate: input.startDate,
      totalAmount: input.totalAmount,
      ...(input.salesPersonId ? { salesPersonId: input.salesPersonId } : {}),
      notes: input.notes || null
    }
    const data = await runAction<ApiContract>('/contracts', body, 'useContracts.createContract', MESSAGES.ERRORS.CONTRACT_CREATE_FAILED)
    return data ? normalizeContract(data) : null
  }

  // 啟用草稿合約（DRAFT → ACTIVE，後端同時將會員設為 ACTIVE）
  const activateContract = (id: string) =>
    runAction<ApiContract>(`/contracts/${id}/activate`, undefined, 'useContracts.activateContract', MESSAGES.ERRORS.CONTRACT_ACTIVATE_FAILED)

  // 暫停合約：由後端驗證日期、計算天數並延長到期日（同一 transaction 寫入異動紀錄）
  const pauseContract = (id: string, pause: { startDate: string; endDate: string; reason?: string }) =>
    runAction<ApiContract>(`/contracts/${id}/pause`, pause, 'useContracts.pauseContract', MESSAGES.ERRORS.CONTRACT_PAUSE_FAILED)

  // 恢復合約（PAUSED → ACTIVE，同一 transaction 寫入異動紀錄）
  const resumeContract = (id: string) =>
    runAction<ApiContract>(`/contracts/${id}/resume`, undefined, 'useContracts.resumeContract', MESSAGES.ERRORS.CONTRACT_RESUME_FAILED)

  // 延期合約：結束日由後端順延指定天數並寫入異動紀錄
  const extendContract = (id: string, extend: { days: number; reason?: string }) =>
    runAction<ApiContract>(`/contracts/${id}/extend`, extend, 'useContracts.extendContract', MESSAGES.ERRORS.CONTRACT_EXTEND_FAILED)

  // 終止合約：狀態改為 CANCELLED、寫入異動紀錄與（選填的）退款，全部在同一 transaction
  const cancelContract = (id: string, input: CancelContractInput) =>
    runAction<{ contract: ApiContract; refund: unknown }>(
      `/contracts/${id}/cancel`,
      {
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.refund && input.refund.amount > 0 ? { refund: input.refund } : {})
      },
      'useContracts.cancelContract',
      MESSAGES.ERRORS.CONTRACT_TERMINATE_FAILED
    )

  // 轉讓合約：原合約 → TRANSFERRED，受讓人取得同到期日的新合約（店長以上，同一 transaction）
  const transferContract = async (id: string, input: TransferContractInput) => {
    const data = await runAction<{ original: ApiContract; contract: ApiContract; fee: unknown }>(
      `/contracts/${id}/transfer`,
      {
        toMemberId: input.toMemberId,
        ...(input.fee && input.fee > 0 ? { fee: input.fee, paymentMethod: input.paymentMethod } : {}),
        ...(input.reason ? { reason: input.reason } : {})
      },
      'useContracts.transferContract',
      MESSAGES.ERRORS.CONTRACT_TRANSFER_FAILED
    )
    return data ? { original: normalizeContract(data.original), contract: normalizeContract(data.contract) } : null
  }

  // 續約：以方案目前價格建立新的草稿合約（舊合約不變），回傳新合約
  const renewContract = async (id: string): Promise<ContractView | null> => {
    const data = await runAction<ApiContract>(`/contracts/${id}/renew`, undefined, 'useContracts.renewContract', MESSAGES.ERRORS.CONTRACT_RENEW_FAILED)
    return data ? normalizeContract(data) : null
  }

  // 會員簽名：PNG data URL 上傳至檔案儲存，合約指向該檔案（啟用前必須簽名）
  const signContract = async (id: string, image: string): Promise<ContractView | null> => {
    const data = await runAction<ApiContract>(`/contracts/${id}/signature`, { image }, 'useContracts.signContract', MESSAGES.ERRORS.CONTRACT_SIGNATURE_FAILED)
    return data ? normalizeContract(data) : null
  }

  // 統計資料（每個狀態一次 limit=1 查詢，取 pagination.total）
  const getContractStats = async (branchId?: string, force = false) => {
    const defaultStats = { active: 0, expired: 0, draft: 0 }
    const key = branchId || '__all__'

    if (!force && inFlightContractStatsMap.has(key)) {
      return inFlightContractStatsMap.get(key)!
    }

    const promise = (async () => {
      try {
        const [active, expired, draft] = await Promise.all(
          (['ACTIVE', 'EXPIRED', 'DRAFT'] as const).map(status => listContracts({ status, branchId, limit: 1 }))
        )
        return { active: active!.total, expired: expired!.total, draft: draft!.total }
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
    activateContract,
    pauseContract,
    resumeContract,
    extendContract,
    cancelContract,
    transferContract,
    renewContract,
    signContract,
    getContractStats
  }
}
