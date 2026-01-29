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

// Goal schemas
export {
  createGoalSchema,
  updateGoalSchema,
  goalFilterSchema,
  GOAL_TYPES,
  GOAL_STATUSES,
  type CreateGoalFormData,
  type UpdateGoalFormData,
  type GoalFilterData,
  type GoalType,
  type GoalStatus,
} from './goal.schema'

// Measurement schemas
export {
  createMeasurementSchema,
  measurementFilterSchema,
  MEASUREMENT_SOURCES,
  STATS_PERIODS,
  type CreateMeasurementFormData,
  type MeasurementFilterData,
  type MeasurementSource,
} from './measurement.schema'

// Workout schemas
export {
  createWorkoutSchema,
  updateWorkoutSchema,
  workoutFilterSchema,
  exerciseSchema,
  WORKOUT_STATS_PERIODS,
  COMMON_EXERCISES,
  type CreateWorkoutFormData,
  type UpdateWorkoutFormData,
  type WorkoutFilterData,
  type WorkoutStatsPeriod,
  type Exercise,
} from './workout.schema'

// Issue schemas
export {
  createIssueSchema,
  updateIssueSchema,
  issueFilterSchema,
  ISSUE_TYPES,
  ISSUE_STATUSES,
  ISSUE_STATUS_COLORS,
  type CreateIssueFormData,
  type UpdateIssueFormData,
  type IssueFilterData,
  type IssueType,
  type IssueStatus,
} from './issue.schema'
