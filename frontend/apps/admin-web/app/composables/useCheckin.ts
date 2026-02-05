import { useErrorHandler } from '~/composables/core/useErrorHandler'
import type { Member, Contract } from '~/types/schema'
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

// API response types
interface CheckInApiResponse {
  success: boolean
  data: Array<{
    id: string
    memberId: string
    branchId: string
    contractId?: string
    checkInTime: string
    checkInType: string
    processedById?: string
    notes?: string
    member: {
      id: string
      fullName: string
      memberCode: string
    }
    branch: {
      id: string
      name: string
    }
    processedBy?: {
      id: string
      fullName: string
    }
  }>
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

interface ContractApiResponse {
  success: boolean
  data: Array<{
    id: string
    memberId: string
    contractNo: string
    status: string
    startDate: string
    endDate: string
    remainingCounts?: number | null
    plan?: {
      id: string
      name: string
      planType: string
    }
  }>
  pagination?: {
    total: number
  }
}

export const useCheckin = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl || 'http://localhost:8056'
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
      // Build query params for the check-ins API
      const params = new URLSearchParams()
      params.append('startDate', start)
      params.append('endDate', end)
      params.append('limit', '50')
      if (branchId) {
        params.append('branchId', branchId)
      }

      const response = await $fetch<CheckInApiResponse>(`${apiUrl}/api/check-ins?${params.toString()}`, {
        credentials: 'include'
      })

      if (response.success && response.data) {
        // Map API response to CheckinRecord format
        todayCheckins.value = response.data.map(checkin => ({
          id: checkin.id,
          member: {
            id: checkin.member.id,
            full_name: checkin.member.fullName,
            member_code: checkin.member.memberCode
          } as Member,
          time: checkin.checkInTime,
          branch_id: checkin.branchId
        }))
        todayCount.value = response.pagination?.total || response.data.length
      } else {
        todayCheckins.value = []
        todayCount.value = 0
      }
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
    const { memberId, branchId, contractId } = options

    try {
      // Call the check-ins API directly
      const response = await $fetch<{
        success: boolean
        message?: string
        data?: {
          id: string
          memberId: string
          branchId: string
          contractId?: string
          checkInTime: string
          member: {
            id: string
            fullName: string
            memberCode: string
          }
          alreadyCheckedIn?: boolean
        }
        error?: string
      }>(`${apiUrl}/api/check-ins`, {
        method: 'POST',
        credentials: 'include',
        body: {
          memberId,
          branchId,
          contractId
        }
      })

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create checkin record')
      }

      const result = response.data

      // Check if count was deducted (backend handles this automatically for COUNT_BASED)
      let countDeducted = false
      let remainingCounts: number | null = null

      // If we have a contractId, fetch the updated contract to get remaining counts
      if (contractId) {
        try {
          const contractResponse = await $fetch<ContractApiResponse>(`${apiUrl}/api/contracts?id=${contractId}&limit=1`, {
            credentials: 'include'
          })
          if (contractResponse.success && contractResponse.data?.[0]) {
            const contract = contractResponse.data[0]
            if (contract.plan?.planType === 'COUNT_BASED') {
              countDeducted = true
              remainingCounts = contract.remainingCounts ?? null
            }
          }
        } catch {
          // Ignore errors fetching contract details
        }
      }

      const checkinRecord: CheckinRecord = {
        id: result.id,
        member: {
          id: result.member.id,
          full_name: result.member.fullName,
          member_code: result.member.memberCode
        } as Member,
        time: result.checkInTime,
        branch_id: result.branchId,
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
      const today = new Date().toISOString().split('T')[0] || ''
      const params = new URLSearchParams()
      params.append('memberId', memberId)
      params.append('status', 'ACTIVE')
      params.append('limit', '1')

      const response = await $fetch<ContractApiResponse>(`${apiUrl}/api/contracts?${params.toString()}`, {
        credentials: 'include'
      })

      if (!response.success || !response.data?.length) {
        return null
      }

      const contractData = response.data[0]
      if (!contractData) {
        return null
      }

      // Check date validity
      if (contractData.startDate > today || contractData.endDate < today) {
        return null
      }

      // For COUNT_BASED contracts, also check if there are remaining counts
      if (contractData.plan?.planType === 'COUNT_BASED' &&
          contractData.remainingCounts !== null &&
          contractData.remainingCounts !== undefined &&
          contractData.remainingCounts <= 0) {
        // No remaining counts - treat as no active contract for check-in
        return null
      }

      // Map to Contract format expected by the UI
      return {
        id: contractData.id,
        contract_no: contractData.contractNo,
        contract_status: contractData.status,
        start_date: contractData.startDate,
        end_date: contractData.endDate,
        remaining_counts: contractData.remainingCounts ?? null,
        plan: contractData.plan ? {
          id: contractData.plan.id,
          name: contractData.plan.name,
          plan_type: contractData.plan.planType
        } : undefined
      } as Contract
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
      const params = new URLSearchParams()
      params.append('memberId', memberId)
      params.append('limit', String(limit))

      const response = await $fetch<CheckInApiResponse>(`${apiUrl}/api/check-ins?${params.toString()}`, {
        credentials: 'include'
      })

      if (response.success && response.data) {
        return response.data.map(checkin => ({
          id: checkin.id,
          member_id: checkin.memberId,
          branch_id: checkin.branchId,
          check_time: checkin.checkInTime,
          member: {
            id: checkin.member.id,
            full_name: checkin.member.fullName,
            member_code: checkin.member.memberCode
          }
        }))
      }
      return []
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

    try {
      const params = new URLSearchParams()
      params.append('memberId', memberId)
      params.append('startDate', start)
      params.append('endDate', end)
      params.append('limit', '1')
      if (branchId) {
        params.append('branchId', branchId)
      }

      const response = await $fetch<CheckInApiResponse>(`${apiUrl}/api/check-ins?${params.toString()}`, {
        credentials: 'include'
      })

      return response.success && response.pagination ? response.pagination.total > 0 : false
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
