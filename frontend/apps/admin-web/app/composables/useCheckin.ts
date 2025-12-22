import { readItems, createItem, updateItem, aggregate } from '@directus/sdk'
import type { MemberCheckin, Member, Contract, ContractLog } from '~/types/directus'

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
  const apiUrl = config.public.directusUrl
  const directus = useDirectus()
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
        check_time: {
          _gte: start,
          _lt: end
        }
      }

      if (branchId) {
        filter.branch_id = { _eq: branchId }
      }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('member_checkins', {
            filter,
            fields: [
              '*',
              'member.id',
              'member.full_name',
              'member.member_code',
              'member.member_status',
              'member.phone',
              'contract.id',
              'contract.contract_no',
              'contract.contract_status',
              'branch.id',
              'branch.name'
            ],
            sort: ['-check_time'],
            limit: 50
          })
        ),
        directus.request(
          aggregate('member_checkins', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      todayCheckins.value = (data as MemberCheckin[]).map(checkin => ({
        id: checkin.id,
        member: checkin.member as Member,
        time: checkin.check_time,
        contract: checkin.contract as Contract,
        branch_id: checkin.branch_id || undefined
      }))
      todayCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      console.error('Failed to fetch today checkins:', error)
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

      const result = await directus.request(
        createItem('member_checkins', checkinData)
      )

      // Handle COUNT_BASED contract - deduct remaining counts
      let countDeducted = false
      let remainingCounts: number | null = null

      if (contractId) {
        // Fetch the contract with plan info
        const [contractData] = await directus.request(
          readItems('contracts', {
            filter: { id: { _eq: contractId } },
            fields: ['*', 'plan.plan_type', 'plan.name'],
            limit: 1
          })
        )

        const contract = contractData as Contract
        if (contract?.plan?.plan_type === 'COUNT_BASED' && contract.remaining_counts !== null && contract.remaining_counts > 0) {
          // Deduct one count
          const newRemainingCounts = contract.remaining_counts - 1
          await directus.request(
            updateItem('contracts', contractId, {
              remaining_counts: newRemainingCounts
            })
          )

          // Create contract log for the deduction
          await directus.request(
            createItem('contract_logs', {
              contract_id: contractId,
              log_type: 'CLASS_USED',
              reason: '入場扣堂',
              days_affected: 1,
              created_by_employee: verifiedBy || null,
              branch_id: branchId || null
            } as Partial<ContractLog>)
          )

          countDeducted = true
          remainingCounts = newRemainingCounts
        }
      }

      // Fetch the created record with relations
      const [created] = await directus.request(
        readItems('member_checkins', {
          filter: { id: { _eq: (result as MemberCheckin).id } },
          fields: [
            '*',
            'member.id',
            'member.full_name',
            'member.member_code',
            'member.member_status',
            'member.phone',
            'contract.id',
            'contract.contract_no',
            'contract.remaining_counts'
          ],
          limit: 1
        })
      )

      const checkinRecord: CheckinRecord = {
        id: (created as MemberCheckin).id,
        member: (created as MemberCheckin).member as Member,
        time: (created as MemberCheckin).check_time,
        contract: (created as MemberCheckin).contract as Contract,
        branch_id: (created as MemberCheckin).branch_id || undefined,
        countDeducted,
        remainingCounts
      }

      // Add to today's list
      todayCheckins.value.unshift(checkinRecord)
      todayCount.value++

      return checkinRecord
    } catch (error) {
      console.error('Failed to perform checkin:', error)
      throw error
    }
  }

  // Get member's active contract for check-in
  const getMemberActiveContract = async (memberId: string): Promise<Contract | null> => {
    try {
      const now = new Date().toISOString().split('T')[0]
      const contracts = await directus.request(
        readItems('contracts', {
          filter: {
            member_id: { _eq: memberId },
            contract_status: { _eq: 'ACTIVE' },
            start_date: { _lte: now },
            _or: [
              { end_date: { _gte: now } },
              { end_date: { _null: true } }
            ]
          },
          fields: ['*', 'plan.name', 'plan.plan_type', 'plan.class_counts'],
          sort: ['-start_date'],
          limit: 1
        })
      )

      const contract = contracts[0] as Contract
      // For COUNT_BASED contracts, also check if there are remaining counts
      if (contract?.plan?.plan_type === 'COUNT_BASED' && contract.remaining_counts !== null && contract.remaining_counts <= 0) {
        // No remaining counts - treat as no active contract for check-in
        return null
      }

      return contract || null
    } catch (error) {
      console.error('Failed to get member active contract:', error)
      return null
    }
  }

  // Fetch check-in history for a specific member
  const fetchMemberCheckinHistory = async (memberId: string, limit = 20) => {
    try {
      const data = await directus.request(
        readItems('member_checkins', {
          filter: { member_id: { _eq: memberId } },
          fields: ['*', 'branch.name', 'contract.contract_no'],
          sort: ['-check_time'],
          limit
        })
      )
      return data as MemberCheckin[]
    } catch (error) {
      console.error('Failed to fetch member checkin history:', error)
      return []
    }
  }

  // Check if member has already checked in today
  const hasCheckedInToday = async (memberId: string, branchId?: string): Promise<boolean> => {
    const { start, end } = getTodayRange()
    const filter: Record<string, unknown> = {
      member_id: { _eq: memberId },
      check_time: {
        _gte: start,
        _lt: end
      }
    }

    if (branchId) {
      filter.branch_id = { _eq: branchId }
    }

    try {
      const result = await directus.request(
        aggregate('member_checkins', {
          aggregate: { count: '*' },
          query: { filter }
        })
      )
      return Number(result[0]?.count) > 0
    } catch (error) {
      console.error('Failed to check if member checked in today:', error)
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
      const response = await $fetch<QrCheckinResult>(`${apiUrl}/gym/checkin/qr-verify`, {
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
      console.error('QR checkin verification failed:', error)

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
