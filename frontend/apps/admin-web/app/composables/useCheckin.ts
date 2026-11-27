import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { MESSAGES } from '~/constants'

// =============================================================================
// Wire format of the staff check-ins API (backend/src/routes/check-ins.ts) and of
// GET /api/members/:id/contracts (backend/src/routes/members.ts)
// =============================================================================

export type CheckinMethod = 'QR_CODE' | 'MANUAL' | 'CARD'

export interface CheckinMember {
  id: string
  fullName: string
  memberCode: string
}

/** GET /api/check-ins item */
interface ApiCheckinListItem {
  id: string
  memberId: string
  branchId: string
  contractId: string | null
  checkInTime: string
  checkInType: string
  checkInMethod: string | null
  member: CheckinMember
  branch: { id: string; name: string }
}

/** The contract an entry was recorded against, as POST /api/check-ins returns it */
export interface CheckinContractSummary {
  id: string
  contractNo: string
  planName: string | null
  planType: 'TIME_BASED' | 'COUNT_BASED' | null
  /** sessions left after this entry (null for TIME_BASED) */
  remainingCounts: number | null
  /** true when this entry used one session of a COUNT_BASED contract */
  countDeducted: boolean
}

/** POST /api/check-ins data (201 for a new entry, 200 with alreadyCheckedIn for a same-day repeat) */
interface ApiCheckinCreated {
  id: string
  memberId: string
  branchId: string
  contractId: string | null
  checkInTime: string
  member: CheckinMember & { phone?: string; email?: string | null; status?: string }
  contract?: CheckinContractSummary
  alreadyCheckedIn?: boolean
}

/** GET /api/members/:id/contracts item: the contract row with its plan joined */
interface ApiMemberContract {
  id: string
  contractNo: string
  status: string
  startDate: string
  endDate: string
  remainingCounts: number | null
  plan: { id: string; name: string; planType: 'TIME_BASED' | 'COUNT_BASED' } | null
}

export interface CheckinRecord {
  id: string
  member: CheckinMember
  time: string
  branchId: string
}

export interface CheckinResult {
  record: CheckinRecord
  /** the member had already entered this branch today; nothing new was recorded */
  alreadyCheckedIn: boolean
  contract: CheckinContractSummary | null
}

/** The contract the backend will admit the member on (same rule as POST /api/check-ins) */
export interface ActiveContract {
  id: string
  contractNo: string
  startDate: string
  endDate: string
  remainingCounts: number | null
  plan: ApiMemberContract['plan']
  /** COUNT_BASED with no sessions left: the backend refuses entry */
  exhausted: boolean
}

export type QrCheckinResult =
  | ({ success: true; member: CheckinMember } & CheckinResult)
  | { success: false; message: string }

/** Backend error text when it is a readable message, otherwise the fallback */
const errorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}

/** YYYY-MM-DD of the local day */
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Today's bounds as ISO timestamps (local day) */
const getTodayRange = () => {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  }
}

/**
 * Picks the contract POST /api/check-ins would use: ACTIVE, in date, latest end date first.
 * A COUNT_BASED one with no sessions left is still returned (flagged), so the desk can say why.
 */
export const pickActiveContract = (rows: ApiMemberContract[], today = localDate()): ActiveContract | null => {
  const candidate = rows
    .filter(c => c.status === 'ACTIVE' && c.startDate <= today && c.endDate >= today)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0]
  if (!candidate) return null
  return {
    id: candidate.id,
    contractNo: candidate.contractNo,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    remainingCounts: candidate.remainingCounts ?? null,
    plan: candidate.plan ?? null,
    exhausted: candidate.plan?.planType === 'COUNT_BASED' && (candidate.remainingCounts ?? 0) <= 0
  }
}

const inFlightTodayCheckinsMap = new Map<string, Promise<void>>()
const inFlightMemberContractMap = new Map<string, Promise<ActiveContract | null>>()
const inFlightHasCheckedInMap = new Map<string, Promise<boolean>>()

export const useCheckin = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()
  const todayCheckins = useState<CheckinRecord[]>('today_checkins', () => [])
  const isLoading = useState('checkin_loading', () => false)
  const todayCount = useState('checkin_today_count', () => 0)

  // Fetch today's check-in records
  const fetchTodayCheckins = async (branchId?: string, force = false) => {
    const key = branchId || '__all__'
    if (!force && inFlightTodayCheckinsMap.has(key)) {
      return inFlightTodayCheckinsMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { start, end } = getTodayRange()

      try {
        const response = await apiFetch<ApiCheckinListItem[]>('/check-ins', {
          params: { startDate: start, endDate: end, limit: 50, branchId }
        })
        const rows = response.data || []
        todayCheckins.value = rows.map(row => ({
          id: row.id,
          member: row.member,
          time: row.checkInTime,
          branchId: row.branchId
        }))
        todayCount.value = response.pagination?.total ?? rows.length
      } catch (error) {
        handleError(error, {
          context: 'useCheckin.fetchTodayCheckins',
          customMessage: '載入今日入場紀錄失敗'
        })
        todayCheckins.value = []
        todayCount.value = 0
      } finally {
        isLoading.value = false
        inFlightTodayCheckinsMap.delete(key)
      }
    })()

    inFlightTodayCheckinsMap.set(key, promise)
    return promise
  }

  /** POST /api/check-ins; throws with the backend's reason */
  const postCheckin = async (options: {
    memberId: string
    branchId: string
    contractId?: string
    checkInMethod?: CheckinMethod
  } | {
    /** the raw string scanned from the member's QR: signed and verified by the backend */
    qrToken: string
    branchId?: string
  }): Promise<CheckinResult> => {
    const body = 'qrToken' in options
      ? { qrToken: options.qrToken, ...(options.branchId ? { branchId: options.branchId } : {}) }
      : {
          memberId: options.memberId,
          branchId: options.branchId,
          checkInMethod: options.checkInMethod ?? 'MANUAL',
          ...(options.contractId ? { contractId: options.contractId } : {})
        }
    const { data } = await apiFetch<ApiCheckinCreated>('/check-ins', { method: 'POST', body })
    if (!data) throw new Error(MESSAGES.ERRORS.CHECKIN)

    const record: CheckinRecord = {
      id: data.id,
      member: { id: data.member.id, fullName: data.member.fullName, memberCode: data.member.memberCode },
      time: data.checkInTime,
      branchId: data.branchId
    }
    const alreadyCheckedIn = data.alreadyCheckedIn === true

    if (!alreadyCheckedIn) {
      todayCheckins.value = [record, ...todayCheckins.value]
      todayCount.value++
    }

    return { record, alreadyCheckedIn, contract: data.contract ?? null }
  }

  /**
   * POST /api/check-ins. The backend validates the ACTIVE contract and the sessions left,
   * deducts one session of a COUNT_BASED contract, and reports what is left.
   * Returns null after showing the backend's reason (e.g. 會員無有效合約 / 剩餘次數不足).
   */
  const performCheckin = async (options: {
    memberId: string
    branchId: string
    contractId?: string
    checkInMethod?: CheckinMethod
  }): Promise<CheckinResult | null> => {
    try {
      return await postCheckin(options)
    } catch (error) {
      handleError(error, {
        context: 'useCheckin.performCheckin',
        customMessage: errorMessage(error, MESSAGES.ERRORS.CHECKIN)
      })
      return null
    }
  }

  /** The contract the member would be admitted on, from GET /api/members/:id/contracts */
  const getMemberActiveContract = async (memberId: string): Promise<ActiveContract | null> => {
    const existing = inFlightMemberContractMap.get(memberId)
    if (existing) return existing

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiMemberContract[]>(`/members/${memberId}/contracts`)
        return pickActiveContract(data || [])
      } catch (error) {
        handleError(error, {
          context: 'useCheckin.getMemberActiveContract',
          showToast: false
        })
        return null
      } finally {
        inFlightMemberContractMap.delete(memberId)
      }
    })()

    inFlightMemberContractMap.set(memberId, promise)
    return promise
  }

  // Check if member has already checked in today
  const hasCheckedInToday = async (memberId: string, branchId?: string): Promise<boolean> => {
    const flightKey = `${memberId}_${branchId || ''}`
    const existing = inFlightHasCheckedInMap.get(flightKey)
    if (existing) return existing

    const promise = (async () => {
      const { start, end } = getTodayRange()

      try {
        const response = await apiFetch<ApiCheckinListItem[]>('/check-ins', {
          params: { memberId, startDate: start, endDate: end, limit: 1, branchId }
        })
        return (response.pagination?.total ?? response.data?.length ?? 0) > 0
      } catch (error) {
        handleError(error, {
          context: 'useCheckin.hasCheckedInToday',
          showToast: false
        })
        return false
      } finally {
        inFlightHasCheckedInMap.delete(flightKey)
      }
    })()

    inFlightHasCheckedInMap.set(flightKey, promise)
    return promise
  }

  /**
   * Front-desk QR check-in: the member shows the QR from the member app, staff scans it.
   * The QR is a short-lived token signed by the backend; it goes to POST /api/check-ins as is,
   * and the backend verifies it (signature / 30 s expiry / this gym / one use) and names the member.
   * `branchId` falls back to the member's own branch on the backend when the staff account has none.
   */
  const verifyQrCheckin = async (options: { payload: string; branchId?: string }): Promise<QrCheckinResult> => {
    const qrToken = options.payload.trim()
    if (!qrToken) return { success: false, message: '無效的 QR Code 格式' }

    try {
      const result = await postCheckin({ qrToken, branchId: options.branchId })
      return { success: true, member: result.record.member, ...result }
    } catch (error) {
      // The page shows the reason next to the scanner (過期 / 無效 / 他館 / 已使用 ...)
      handleError(error, { context: 'useCheckin.verifyQrCheckin', showToast: false })
      return { success: false, message: errorMessage(error, MESSAGES.ERRORS.CHECKIN) }
    }
  }

  return {
    todayCheckins,
    isLoading,
    todayCount,
    fetchTodayCheckins,
    performCheckin,
    getMemberActiveContract,
    hasCheckedInToday,
    verifyQrCheckin
  }
}
