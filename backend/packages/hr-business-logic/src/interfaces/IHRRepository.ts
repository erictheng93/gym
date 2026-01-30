/**
 * HR Repository Interfaces
 * 定義與數據層交互的抽象接口
 */

import type {
  IAttendanceRecord,
  IShiftSchedule,
  ILeaveRequest,
  ILeaveBalance,
  ILeaveApprovalLog,
  LeaveType
} from '../types'

/**
 * 考勤數據存取接口
 */
export interface IAttendanceRepository {
  /**
   * 根據 ID 獲取考勤記錄
   */
  findById(id: string): Promise<IAttendanceRecord | null>

  /**
   * 獲取員工今日考勤
   */
  findTodayByEmployeeId(employeeId: string): Promise<IAttendanceRecord | null>

  /**
   * 創建考勤記錄
   */
  create(data: Partial<IAttendanceRecord>): Promise<IAttendanceRecord>

  /**
   * 更新考勤記錄
   */
  update(id: string, data: Partial<IAttendanceRecord>): Promise<IAttendanceRecord>
}

/**
 * 班表數據存取接口
 */
export interface IShiftRepository {
  /**
   * 獲取分店的預設班表
   */
  findDefaultByBranchId(branchId: string): Promise<IShiftSchedule | null>

  /**
   * 獲取員工當前班表
   */
  findCurrentByEmployeeId(employeeId: string): Promise<IShiftSchedule | null>
}

/**
 * 休假申請數據存取接口
 */
export interface ILeaveRequestRepository {
  /**
   * 根據 ID 獲取休假申請
   */
  findById(id: string): Promise<ILeaveRequest | null>

  /**
   * 創建休假申請
   */
  create(data: Partial<ILeaveRequest>): Promise<ILeaveRequest>

  /**
   * 更新休假申請
   */
  update(id: string, data: Partial<ILeaveRequest>): Promise<ILeaveRequest>
}

/**
 * 休假餘額數據存取接口
 */
export interface ILeaveBalanceRepository {
  /**
   * 獲取員工特定年度、特定類型的休假餘額
   */
  findByEmployeeAndType(
    employeeId: string,
    leaveType: LeaveType,
    year: number
  ): Promise<ILeaveBalance | null>

  /**
   * 獲取員工特定年度的所有休假餘額
   */
  findAllByEmployeeAndYear(
    employeeId: string,
    year: number
  ): Promise<ILeaveBalance[]>

  /**
   * 更新休假餘額
   */
  update(id: string, data: Partial<ILeaveBalance>): Promise<ILeaveBalance>

  /**
   * 原子更新休假餘額 (使用數據庫函數)
   */
  atomicUpdate(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    pendingDelta: number,
    usedDelta: number
  ): Promise<{ success: boolean; newPending: number; newUsed: number }>
}

/**
 * 審核歷史數據存取接口
 */
export interface ILeaveApprovalLogRepository {
  /**
   * 創建審核歷史
   */
  create(data: Partial<ILeaveApprovalLog>): Promise<ILeaveApprovalLog>

  /**
   * 獲取休假申請的審核歷史
   */
  findByLeaveRequestId(leaveRequestId: string): Promise<ILeaveApprovalLog[]>
}

/**
 * 員工數據存取接口
 */
export interface IEmployeeRepository {
  /**
   * 根據 ID 獲取員工
   */
  findById(id: string): Promise<{
    id: string
    supervisorId: string | null
    jobTitleId: string | null
    branchId: string | null
  } | null>

  /**
   * 根據用戶 ID 獲取員工
   */
  findByUserId(userId: string): Promise<{
    id: string
    supervisorId: string | null
    jobTitleId: string | null
    branchId: string | null
  } | null>

  /**
   * 檢查是否為管理員
   */
  isAdmin(employeeId: string): Promise<boolean>
}

/**
 * 綜合 HR 資料庫接口
 */
export interface IHRRepository {
  attendance: IAttendanceRepository
  shift: IShiftRepository
  leaveRequest: ILeaveRequestRepository
  leaveBalance: ILeaveBalanceRepository
  approvalLog: ILeaveApprovalLogRepository
  employee: IEmployeeRepository
}
