/**
 * HR 上下文
 * 提供依賴注入機制，讓 composables 可以獲取適配器
 */

import { inject, provide, type InjectionKey } from 'vue'
import type {
  IAttendanceAdapter,
  ILeaveAdapter,
  IShiftAdapter,
  IMakeupAdapter,
  ITenantContext,
  IHRPolicyProvider
} from '@gym-nexus/hr-core'
import { DEFAULT_HR_POLICY } from '@gym-nexus/hr-core'

/**
 * HR 上下文接口
 */
export interface IHRContext {
  /** 考勤適配器 */
  attendanceAdapter: IAttendanceAdapter
  /** 休假適配器 */
  leaveAdapter: ILeaveAdapter
  /** 班表適配器 */
  shiftAdapter: IShiftAdapter
  /** 補打卡適配器 */
  makeupAdapter: IMakeupAdapter
  /** 租戶上下文 */
  tenantContext: ITenantContext
  /** HR 政策提供者（可選） */
  policyProvider?: IHRPolicyProvider
}

/**
 * HR 上下文注入 key
 */
export const HR_CONTEXT_KEY: InjectionKey<IHRContext> = Symbol('hr-context')

/**
 * 提供 HR 上下文
 * 通常在應用根組件或 HR 模組根組件中調用
 *
 * @example
 * ```ts
 * // 在 app.vue 或 plugins 中
 * import { provideHRContext } from '@gym-nexus/hr-composables'
 * import { createHRAdapters } from './adapters/hr-api-adapter'
 *
 * const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl
 * const authToken = useAuthToken()
 * const adapters = createHRAdapters(apiBaseUrl, authToken)
 *
 * provideHRContext({
 *   attendanceAdapter: adapters.attendance,
 *   leaveAdapter: adapters.leave,
 *   shiftAdapter: adapters.shift,
 *   makeupAdapter: adapters.makeup,
 *   tenantContext: adapters.tenant
 * })
 * ```
 */
export function provideHRContext(context: IHRContext): void {
  provide(HR_CONTEXT_KEY, context)
}

/**
 * 注入 HR 上下文
 * 在需要使用 HR 功能的組件中調用
 *
 * @throws 如果未在父組件中提供上下文，將拋出錯誤
 */
export function injectHRContext(): IHRContext {
  const context = inject(HR_CONTEXT_KEY)
  if (!context) {
    throw new Error(
      '[HR Composables] HR context not provided. ' +
      'Make sure to call provideHRContext() in a parent component.'
    )
  }
  return context
}

/**
 * 嘗試注入 HR 上下文，如果不存在則返回 undefined
 */
export function tryInjectHRContext(): IHRContext | undefined {
  return inject(HR_CONTEXT_KEY)
}

/**
 * 創建預設的 HR 政策提供者
 */
export function createDefaultPolicyProvider(): IHRPolicyProvider {
  return {
    getWorkTimePolicy: () => DEFAULT_HR_POLICY.workTime,
    getStandardWorkHours: () => DEFAULT_HR_POLICY.overtime.standardWorkHours,
    getGracePeriodMinutes: () => DEFAULT_HR_POLICY.workTime.gracePeriodMinutes,
    getOvertimeThresholdHours: () => DEFAULT_HR_POLICY.overtime.standardWorkHours,
    getOvertimePolicy: () => DEFAULT_HR_POLICY.overtime,
    getLeavePolicy: () => DEFAULT_HR_POLICY.leave,
    getDefaultAnnualLeaveDays: () => DEFAULT_HR_POLICY.leave.defaultAnnualLeaveDays,
    getLeaveTypeLimit: (leaveType) => DEFAULT_HR_POLICY.leave.leaveTypeLimits[leaveType],
    getAttendancePolicy: () => DEFAULT_HR_POLICY.attendance,
    getMakeupRequestDeadlineDays: () => DEFAULT_HR_POLICY.attendance.makeupRequestDeadlineDays
  }
}
