/**
 * useHRContext composable
 * 便捷地獲取 HR 上下文中的各種適配器
 */

import { computed, type ComputedRef } from 'vue'
import type {
  IAttendanceAdapter,
  ILeaveAdapter,
  IShiftAdapter,
  IMakeupAdapter,
  ITenantContext,
  IHRPolicyProvider
} from '@gym-nexus/hr-core'
import {
  injectHRContext,
  tryInjectHRContext,
  createDefaultPolicyProvider,
  type IHRContext
} from './HRContext'

/**
 * useHRContext 返回值
 */
export interface UseHRContextReturn {
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
  /** HR 政策提供者 */
  policyProvider: IHRPolicyProvider
  /** 當前分店 ID */
  currentBranchId: ComputedRef<string | null>
  /** 當前員工 ID */
  currentEmployeeId: ComputedRef<string | null>
  /** 是否為總部用戶 */
  isHeadquarter: ComputedRef<boolean>
}

/**
 * 獲取 HR 上下文
 *
 * @example
 * ```ts
 * const {
 *   attendanceAdapter,
 *   leaveAdapter,
 *   currentBranchId,
 *   policyProvider
 * } = useHRContext()
 *
 * // 使用適配器
 * const attendance = await attendanceAdapter.getTodayAttendance(employeeId)
 *
 * // 使用政策
 * const gracePeriod = policyProvider.getGracePeriodMinutes()
 * ```
 */
export function useHRContext(): UseHRContextReturn {
  const context = injectHRContext()
  const policyProvider = context.policyProvider ?? createDefaultPolicyProvider()

  return {
    attendanceAdapter: context.attendanceAdapter,
    leaveAdapter: context.leaveAdapter,
    shiftAdapter: context.shiftAdapter,
    makeupAdapter: context.makeupAdapter,
    tenantContext: context.tenantContext,
    policyProvider,
    currentBranchId: computed(() => context.tenantContext.getBranchId()),
    currentEmployeeId: computed(() => context.tenantContext.getCurrentEmployeeId()),
    isHeadquarter: computed(() => context.tenantContext.isHeadquarter())
  }
}

/**
 * 嘗試獲取 HR 上下文
 * 如果上下文不存在，返回 null 而不是拋出錯誤
 */
export function useTryHRContext(): UseHRContextReturn | null {
  const context = tryInjectHRContext()
  if (!context) return null

  const policyProvider = context.policyProvider ?? createDefaultPolicyProvider()

  return {
    attendanceAdapter: context.attendanceAdapter,
    leaveAdapter: context.leaveAdapter,
    shiftAdapter: context.shiftAdapter,
    makeupAdapter: context.makeupAdapter,
    tenantContext: context.tenantContext,
    policyProvider,
    currentBranchId: computed(() => context.tenantContext.getBranchId()),
    currentEmployeeId: computed(() => context.tenantContext.getCurrentEmployeeId()),
    isHeadquarter: computed(() => context.tenantContext.isHeadquarter())
  }
}

/**
 * 獲取特定適配器的快捷方法
 */
export function useAttendanceAdapter(): IAttendanceAdapter {
  return injectHRContext().attendanceAdapter
}

export function useLeaveAdapter(): ILeaveAdapter {
  return injectHRContext().leaveAdapter
}

export function useShiftAdapter(): IShiftAdapter {
  return injectHRContext().shiftAdapter
}

export function useMakeupAdapter(): IMakeupAdapter {
  return injectHRContext().makeupAdapter
}

export function useTenantContext(): ITenantContext {
  return injectHRContext().tenantContext
}

export function useHRPolicyProvider(): IHRPolicyProvider {
  const context = injectHRContext()
  return context.policyProvider ?? createDefaultPolicyProvider()
}
