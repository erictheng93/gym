/**
 * HR Validators
 * 導出所有驗證器
 */

export {
  validateLeaveRequest,
  validateApprovalPermission,
  canReviewLeaveRequest,
  canCancelLeaveRequest
} from './leaveValidator.js'

export {
  validateCheckIn,
  validateCheckOut,
  validateMakeupRequest,
  isWorkDay
} from './attendanceValidator.js'

export type { ICheckValidationResult } from './attendanceValidator.js'
