/**
 * 考勤數據適配器接口
 */

import type {
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  ITodayAttendanceSummary,
  IMonthlyAttendanceStats,
  ICheckInOptions,
  ICheckOutOptions
} from '../types/attendance'

/**
 * 考勤查詢選項
 */
export interface IAttendanceQueryOptions {
  /** 員工 ID */
  employeeId?: string
  /** 分店 ID */
  branchId?: string
  /** 開始日期 */
  startDate?: string
  /** 結束日期 */
  endDate?: string
  /** 出勤狀態 */
  attendanceStatus?: string[]
  /** 頁碼 */
  page?: number
  /** 每頁數量 */
  limit?: number
}

/**
 * 考勤適配器接口
 */
export interface IAttendanceAdapter {
  /**
   * 根據 ID 取得考勤記錄
   */
  getById(id: string): Promise<IAttendanceRecord | null>

  /**
   * 取得員工今日考勤
   */
  getTodayAttendance(employeeId: string): Promise<IAttendanceRecord | null>

  /**
   * 取得今日所有考勤（包含員工資訊）
   */
  getTodayAttendances(branchId?: string): Promise<IAttendanceRecordWithEmployee[]>

  /**
   * 查詢考勤記錄
   */
  query(options: IAttendanceQueryOptions): Promise<{
    data: IAttendanceRecordWithEmployee[]
    total: number
  }>

  /**
   * 取得員工近期考勤
   */
  getRecentAttendances(employeeId: string, days: number): Promise<IAttendanceRecord[]>

  /**
   * 取得月度考勤記錄
   */
  getMonthlyAttendances(
    employeeId: string,
    year: number,
    month: number
  ): Promise<IAttendanceRecord[]>

  /**
   * 上班打卡
   */
  checkIn(options: ICheckInOptions): Promise<IAttendanceRecord>

  /**
   * 下班打卡
   */
  checkOut(options: ICheckOutOptions): Promise<IAttendanceRecord>

  /**
   * 更新考勤記錄
   */
  update(id: string, data: Partial<IAttendanceRecord>): Promise<IAttendanceRecord>

  /**
   * 取得今日考勤概況統計
   */
  getTodaySummary(branchId?: string): Promise<ITodayAttendanceSummary>

  /**
   * 取得月度考勤統計
   */
  getMonthlyStats(options: {
    branchId?: string
    year: number
    month: number
  }): Promise<IMonthlyAttendanceStats[]>
}
