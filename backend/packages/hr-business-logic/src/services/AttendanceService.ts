/**
 * 考勤服務
 * 處理考勤相關的業務邏輯
 */

import type {
  IAttendanceRecord,
  IShiftSchedule,
  ICheckInOptions,
  ICheckOutOptions,
  IWorkHoursResult,
  ILateCheckResult,
  CheckType,
  AttendanceStatus
} from '../types'
import type { IAttendanceRepository, IShiftRepository } from '../interfaces'
import {
  calculateWorkHoursWithShift,
  checkLateWithShift
} from '../calculations'
import { validateCheckIn, validateCheckOut } from '../validators'

/**
 * 考勤服務配置
 */
export interface IAttendanceServiceConfig {
  defaultBreakMinutes?: number
  defaultStandardHours?: number
  defaultGraceMinutes?: number
}

/**
 * 考勤服務
 */
export class AttendanceService {
  private attendanceRepo: IAttendanceRepository
  private shiftRepo: IShiftRepository
  private config: Required<IAttendanceServiceConfig>

  constructor(
    attendanceRepo: IAttendanceRepository,
    shiftRepo: IShiftRepository,
    config: IAttendanceServiceConfig = {}
  ) {
    this.attendanceRepo = attendanceRepo
    this.shiftRepo = shiftRepo
    this.config = {
      defaultBreakMinutes: config.defaultBreakMinutes ?? 60,
      defaultStandardHours: config.defaultStandardHours ?? 8,
      defaultGraceMinutes: config.defaultGraceMinutes ?? 10
    }
  }

  /**
   * 處理上班打卡
   */
  async processCheckIn(options: ICheckInOptions): Promise<{
    attendance: IAttendanceRecord
    lateResult: ILateCheckResult
  }> {
    const { employeeId, branchId, checkType = 'NORMAL', checkInTime, notes } = options

    // 檢查是否已有今日打卡
    const existing = await this.attendanceRepo.findTodayByEmployeeId(employeeId)

    // 驗證打卡
    const validation = validateCheckIn(employeeId, existing, checkType)
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '))
    }

    // 取得班表
    const shift = branchId
      ? await this.shiftRepo.findDefaultByBranchId(branchId)
      : await this.shiftRepo.findCurrentByEmployeeId(employeeId)

    // 計算遲到
    const checkIn = checkInTime || new Date()
    const lateResult = checkLateWithShift(checkIn, shift)

    // 建立考勤記錄
    const attendanceDate = checkIn.toISOString().split('T')[0] as string

    const attendance = await this.attendanceRepo.create({
      employeeId,
      branchId: branchId || null,
      attendanceDate,
      checkIn: checkIn.toISOString(),
      checkOut: null,
      checkType,
      attendanceStatus: lateResult.attendanceStatus,
      lateMinutes: lateResult.lateMinutes,
      earlyLeaveMinutes: 0,
      workHours: null,
      overtimeHours: null,
      notes: notes || null
    })

    return { attendance, lateResult }
  }

  /**
   * 處理下班打卡
   */
  async processCheckOut(options: ICheckOutOptions): Promise<{
    attendance: IAttendanceRecord
    workResult: IWorkHoursResult
  }> {
    const { attendanceId, checkOutTime, notes } = options

    // 取得考勤記錄
    const attendance = await this.attendanceRepo.findById(attendanceId)
    if (!attendance) {
      throw new Error('找不到考勤記錄')
    }

    // 驗證簽退
    const validation = validateCheckOut(attendance)
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '))
    }

    // 取得班表
    const shift = attendance.branchId
      ? await this.shiftRepo.findDefaultByBranchId(attendance.branchId)
      : null

    // 計算工時
    const checkOut = checkOutTime || new Date()
    const workResult = calculateWorkHoursWithShift(
      attendance.checkIn!,
      checkOut,
      shift,
      attendance.lateMinutes
    )

    // 更新考勤記錄
    const updatedAttendance = await this.attendanceRepo.update(attendanceId, {
      checkOut: checkOut.toISOString(),
      workHours: workResult.workHours,
      overtimeHours: workResult.overtimeHours,
      attendanceStatus: workResult.attendanceStatus,
      notes: notes ? `${attendance.notes || ''} ${notes}`.trim() : attendance.notes
    })

    return { attendance: updatedAttendance, workResult }
  }

  /**
   * 計算考勤狀態
   */
  determineAttendanceStatus(
    lateMinutes: number,
    earlyLeaveMinutes: number,
    hasCheckOut: boolean
  ): AttendanceStatus {
    if (lateMinutes > 0) return 'LATE'
    if (hasCheckOut && earlyLeaveMinutes > 0) return 'EARLY_LEAVE'
    return 'PRESENT'
  }

  /**
   * 獲取員工今日考勤
   */
  async getTodayAttendance(employeeId: string): Promise<IAttendanceRecord | null> {
    return this.attendanceRepo.findTodayByEmployeeId(employeeId)
  }
}
