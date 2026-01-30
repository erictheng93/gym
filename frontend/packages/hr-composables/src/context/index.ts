/**
 * HR Context
 * 統一導出上下文相關功能
 */

export {
  HR_CONTEXT_KEY,
  provideHRContext,
  injectHRContext,
  tryInjectHRContext,
  createDefaultPolicyProvider
} from './HRContext'

export type { IHRContext } from './HRContext'

export {
  useHRContext,
  useTryHRContext,
  useAttendanceAdapter,
  useLeaveAdapter,
  useShiftAdapter,
  useMakeupAdapter,
  useTenantContext,
  useHRPolicyProvider
} from './useHRContext'

export type { UseHRContextReturn } from './useHRContext'
