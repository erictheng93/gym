/**
 * Directus Adapters
 * 統一導出所有適配器
 */

// Tenant Context
export {
  DirectusTenantContext,
  createEmptyTenantContext
} from './DirectusTenantContext'

export type { AuthData } from './DirectusTenantContext'

// Adapters
export { DirectusAttendanceAdapter } from './DirectusAttendanceAdapter'
export { DirectusLeaveAdapter } from './DirectusLeaveAdapter'
export { DirectusShiftAdapter } from './DirectusShiftAdapter'
export { DirectusMakeupAdapter } from './DirectusMakeupAdapter'
