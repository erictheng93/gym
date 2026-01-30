/**
 * HR Core Interfaces
 * 統一導出所有接口定義
 */

// Tenant Context
export type {
  ITenantContext,
  IReactiveTenantContext
} from './ITenantContext'

// Data Adapter (Generic)
export type {
  IQueryFilter,
  IQueryOptions,
  IPaginatedResult,
  IAggregateOptions,
  IDataAdapter,
  IBatchDataAdapter
} from './IDataAdapter'

// Employee Adapter
export type {
  IEmployeeQueryOptions,
  IEmployeeAdapter
} from './IEmployeeAdapter'

// Attendance Adapter
export type {
  IAttendanceQueryOptions,
  IAttendanceAdapter
} from './IAttendanceAdapter'

// Leave Adapter
export type {
  ILeaveQueryOptions,
  ILeaveAdapter
} from './ILeaveAdapter'

// Shift Adapter
export type {
  IShiftQueryOptions,
  IEmployeeShiftQueryOptions,
  IShiftAdapter
} from './IShiftAdapter'

// Makeup Adapter
export type {
  IMakeupQueryOptions,
  IMakeupAdapter
} from './IMakeupAdapter'

// HR Policy Provider
export type {
  IWorkTimePolicy,
  IOvertimePolicy,
  ILeavePolicy,
  IAttendancePolicy,
  IHRPolicyProvider
} from './IHRPolicyProvider'

export { DEFAULT_HR_POLICY } from './IHRPolicyProvider'
