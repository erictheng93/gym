/**
 * Goal validation schemas
 * Used for member fitness goal operations
 */

import { z } from 'zod'

// Goal type options
export const GOAL_TYPES = {
  WEIGHT_LOSS: '減重',
  MUSCLE_GAIN: '增肌',
  BODY_SHAPE: '體態雕塑',
  HEALTH: '健康維持',
  OTHER: '其他',
} as const

export type GoalType = keyof typeof GOAL_TYPES

// Goal status options
export const GOAL_STATUSES = {
  IN_PROGRESS: '進行中',
  ACHIEVED: '已達成',
  ABANDONED: '已放棄',
} as const

export type GoalStatus = keyof typeof GOAL_STATUSES

// Constraints
const NOTES_MAX_LENGTH = 500

/**
 * Create goal schema
 */
export const createGoalSchema = z.object({
  goal_type: z
    .enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'BODY_SHAPE', 'HEALTH', 'OTHER'], {
      message: '請選擇目標類型',
    }),
  target_value: z
    .object({
      description: z.string().min(1, '請輸入目標描述'),
      value: z.number().optional(),
      unit: z.string().optional(),
    })
    .or(z.record(z.string(), z.unknown())),
  current_value: z
    .object({
      description: z.string().optional(),
      value: z.number().optional(),
      unit: z.string().optional(),
    })
    .or(z.record(z.string(), z.unknown()))
    .optional(),
  start_date: z
    .string()
    .optional(),
  target_date: z
    .string()
    .optional(),
  notes: z
    .string()
    .max(NOTES_MAX_LENGTH, `備註不能超過 ${NOTES_MAX_LENGTH} 字`)
    .optional()
    .transform(val => val?.trim() || undefined),
})

export type CreateGoalFormData = z.infer<typeof createGoalSchema>

/**
 * Update goal schema
 */
export const updateGoalSchema = z.object({
  current_value: z
    .object({
      description: z.string().optional(),
      value: z.number().optional(),
      unit: z.string().optional(),
    })
    .or(z.record(z.string(), z.unknown()))
    .optional(),
  target_value: z
    .object({
      description: z.string().optional(),
      value: z.number().optional(),
      unit: z.string().optional(),
    })
    .or(z.record(z.string(), z.unknown()))
    .optional(),
  target_date: z
    .string()
    .optional(),
  status: z
    .enum(['IN_PROGRESS', 'ACHIEVED', 'ABANDONED'])
    .optional(),
  notes: z
    .string()
    .max(NOTES_MAX_LENGTH, `備註不能超過 ${NOTES_MAX_LENGTH} 字`)
    .optional()
    .transform(val => val?.trim() || undefined),
})

export type UpdateGoalFormData = z.infer<typeof updateGoalSchema>

/**
 * Goal filter schema
 */
export const goalFilterSchema = z.object({
  status: z
    .enum(['IN_PROGRESS', 'ACHIEVED', 'ABANDONED'])
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

export type GoalFilterData = z.infer<typeof goalFilterSchema>
