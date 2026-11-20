/**
 * 休假審核服務
 * 處理休假申請和審核的業務邏輯
 */

import type {
  ILeaveRequest,
  ILeaveBalance,
  ILeaveApprovalLog,
  IApplyLeaveParams,
  IReviewLeaveParams,
  ILeaveValidationResult,
  LeaveType,
  LeaveStatus,
  ApprovalAction
} from '../types'
import type {
  ILeaveRequestRepository,
  ILeaveBalanceRepository,
  ILeaveApprovalLogRepository,
  IEmployeeRepository
} from '../interfaces'
import { calculateLeaveDays, calculateBalanceUpdate } from '../calculations'
import {
  validateLeaveRequest,
  validateApprovalPermission,
  canReviewLeaveRequest,
  canCancelLeaveRequest
} from '../validators'

/**
 * 休假審核服務
 */
export class LeaveApprovalService {
  private leaveRequestRepo: ILeaveRequestRepository
  private balanceRepo: ILeaveBalanceRepository
  private approvalLogRepo: ILeaveApprovalLogRepository
  private employeeRepo: IEmployeeRepository

  constructor(
    leaveRequestRepo: ILeaveRequestRepository,
    balanceRepo: ILeaveBalanceRepository,
    approvalLogRepo: ILeaveApprovalLogRepository,
    employeeRepo: IEmployeeRepository
  ) {
    this.leaveRequestRepo = leaveRequestRepo
    this.balanceRepo = balanceRepo
    this.approvalLogRepo = approvalLogRepo
    this.employeeRepo = employeeRepo
  }

  /**
   * 提交休假申請
   */
  async applyLeave(params: IApplyLeaveParams): Promise<{
    leaveRequest: ILeaveRequest
    validation: ILeaveValidationResult
  }> {
    const year = new Date(params.startDate).getFullYear()

    // 取得餘額
    const balance = await this.balanceRepo.findByEmployeeAndType(
      params.employeeId,
      params.leaveType,
      year
    )

    // 驗證申請
    const validation = validateLeaveRequest(params, balance)
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '))
    }

    // 建立休假申請
    const leaveRequest = await this.leaveRequestRepo.create({
      employeeId: params.employeeId,
      leaveType: params.leaveType,
      startDate: params.startDate,
      endDate: params.endDate,
      daysRequested: validation.daysRequested,
      reason: params.reason || null,
      leaveStatus: 'PENDING',
      isHalfDay: params.isHalfDay || false,
      halfDayType: params.halfDayType || null,
      submittedAt: new Date().toISOString()
    })

    // 記錄審核歷史
    await this.approvalLogRepo.create({
      leaveRequestId: leaveRequest.id,
      actionBy: params.employeeId,
      action: 'SUBMIT',
      previousStatus: null,
      newStatus: 'PENDING',
      notes: '提交休假申請'
    })

    // 更新 pending_days
    if (balance) {
      try {
        await this.balanceRepo.atomicUpdate(
          params.employeeId,
          params.leaveType,
          year,
          validation.daysRequested,
          0
        )
      } catch (e) {
        // 如果原子更新失敗，使用一般更新
        const { newPendingDays } = calculateBalanceUpdate(
          balance,
          validation.daysRequested,
          0
        )
        await this.balanceRepo.update(balance.id, {
          pendingDays: newPendingDays
        })
      }
    }

    return { leaveRequest, validation }
  }

  /**
   * 審核休假申請
   */
  async reviewLeave(params: IReviewLeaveParams): Promise<{
    leaveRequest: ILeaveRequest
    approvalLog: ILeaveApprovalLog
  }> {
    const { leaveRequestId, approverId, action, notes } = params

    // 取得休假申請
    const request = await this.leaveRequestRepo.findById(leaveRequestId)
    if (!request) {
      throw new Error('找不到休假申請')
    }

    // 驗證狀態
    const reviewValidation = canReviewLeaveRequest(request.leaveStatus, action)
    if (!reviewValidation.canReview) {
      throw new Error(reviewValidation.reason)
    }

    // 驗證審核權限
    const approverEmployee = await this.employeeRepo.findById(approverId)
    const isAdmin = approverEmployee
      ? await this.employeeRepo.isAdmin(approverEmployee.id)
      : false

    const supervisorChain = await this.getSupervisorChain(request.employeeId)

    const permissionValidation = validateApprovalPermission(
      approverId,
      request.employeeId,
      supervisorChain,
      isAdmin
    )

    if (!permissionValidation.canApprove) {
      throw new Error(permissionValidation.reason)
    }

    // 更新休假申請
    const newStatus: LeaveStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    const updatedRequest = await this.leaveRequestRepo.update(leaveRequestId, {
      leaveStatus: newStatus,
      approverId,
      approvedAt: new Date().toISOString(),
      approvalNotes: notes || null
    })

    // 記錄審核歷史
    const approvalLog = await this.approvalLogRepo.create({
      leaveRequestId,
      actionBy: approverId,
      action: action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      previousStatus: 'PENDING',
      newStatus,
      notes: notes || null
    })

    // 更新餘額
    const year = new Date(request.startDate).getFullYear()

    let pendingDelta = 0
    let usedDelta = 0

    if (action === 'APPROVE') {
      pendingDelta = -request.daysRequested
      usedDelta = request.daysRequested
    } else {
      // REJECT
      pendingDelta = -request.daysRequested
    }

    try {
      await this.balanceRepo.atomicUpdate(
        request.employeeId,
        request.leaveType,
        year,
        pendingDelta,
        usedDelta
      )
    } catch (e) {
      // 如果原子更新失敗，使用一般更新
      const balance = await this.balanceRepo.findByEmployeeAndType(
        request.employeeId,
        request.leaveType,
        year
      )
      if (balance) {
        const { newPendingDays, newUsedDays } = calculateBalanceUpdate(
          balance,
          pendingDelta,
          usedDelta
        )
        await this.balanceRepo.update(balance.id, {
          pendingDays: newPendingDays,
          usedDays: newUsedDays
        })
      }
    }

    return { leaveRequest: updatedRequest, approvalLog }
  }

  /**
   * 取消休假申請
   */
  async cancelLeave(
    leaveRequestId: string,
    requesterId: string
  ): Promise<ILeaveRequest> {
    // 取得休假申請
    const request = await this.leaveRequestRepo.findById(leaveRequestId)
    if (!request) {
      throw new Error('找不到休假申請')
    }

    // 驗證取消權限
    const cancelValidation = canCancelLeaveRequest(
      request.leaveStatus,
      requesterId,
      request.employeeId
    )
    if (!cancelValidation.canCancel) {
      throw new Error(cancelValidation.reason)
    }

    // 更新休假申請
    const updatedRequest = await this.leaveRequestRepo.update(leaveRequestId, {
      leaveStatus: 'CANCELLED'
    })

    // 記錄審核歷史
    await this.approvalLogRepo.create({
      leaveRequestId,
      actionBy: requesterId,
      action: 'CANCEL',
      previousStatus: request.leaveStatus,
      newStatus: 'CANCELLED',
      notes: '取消申請'
    })

    // 更新餘額（減少 pending 或 used）
    const year = new Date(request.startDate).getFullYear()

    let pendingDelta = 0
    let usedDelta = 0

    if (request.leaveStatus === 'PENDING') {
      pendingDelta = -request.daysRequested
    } else if (request.leaveStatus === 'APPROVED') {
      usedDelta = -request.daysRequested
    }

    if (pendingDelta !== 0 || usedDelta !== 0) {
      try {
        await this.balanceRepo.atomicUpdate(
          request.employeeId,
          request.leaveType,
          year,
          pendingDelta,
          usedDelta
        )
      } catch (e) {
        const balance = await this.balanceRepo.findByEmployeeAndType(
          request.employeeId,
          request.leaveType,
          year
        )
        if (balance) {
          const { newPendingDays, newUsedDays } = calculateBalanceUpdate(
            balance,
            pendingDelta,
            usedDelta
          )
          await this.balanceRepo.update(balance.id, {
            pendingDays: newPendingDays,
            usedDays: newUsedDays
          })
        }
      }
    }

    return updatedRequest
  }

  /**
   * 獲取員工的上級鏈
   */
  private async getSupervisorChain(employeeId: string): Promise<string[]> {
    const chain: string[] = []
    let currentId: string | null = employeeId
    const visited = new Set<string>()
    const maxDepth = 10

    while (currentId && chain.length < maxDepth) {
      if (visited.has(currentId)) break
      visited.add(currentId)

      const employee = await this.employeeRepo.findById(currentId)
      if (!employee || !employee.supervisorId) break

      chain.push(employee.supervisorId)
      currentId = employee.supervisorId
    }

    return chain
  }

  /**
   * 檢查是否為員工的上級
   */
  async isSupervisorOf(approverId: string, employeeId: string): Promise<boolean> {
    const chain = await this.getSupervisorChain(employeeId)
    return chain.includes(approverId)
  }
}
