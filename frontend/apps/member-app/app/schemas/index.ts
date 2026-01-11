/**
 * Schema exports
 * Central export point for all validation schemas
 */

// Auth schemas
export {
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  type LoginFormData,
  type OtpRequestFormData,
  type OtpVerifyFormData,
  type ForgotPasswordFormData,
  type ResetPasswordFormData,
  type ChangePasswordFormData,
} from './auth.schema'

// Booking schemas
export {
  bookSessionSchema,
  cancelBookingSchema,
  bookingFilterSchema,
  BookingStatus,
  type BookSessionFormData,
  type CancelBookingFormData,
  type BookingFilterData,
  type BookingStatusType,
} from './booking.schema'

// Review schemas
export {
  submitReviewSchema,
  updateReviewSchema,
  reviewFilterSchema,
  RATING_LABELS,
  type SubmitReviewFormData,
  type UpdateReviewFormData,
  type ReviewFilterData,
} from './review.schema'

// Profile schemas
export {
  completeProfileSchema,
  updateProfileSchema,
  contractPauseSchema,
  GENDER_OPTIONS,
  type CompleteProfileFormData,
  type UpdateProfileFormData,
  type ContractPauseFormData,
} from './profile.schema'
