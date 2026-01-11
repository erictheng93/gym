/**
 * Review validation schemas
 * Used for class review operations
 */

import { z } from 'zod'

// Review constraints
const RATING_MIN = 1
const RATING_MAX = 5
const COMMENT_MAX_LENGTH = 1000

/**
 * Submit review schema
 */
export const submitReviewSchema = z.object({
  booking_id: z
    .string()
    .uuid('無效的預約'),
  rating: z
    .number()
    .int('評分必須為整數')
    .min(RATING_MIN, `評分最低為 ${RATING_MIN} 星`)
    .max(RATING_MAX, `評分最高為 ${RATING_MAX} 星`),
  comment: z
    .string()
    .max(COMMENT_MAX_LENGTH, `評論不能超過 ${COMMENT_MAX_LENGTH} 字`)
    .optional()
    .transform(val => val?.trim() || undefined),
})

export type SubmitReviewFormData = z.infer<typeof submitReviewSchema>

/**
 * Update review schema
 */
export const updateReviewSchema = z.object({
  rating: z
    .number()
    .int('評分必須為整數')
    .min(RATING_MIN, `評分最低為 ${RATING_MIN} 星`)
    .max(RATING_MAX, `評分最高為 ${RATING_MAX} 星`),
  comment: z
    .string()
    .max(COMMENT_MAX_LENGTH, `評論不能超過 ${COMMENT_MAX_LENGTH} 字`)
    .optional()
    .transform(val => val?.trim() || undefined),
})

export type UpdateReviewFormData = z.infer<typeof updateReviewSchema>

/**
 * Review filter schema (for querying reviews)
 */
export const reviewFilterSchema = z.object({
  class_id: z
    .string()
    .uuid()
    .optional(),
  instructor_id: z
    .string()
    .uuid()
    .optional(),
  min_rating: z
    .number()
    .int()
    .min(RATING_MIN)
    .max(RATING_MAX)
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional(),
  offset: z
    .number()
    .int()
    .min(0)
    .optional(),
})

export type ReviewFilterData = z.infer<typeof reviewFilterSchema>

/**
 * Rating labels for display
 */
export const RATING_LABELS: Record<number, string> = {
  5: '非常滿意',
  4: '滿意',
  3: '普通',
  2: '不滿意',
  1: '非常不滿意',
}
