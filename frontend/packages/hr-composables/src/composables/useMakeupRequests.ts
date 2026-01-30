/**
 * useMakeupRequests - 補打卡管理 composable
 * 使用適配器模式，與具體後端實現解耦
 */

import { ref, type Ref } from 'vue'
import type {
  IMakeupRequest,
  IMakeupRequestWithRelations,
  IMakeupApprovalLog,
  MakeupType
} from '@gym-nexus/hr-core'
import { useHRContext } from '../context/useHRContext'

/**
 * useMakeupRequests 返回值類型
 */
export interface UseMakeupRequestsReturn {
  // State
  makeupRequests: Ref<IMakeupRequestWithRelations[]>
  pendingMakeupApprovals: Ref<IMakeupRequestWithRelations[]>
  isMakeupLoading: Ref<boolean>
  makeupTotalCount: Ref<number>

  // Query
  fetchMakeupRequests: (options?: {
    employeeId?: string
    status?: string
    page?: number
    limit?: number
  }) => Promise<void>
  fetchPendingMakeupApprovals: (supervisorId: string) => Promise<void>
  fetchMakeupApprovalHistory: (makeupRequestId: string) => Promise<IMakeupApprovalLog[]>

  // Actions
  applyMakeup: (makeupData: {
    employeeId: string
    branchId: string
    targetDate: string
    makeupType: MakeupType
    requestedCheckIn?: string
    requestedCheckOut?: string
    reason: string
  }) => Promise<IMakeupRequest>
  reviewMakeup: (
    makeupRequestId: string,
    approverId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string
  ) => Promise<IMakeupRequest>
  cancelMakeup: (makeupRequestId: string, employeeId: string) => Promise<IMakeupRequest>
}

/**
 * 補打卡管理 composable
 */
export function useMakeupRequests(): UseMakeupRequestsReturn {
  const { makeupAdapter } = useHRContext()

  // ============================================
  // 狀態
  // ============================================

  const makeupRequests = ref<IMakeupRequestWithRelations[]>([])
  const pendingMakeupApprovals = ref<IMakeupRequestWithRelations[]>([])
  const isMakeupLoading = ref(false)
  const makeupTotalCount = ref(0)

  // ============================================
  // 補打卡申請查詢
  // ============================================

  /**
   * 取得員工補打卡申請
   */
  async function fetchMakeupRequests(options?: {
    employeeId?: string
    status?: string
    page?: number
    limit?: number
  }): Promise<void> {
    isMakeupLoading.value = true
    try {
      const { data, total } = await makeupAdapter.query({
        employeeId: options?.employeeId,
        status: options?.status,
        page: options?.page,
        limit: options?.limit
      })
      makeupRequests.value = data
      makeupTotalCount.value = total
    } catch (error) {
      console.error('Failed to fetch makeup requests:', error)
    } finally {
      isMakeupLoading.value = false
    }
  }

  /**
   * 取得待審核的補打卡申請（主管用）
   */
  async function fetchPendingMakeupApprovals(supervisorId: string): Promise<void> {
    try {
      const data = await makeupAdapter.getPendingApprovals(supervisorId)
      pendingMakeupApprovals.value = data
    } catch (error) {
      console.error('Failed to fetch pending makeup approvals:', error)
    }
  }

  /**
   * 取得補打卡審核歷程
   */
  async function fetchMakeupApprovalHistory(makeupRequestId: string): Promise<IMakeupApprovalLog[]> {
    try {
      return await makeupAdapter.getApprovalHistory(makeupRequestId)
    } catch (error) {
      console.error('Failed to fetch makeup approval history:', error)
      return []
    }
  }

  // ============================================
  // 補打卡申請操作
  // ============================================

  /**
   * 申請補打卡
   */
  async function applyMakeup(makeupData: {
    employeeId: string
    branchId: string
    targetDate: string
    makeupType: MakeupType
    requestedCheckIn?: string
    requestedCheckOut?: string
    reason: string
  }): Promise<IMakeupRequest> {
    const result = await makeupAdapter.apply({
      employeeId: makeupData.employeeId,
      branchId: makeupData.branchId,
      targetDate: makeupData.targetDate,
      makeupType: makeupData.makeupType,
      requestedCheckIn: makeupData.requestedCheckIn,
      requestedCheckOut: makeupData.requestedCheckOut,
      reason: makeupData.reason
    })

    return result
  }

  /**
   * 審核補打卡
   */
  async function reviewMakeup(
    makeupRequestId: string,
    approverId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string
  ): Promise<IMakeupRequest> {
    const result = await makeupAdapter.review({
      makeupRequestId,
      approverId,
      action,
      notes
    })

    // 從待審核列表中移除
    const index = pendingMakeupApprovals.value.findIndex(r => r.id === makeupRequestId)
    if (index !== -1) {
      pendingMakeupApprovals.value.splice(index, 1)
    }

    return result
  }

  /**
   * 取消補打卡申請
   */
  async function cancelMakeup(
    makeupRequestId: string,
    employeeId: string
  ): Promise<IMakeupRequest> {
    const result = await makeupAdapter.cancel(makeupRequestId, employeeId)

    // 更新本地狀態
    const index = makeupRequests.value.findIndex(r => r.id === makeupRequestId)
    if (index !== -1) {
      makeupRequests.value[index] = {
        ...makeupRequests.value[index],
        ...result
      }
    }

    return result
  }

  return {
    // State
    makeupRequests,
    pendingMakeupApprovals,
    isMakeupLoading,
    makeupTotalCount,
    // Query
    fetchMakeupRequests,
    fetchPendingMakeupApprovals,
    fetchMakeupApprovalHistory,
    // Actions
    applyMakeup,
    reviewMakeup,
    cancelMakeup
  }
}

export default useMakeupRequests
