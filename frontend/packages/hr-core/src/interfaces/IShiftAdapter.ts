/**
 * 班表數據適配器接口
 */

import type {
  IShiftSchedule,
  IShiftScheduleWithBranch,
  IEmployeeShift,
  IEmployeeShiftWithRelations,
  ICreateShiftScheduleParams,
  IAssignShiftParams,
  IBatchAssignShiftParams
} from '../types/shift'
import type { IEmployee } from '../types/employee'

/**
 * 班表查詢選項
 */
export interface IShiftQueryOptions {
  /** 分店 ID */
  branchId?: string
  /** 只查詢啟用的班表 */
  activeOnly?: boolean
}

/**
 * 員工班表查詢選項
 */
export interface IEmployeeShiftQueryOptions {
  /** 員工 ID */
  employeeId?: string
  /** 班表 ID */
  shiftScheduleId?: string
  /** 分店 ID */
  branchId?: string
  /** 只查詢有效的指派 */
  activeOnly?: boolean
}

/**
 * 班表適配器接口
 */
export interface IShiftAdapter {
  // ====== 班表 CRUD ======

  /**
   * 根據 ID 取得班表
   */
  getById(id: string): Promise<IShiftSchedule | null>

  /**
   * 根據 ID 取得班表（包含分店名稱）
   */
  getByIdWithBranch(id: string): Promise<IShiftScheduleWithBranch | null>

  /**
   * 取得班表列表
   */
  getAll(options?: IShiftQueryOptions): Promise<IShiftScheduleWithBranch[]>

  /**
   * 創建班表
   */
  create(params: ICreateShiftScheduleParams): Promise<IShiftSchedule>

  /**
   * 更新班表
   */
  update(id: string, data: Partial<IShiftSchedule>): Promise<IShiftSchedule>

  /**
   * 刪除班表（軟刪除）
   */
  delete(id: string): Promise<void>

  // ====== 員工班表指派 ======

  /**
   * 取得員工班表指派列表
   */
  getEmployeeShifts(options?: IEmployeeShiftQueryOptions): Promise<IEmployeeShiftWithRelations[]>

  /**
   * 取得班表下的所有員工
   */
  getShiftEmployees(shiftScheduleId: string): Promise<IEmployeeShiftWithRelations[]>

  /**
   * 取得員工當前班表
   */
  getEmployeeCurrentShift(employeeId: string): Promise<IEmployeeShiftWithRelations | null>

  /**
   * 指派班表給員工
   */
  assignToEmployee(params: IAssignShiftParams): Promise<IEmployeeShift>

  /**
   * 批量指派班表
   */
  batchAssign(params: IBatchAssignShiftParams): Promise<IEmployeeShift[]>

  /**
   * 更新員工班表指派
   */
  updateEmployeeShift(
    shiftId: string,
    data: { effectiveDate?: string; endDate?: string | null }
  ): Promise<IEmployeeShift>

  /**
   * 移除員工班表指派
   */
  removeEmployeeShift(shiftId: string): Promise<IEmployeeShift>

  // ====== 輔助查詢 ======

  /**
   * 取得分店員工列表（用於排班選擇）
   */
  getBranchEmployees(branchId: string): Promise<IEmployee[]>
}
