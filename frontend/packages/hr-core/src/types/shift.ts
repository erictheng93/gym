/**
 * HR 模組班表類型定義
 */

import type { IEmployee } from './employee'

/**
 * 星期幾 (0=週日, 1=週一, ..., 6=週六)
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * 班表狀態
 */
export type ShiftStatus = 'published' | 'draft' | 'archived'

/**
 * 班表設定接口
 */
export interface IShiftSchedule {
  /** 班表 ID */
  id: string
  /** 分店 ID */
  branchId: string
  /** 班表名稱 */
  name: string
  /** 上班時間 (HH:mm:ss) */
  startTime: string
  /** 下班時間 (HH:mm:ss) */
  endTime: string
  /** 休息開始時間 */
  breakStart: string | null
  /** 休息結束時間 */
  breakEnd: string | null
  /** 遲到寬限分鐘數 */
  gracePeriodMinutes: number
  /** 早退寬限分鐘數 */
  earlyLeaveMinutes: number
  /** 加班起算時間 (HH:mm:ss) */
  overtimeStartAfter: string | null
  /** 是否為預設班表 */
  isDefault: boolean
  /** 適用星期 (0-6) */
  applicableDays: string[]
  /** 狀態 */
  status: ShiftStatus
  /** 建立時間 */
  dateCreated: string
  /** 更新時間 */
  dateUpdated: string | null
}

/**
 * 包含關聯的班表設定
 */
export interface IShiftScheduleWithBranch extends IShiftSchedule {
  /** 分店名稱 */
  branchName?: string
}

/**
 * 員工班表指派接口
 */
export interface IEmployeeShift {
  /** 記錄 ID */
  id: string
  /** 員工 ID */
  employeeId: string
  /** 班表 ID */
  shiftScheduleId: string
  /** 生效日期 (YYYY-MM-DD) */
  effectiveDate: string
  /** 結束日期 (YYYY-MM-DD)，null 表示無限期 */
  endDate: string | null
  /** 建立時間 */
  dateCreated: string
}

/**
 * 包含關聯的員工班表指派
 */
export interface IEmployeeShiftWithRelations extends IEmployeeShift {
  /** 員工資訊 */
  employee?: IEmployee
  /** 班表設定 */
  shiftSchedule?: IShiftSchedule
}

/**
 * 班表建立參數
 */
export interface ICreateShiftScheduleParams {
  /** 分店 ID */
  branchId: string
  /** 班表名稱 */
  name: string
  /** 上班時間 */
  startTime: string
  /** 下班時間 */
  endTime: string
  /** 休息開始時間 */
  breakStart?: string
  /** 休息結束時間 */
  breakEnd?: string
  /** 遲到寬限分鐘數 */
  gracePeriodMinutes?: number
  /** 早退寬限分鐘數 */
  earlyLeaveMinutes?: number
  /** 加班起算時間 */
  overtimeStartAfter?: string
  /** 是否為預設班表 */
  isDefault?: boolean
  /** 適用星期 */
  applicableDays?: string[]
}

/**
 * 班表指派參數
 */
export interface IAssignShiftParams {
  /** 員工 ID */
  employeeId: string
  /** 班表 ID */
  shiftScheduleId: string
  /** 生效日期 */
  effectiveDate: string
  /** 結束日期 */
  endDate?: string
}

/**
 * 批量班表指派參數
 */
export interface IBatchAssignShiftParams {
  /** 員工 ID 列表 */
  employeeIds: string[]
  /** 班表 ID */
  shiftScheduleId: string
  /** 生效日期 */
  effectiveDate: string
  /** 結束日期 */
  endDate?: string
}

/**
 * 班表時間範圍
 */
export interface IShiftTimeRange {
  /** 上班時間 (小時:分鐘) */
  startTime: { hour: number; minute: number }
  /** 下班時間 (小時:分鐘) */
  endTime: { hour: number; minute: number }
  /** 休息開始時間 */
  breakStart?: { hour: number; minute: number }
  /** 休息結束時間 */
  breakEnd?: { hour: number; minute: number }
  /** 遲到寬限分鐘數 */
  gracePeriodMinutes: number
  /** 早退寬限分鐘數 */
  earlyLeaveMinutes: number
}
