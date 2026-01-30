/**
 * HR 政策配置提供者接口
 * 可被不同項目覆寫以自定義業務規則
 */

import type { LeaveType } from '../types/leave'

/**
 * 工作時間政策
 */
export interface IWorkTimePolicy {
  /** 標準上班時間 (0-23) */
  standardStartHour: number
  /** 標準上班分鐘 (0-59) */
  standardStartMinute: number
  /** 標準下班時間 (0-23) */
  standardEndHour: number
  /** 標準下班分鐘 (0-59) */
  standardEndMinute: number
  /** 遲到寬限分鐘數 */
  gracePeriodMinutes: number
  /** 早退寬限分鐘數 */
  earlyLeaveGraceMinutes: number
}

/**
 * 加班政策
 */
export interface IOvertimePolicy {
  /** 每日標準工時（超過即為加班） */
  standardWorkHours: number
  /** 加班需提前申請 */
  requiresPreApproval: boolean
  /** 最大加班時數/日 */
  maxDailyOvertimeHours: number
  /** 最大加班時數/月 */
  maxMonthlyOvertimeHours: number
}

/**
 * 休假政策
 */
export interface ILeavePolicy {
  /** 預設年假天數 */
  defaultAnnualLeaveDays: number
  /** 年假是否可結轉 */
  annualLeaveCarryOver: boolean
  /** 年假結轉上限天數 */
  maxCarryOverDays: number
  /** 試用期可請年假 */
  annualLeaveInProbation: boolean
  /** 病假需證明的最小天數 */
  sickLeaveDocumentRequiredDays: number
  /** 各類假別天數上限 */
  leaveTypeLimits: Record<LeaveType, number>
}

/**
 * 考勤政策
 */
export interface IAttendancePolicy {
  /** 允許跨分店打卡 */
  allowCrossBranchCheckIn: boolean
  /** 需要 GPS 定位 */
  requireGpsLocation: boolean
  /** 需要 IP 白名單 */
  requireIpWhitelist: boolean
  /** 允許補打卡 */
  allowMakeupRequest: boolean
  /** 補打卡申請期限（天） */
  makeupRequestDeadlineDays: number
}

/**
 * HR 政策提供者接口
 */
export interface IHRPolicyProvider {
  // ====== 工作時間 ======

  /**
   * 取得工作時間政策
   */
  getWorkTimePolicy(): IWorkTimePolicy

  /**
   * 取得標準工時（小時）
   */
  getStandardWorkHours(): number

  /**
   * 取得遲到寬限分鐘數
   */
  getGracePeriodMinutes(): number

  /**
   * 取得加班起算時數
   */
  getOvertimeThresholdHours(): number

  // ====== 加班 ======

  /**
   * 取得加班政策
   */
  getOvertimePolicy(): IOvertimePolicy

  // ====== 休假 ======

  /**
   * 取得休假政策
   */
  getLeavePolicy(): ILeavePolicy

  /**
   * 取得預設年假天數
   */
  getDefaultAnnualLeaveDays(): number

  /**
   * 取得指定假別的年度上限
   */
  getLeaveTypeLimit(leaveType: LeaveType): number

  // ====== 考勤 ======

  /**
   * 取得考勤政策
   */
  getAttendancePolicy(): IAttendancePolicy

  /**
   * 補打卡申請期限（天）
   */
  getMakeupRequestDeadlineDays(): number
}

/**
 * 預設 HR 政策配置
 */
export const DEFAULT_HR_POLICY: {
  workTime: IWorkTimePolicy
  overtime: IOvertimePolicy
  leave: ILeavePolicy
  attendance: IAttendancePolicy
} = {
  workTime: {
    standardStartHour: 9,
    standardStartMinute: 0,
    standardEndHour: 18,
    standardEndMinute: 0,
    gracePeriodMinutes: 10,
    earlyLeaveGraceMinutes: 10
  },
  overtime: {
    standardWorkHours: 8,
    requiresPreApproval: false,
    maxDailyOvertimeHours: 4,
    maxMonthlyOvertimeHours: 46
  },
  leave: {
    defaultAnnualLeaveDays: 15,
    annualLeaveCarryOver: true,
    maxCarryOverDays: 5,
    annualLeaveInProbation: false,
    sickLeaveDocumentRequiredDays: 3,
    leaveTypeLimits: {
      ANNUAL: 15,
      SICK: 30,
      PERSONAL: 14,
      MATERNITY: 56,
      BEREAVEMENT: 8,
      OTHER: 7
    }
  },
  attendance: {
    allowCrossBranchCheckIn: false,
    requireGpsLocation: false,
    requireIpWhitelist: false,
    allowMakeupRequest: true,
    makeupRequestDeadlineDays: 7
  }
}
