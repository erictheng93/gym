/**
 * HR Validators
 * 導出所有驗證器
 */

export {
  validateLeaveRequest,
  validateApprovalPermission,
  canReviewLeaveRequest,
  canCancelLeaveRequest
} from './leaveValidator'

export {
  validateCheckIn,
  validateCheckOut,
  validateMakeupRequest,
  isWorkDay
} from './attendanceValidator'

export type { ICheckValidationResult } from './attendanceValidator'
