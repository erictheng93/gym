/**
 * 員工數據適配器接口
 * 提供 HR 模組所需的員工相關操作
 */

import type { IEmployee, IEmployeeWithRelations } from '../types/employee'

/**
 * 員工查詢選項
 */
export interface IEmployeeQueryOptions {
  /** 過濾分店 */
  branchId?: string
  /** 只查詢在職員工 */
  activeOnly?: boolean
  /** 職位 ID */
  jobTitleId?: string
  /** 搜索關鍵字（姓名、員工編號） */
  search?: string
}

/**
 * 員工數據適配器
 */
export interface IEmployeeAdapter {
  /**
   * 根據 ID 取得員工
   */
  getEmployee(id: string): Promise<IEmployee | null>

  /**
   * 取得員工（包含關聯）
   */
  getEmployeeWithRelations(id: string): Promise<IEmployeeWithRelations | null>

  /**
   * 取得員工的直屬主管鏈
   * 返回從直屬主管到最高層主管的列表
   */
  getSupervisorChain(employeeId: string): Promise<IEmployee[]>

  /**
   * 取得員工的直屬下屬
   */
  getSubordinates(supervisorId: string): Promise<IEmployee[]>

  /**
   * 取得分店員工列表
   */
  getBranchEmployees(branchId: string, options?: IEmployeeQueryOptions): Promise<IEmployee[]>

  /**
   * 檢查員工是否有權限審核目標員工的申請
   * 用於休假、補打卡等審核流程
   */
  canApprove(approverId: string, targetEmployeeId: string): Promise<boolean>

  /**
   * 根據用戶 ID 取得對應的員工
   * 用於從登入用戶查詢員工資料
   */
  getEmployeeByUserId(userId: string): Promise<IEmployee | null>
}
