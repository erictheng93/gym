/**
 * useLeaveRequests - 休假管理 composable
 * 使用適配器模式，與具體後端實現解耦
 */

import { ref, type Ref } from 'vue'
import type {
  ILeaveRequest,
  ILeaveRequestWithRelations,
  ILeaveBalance,
  ILeaveApprovalLog,
  LeaveType,
  HalfDayType
} from '@gym-nexus/hr-core'
import {
  calculateLeaveDays,
  calculateWorkingDays,
  hasEnoughBalance,
  validateLeaveRequest,
  getLeaveTypeName,
  LEAVE_TYPE_NAMES
} from '@gym-nexus/hr-core'
import { useHRContext } from '../context/useHRContext'

/**
 * useLeaveRequests 返回值類型
 */
export interface UseLeaveRequestsReturn {
  // State
  leaveRequests: Ref<ILeaveRequestWithRelations[]>
  leaveBalances: Ref<ILeaveBalance[]>
  pendingApprovals: Ref<ILeaveRequestWithRelations[]>
  isLeavesLoading: Ref<boolean>
  leavesTotalCount: Ref<number>

  // Query
  fetchLeaveBalances: (employeeId: string, year?: number) => Promise<void>
  fetchLeaveRequests: (options?: {
    employeeId?: string
    status?: string
    page?: number
    limit?: number
  }) => Promise<void>
  fetchPendingApprovals: (supervisorId: string) => Promise<void>
  fetchApprovalHistory: (leaveRequestId: string) => Promise<ILeaveApprovalLog[]>

  // Actions
  applyLeave: (leaveData: {
    employeeId: string
    leaveType: LeaveType
    startDate: string
    endDate: string
    reason?: string
    daysRequested: number
    isHalfDay?: boolean
    halfDayType?: HalfDayType
  }) => Promise<ILeaveRequest>
  reviewLeave: (
    leaveRequestId: string,
    approverId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string
  ) => Promise<ILeaveRequest>
  cancelLeave: (leaveRequestId: string, employeeId: string) => Promise<ILeaveRequest>

  // Utilities
  calculateLeaveDays: typeof calculateLeaveDays
  calculateWorkingDays: typeof calculateWorkingDays
  hasEnoughBalance: typeof hasEnoughBalance
  validateLeaveRequest: typeof validateLeaveRequest
  getLeaveTypeName: typeof getLeaveTypeName
  LEAVE_TYPE_NAMES: typeof LEAVE_TYPE_NAMES
}

/**
 * 休假管理 composable
 */
export function useLeaveRequests(): UseLeaveRequestsReturn {
  const { leaveAdapter } = useHRContext()

  // ============================================
  // 狀態
  // ============================================

  const leaveRequests = ref<ILeaveRequestWithRelations[]>([])
  const leaveBalances = ref<ILeaveBalance[]>([])
  const pendingApprovals = ref<ILeaveRequestWithRelations[]>([])
  const isLeavesLoading = ref(false)
  const leavesTotalCount = ref(0)

  // ============================================
  // 休假餘額
  // ============================================

  /**
   * 取得員工休假餘額
   */
  async function fetchLeaveBalances(employeeId: string, year?: number): Promise<void> {
    try {
      const data = await leaveAdapter.getBalances(employeeId, year)
      leaveBalances.value = data
    } catch (error) {
      console.error('Failed to fetch leave balances:', error)
    }
  }

  // ============================================
  // 休假申請查詢
  // ============================================

  /**
   * 取得休假申請列表
   */
  async function fetchLeaveRequests(options?: {
    employeeId?: string
    status?: string
    page?: number
    limit?: number
  }): Promise<void> {
    isLeavesLoading.value = true
    try {
      const { data, total } = await leaveAdapter.query({
        employeeId: options?.employeeId,
        status: options?.status,
        page: options?.page,
        limit: options?.limit
      })
      leaveRequests.value = data
      leavesTotalCount.value = total
    } catch (error) {
      console.error('Failed to fetch leave requests:', error)
    } finally {
      isLeavesLoading.value = false
    }
  }

  /**
   * 取得待審核的休假申請
   */
  async function fetchPendingApprovals(supervisorId: string): Promise<void> {
    try {
      const data = await leaveAdapter.getPendingApprovals(supervisorId)
      pendingApprovals.value = data
    } catch (error) {
      console.error('Failed to fetch pending approvals:', error)
    }
  }

  /**
   * 取得休假審核歷程
   */
  async function fetchApprovalHistory(leaveRequestId: string): Promise<ILeaveApprovalLog[]> {
    try {
      return await leaveAdapter.getApprovalHistory(leaveRequestId)
    } catch (error) {
      console.error('Failed to fetch approval history:', error)
      return []
    }
  }

  // ============================================
  // 休假申請操作
  // ============================================

  /**
   * 申請休假
   */
  async function applyLeave(leaveData: {
    employeeId: string
    leaveType: LeaveType
    startDate: string
    endDate: string
    reason?: string
    daysRequested: number
    isHalfDay?: boolean
    halfDayType?: HalfDayType
  }): Promise<ILeaveRequest> {
    const result = await leaveAdapter.apply({
      employeeId: leaveData.employeeId,
      leaveType: leaveData.leaveType,
      startDate: leaveData.startDate,
      endDate: leaveData.endDate,
      reason: leaveData.reason,
      daysRequested: leaveData.daysRequested,
      isHalfDay: leaveData.isHalfDay,
      halfDayType: leaveData.halfDayType
    })

    return result
  }

  /**
   * 審核休假
   */
  async function reviewLeave(
    leaveRequestId: string,
    approverId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string
  ): Promise<ILeaveRequest> {
    const result = await leaveAdapter.review({
      leaveRequestId,
      approverId,
      action,
      notes
    })

    // 從待審核列表中移除
    const index = pendingApprovals.value.findIndex(r => r.id === leaveRequestId)
    if (index !== -1) {
      pendingApprovals.value.splice(index, 1)
    }

    return result
  }

  /**
   * 取消休假申請
   */
  async function cancelLeave(
    leaveRequestId: string,
    employeeId: string
  ): Promise<ILeaveRequest> {
    const result = await leaveAdapter.cancel(leaveRequestId, employeeId)

    // 更新本地狀態
    const index = leaveRequests.value.findIndex(r => r.id === leaveRequestId)
    if (index !== -1) {
      leaveRequests.value[index] = {
        ...leaveRequests.value[index],
        ...result
      }
    }

    return result
  }

  return {
    // State
    leaveRequests,
    leaveBalances,
    pendingApprovals,
    isLeavesLoading,
    leavesTotalCount,

    // Query
    fetchLeaveBalances,
    fetchLeaveRequests,
    fetchPendingApprovals,
    fetchApprovalHistory,

    // Actions
    applyLeave,
    reviewLeave,
    cancelLeave,

    // Utilities (re-export from hr-core)
    calculateLeaveDays,
    calculateWorkingDays,
    hasEnoughBalance,
    validateLeaveRequest,
    getLeaveTypeName,
    LEAVE_TYPE_NAMES
  }
}

export default useLeaveRequests
