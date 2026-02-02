import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import type { MemberCheckin, Member, Contract, ContractLog } from '~/types/schema'
import { MESSAGES } from '~/constants'

export interface CheckinRecord {
  id: string
  member: Member
  time: string
  contract?: Contract
  branch_id?: string
  countDeducted?: boolean
  remainingCounts?: number | null
}

export interface QrCheckinResult {
  success: boolean
  message: string
  checkin_id?: string
  member?: {
    id: string
    member_code: string
    full_name: string
  }
  contract?: {
    id: string
    contract_no: string
    plan_name?: string
    plan_type?: string
    remaining_counts?: number | null
    end_date?: string
  }
}

export const useCheckin = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { readItems, createItem, updateItem } = useFetch()
  const { handleError } = useErrorHandler()
  const todayCheckins = useState<CheckinRecord[]>('today_checkins', () => [])
  const isLoading = useState('checkin_loading', () => false)
  const todayCount = useState('checkin_today_count', () => 0)

  // Get today's date range in ISO format
  const getTodayRange = () => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return {
      start: startOfDay.toISOString(),
      end: endOfDay.toISOString()
    }
  }

  // Fetch today's check-in records
  const fetchTodayCheckins = async (branchId?: string) => {
    isLoading.value = true
    const { start, end } = getTodayRange()

    try {
      const filter: Record<string, unknown> = {
        check_time_gte: start,
        check_time_lt: end
      }

      if (branchId) {
        filter.branch_id = branchId
      }

      const { data, total } = await readItems<MemberCheckin>('member_checkins', {
        filter,
        sort: 'check_time',
        sortOrder: 'desc',
        limit: 50
      })

      todayCheckins.value = data.map(checkin => ({
        id: checkin.id,
        member: checkin.member as Member,
        time: checkin.check_time,
        contract: checkin.contract as Contract,
        branch_id: checkin.branch_id || undefined
      }))
      todayCount.value = total
    } catch (error) {
      handleError(error, {
        context: 'useCheckin.fetchTodayCheckins',
        customMessage: '載入今日入場紀錄失敗'
      })
      todayCheckins.value = []
      todayCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  // Perform member check-in
  const performCheckin = async (options: {
    memberId: string
    branchId?: string
    contractId?: string
    verifiedBy?: string
  }): Promise<CheckinRecord | null> => {
    const { memberId, branchId, contractId, verifiedBy } = options

    try {
      const checkinData: Partial<MemberCheckin> = {
        member_id: memberId,
        check_time: new Date().toISOString()
      }

      if (branchId) checkinData.branch_id = branchId
      if (contractId) checkinData.contract_id = contractId
      if (verifiedBy) checkinData.verified_by = verifiedBy

      const result = await createItem<MemberCheckin>('member_checkins', checkinData)

      if (!result) {
        throw new Error('Failed to create checkin record')
      }

      // Handle COUNT_BASED contract - deduct remaining counts
      let countDeducted = false
      let remainingCounts: number | null = null

      if (contractId) {
        // Fetch the contract with plan info
        const { data: contracts } = await readItems<Contract>('contracts', {
          filter: { id: contractId },
          limit: 1
        })

        const contract = contracts[0]
        if (contract?.plan?.plan_type === 'COUNT_BASED' && contract.remaining_counts !== null && contract.remaining_counts > 0) {
          // Deduct one count
          const newRemainingCounts = contract.remaining_counts - 1
          await updateItem<Contract>('contracts', contractId, {
            remaining_counts: newRemainingCounts
          })

          // Create contract log for the deduction
          await createItem<ContractLog>('contract_logs', {
            contract_id: contractId,
            log_type: 'CLASS_USED',
            reason: '入場扣堂',
            days_affected: 1,
            created_by_employee: verifiedBy || null,
            branch_id: branchId || null
          } as Partial<ContractLog>)

          countDeducted = true
          remainingCounts = newRemainingCounts
        }
      }

      // Fetch the created record with relations
      const { data: createdRecords } = await readItems<MemberCheckin>('member_checkins', {
        filter: { id: result.id },
        limit: 1
      })

      const created = createdRecords[0]
      if (!created) {
        throw new Error('Failed to fetch created checkin record')
      }

      const checkinRecord: CheckinRecord = {
        id: created.id,
        member: created.member as Member,
        time: created.check_time,
        contract: created.contract as Contract,
        branch_id: created.branch_id || undefined,
        countDeducted,
        remainingCounts
      }

      // Add to today's list
      todayCheckins.value.unshift(checkinRecord)
      todayCount.value++

      return checkinRecord
    } catch (error) {
      handleError(error, {
        context: 'useCheckin.performCheckin',
        customMessage: MESSAGES.ERRORS.CHECKIN
      })
      throw error
    }
  }

  // Get member's active contract for check-in
  const getMemberActiveContract = async (memberId: string): Promise<Contract | null> => {
    try {
      const now = new Date().toISOString().split('T')[0]
      const { data: contracts } = await readItems<Contract>('contracts', {
        filter: {
          member_id: memberId,
          contract_status: 'ACTIVE',
          start_date_lte: now,
          end_date_gte: now
        },
        sort: 'start_date',
        sortOrder: 'desc',
        limit: 1
      })

      const contract = contracts[0]
      // For COUNT_BASED contracts, also check if there are remaining counts
      if (contract?.plan?.plan_type === 'COUNT_BASED' && contract.remaining_counts !== null && contract.remaining_counts <= 0) {
        // No remaining counts - treat as no active contract for check-in
        return null
      }

      return contract || null
    } catch (error) {
      handleError(error, {
        context: 'useCheckin.getMemberActiveContract',
        showToast: false
      })
      return null
    }
  }

  // Fetch check-in history for a specific member
  const fetchMemberCheckinHistory = async (memberId: string, limit = 20) => {
    try {
      const { data } = await readItems<MemberCheckin>('member_checkins', {
        filter: { member_id: memberId },
        sort: 'check_time',
        sortOrder: 'desc',
        limit
      })
      return data
    } catch (error) {
      handleError(error, {
        context: 'useCheckin.fetchMemberCheckinHistory',
        showToast: false
      })
      return []
    }
  }

  // Check if member has already checked in today
  const hasCheckedInToday = async (memberId: string, branchId?: string): Promise<boolean> => {
    const { start, end } = getTodayRange()
    const filter: Record<string, unknown> = {
      member_id: memberId,
      check_time_gte: start,
      check_time_lt: end
    }

    if (branchId) {
      filter.branch_id = branchId
    }

    try {
      const { total } = await readItems<MemberCheckin>('member_checkins', {
        filter,
        limit: 1
      })
      return total > 0
    } catch (error) {
      handleError(error, {
        context: 'useCheckin.hasCheckedInToday',
        showToast: false
      })
      return false
    }
  }

  /**
   * Verify QR code and perform check-in via backend API
   * This uses the /gym/checkin/qr-verify endpoint which handles:
   * - QR code validation (30 second expiry)
   * - Member lookup by member_code
   * - Contract validation
   * - Check-in record creation
   * - Count deduction for COUNT_BASED contracts
   */
  const verifyQrCheckin = async (options: {
    payload: string | object
    branchId?: string
    verifiedBy?: string
  }): Promise<QrCheckinResult> => {
    const { payload, branchId, verifiedBy } = options

    try {
      const response = await $fetch<QrCheckinResult>(`${apiUrl}/api/admin/checkin/qr-verify`, {
        method: 'POST',
        body: {
          payload,
          branch_id: branchId,
          verified_by: verifiedBy
        }
      })

      if (response.success && response.member) {
        // Refresh today's checkins
        await fetchTodayCheckins(branchId)
      }

      return response
    } catch (error: unknown) {
      handleError(error, {
        context: 'useCheckin.verifyQrCheckin',
        showToast: false
      })

      // Handle $fetch error response
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || 'QR Code 驗證失敗'
        }
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'QR Code 驗證失敗'
      }
    }
  }

  /**
   * Parse QR code payload
   * Expected format: { m: member_code, t: timestamp, c: contract_id }
   */
  const parseQrPayload = (data: string): { memberCode: string; timestamp: number; contractId?: string } | null => {
    try {
      const parsed = JSON.parse(data)
      if (!parsed.m || !parsed.t) {
        return null
      }
      return {
        memberCode: parsed.m,
        timestamp: Number(parsed.t),
        contractId: parsed.c || undefined
      }
    } catch {
      return null
    }
  }

  /**
   * Check if QR code is expired (30 seconds validity)
   */
  const isQrExpired = (timestamp: number): boolean => {
    const now = Date.now()
    return Math.abs(now - timestamp) > 30000
  }

  return {
    todayCheckins,
    isLoading,
    todayCount,
    fetchTodayCheckins,
    performCheckin,
    getMemberActiveContract,
    fetchMemberCheckinHistory,
    hasCheckedInToday,
    verifyQrCheckin,
    parseQrPayload,
    isQrExpired
  }
}
