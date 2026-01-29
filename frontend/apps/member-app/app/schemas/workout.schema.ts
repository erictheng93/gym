/**
 * Workout validation schemas
 * Used for workout log operations
 */

import { z } from 'zod'

// Constraints
const DURATION_MIN = 1
const DURATION_MAX = 480 // 8 hours
const CALORIES_MIN = 0
const CALORIES_MAX = 5000
const NOTES_MAX_LENGTH = 1000

/**
 * Exercise item schema
 */
export const exerciseSchema = z.object({
  name: z.string().min(1, '請輸入運動名稱'),
  sets: z.number().int().min(1).optional(),
  reps: z.number().int().min(1).optional(),
  weight: z.number().min(0).optional(),
  duration: z.number().int().min(1).optional(), // minutes
  distance: z.number().min(0).optional(), // km
  notes: z.string().optional(),
})

export type Exercise = z.infer<typeof exerciseSchema>

/**
 * Create workout schema
 */
export const createWorkoutSchema = z.object({
  date: z
    .string()
    .optional(),
  duration: z
    .number()
    .int()
    .min(DURATION_MIN, `時長至少 ${DURATION_MIN} 分鐘`)
    .max(DURATION_MAX, `時長不能超過 ${DURATION_MAX} 分鐘`)
    .optional()
    .nullable(),
  calories: z
    .number()
    .int()
    .min(CALORIES_MIN, '消耗卡路里不能為負數')
    .max(CALORIES_MAX, `消耗卡路里不能超過 ${CALORIES_MAX}`)
    .optional()
    .nullable(),
  exercises: z
    .array(exerciseSchema)
    .optional(),
  notes: z
    .string()
    .max(NOTES_MAX_LENGTH, `備註不能超過 ${NOTES_MAX_LENGTH} 字`)
    .optional()
    .transform(val => val?.trim() || undefined),
}).refine(
  data => data.duration || (data.exercises && data.exercises.length > 0),
  { message: '請輸入運動時長或至少一項運動項目' }
)

export type CreateWorkoutFormData = z.infer<typeof createWorkoutSchema>

/**
 * Update workout schema
 */
export const updateWorkoutSchema = z.object({
  date: z
    .string()
    .optional(),
  duration: z
    .number()
    .int()
    .min(DURATION_MIN, `時長至少 ${DURATION_MIN} 分鐘`)
    .max(DURATION_MAX, `時長不能超過 ${DURATION_MAX} 分鐘`)
    .optional()
    .nullable(),
  calories: z
    .number()
    .int()
    .min(CALORIES_MIN, '消耗卡路里不能為負數')
    .max(CALORIES_MAX, `消耗卡路里不能超過 ${CALORIES_MAX}`)
    .optional()
    .nullable(),
  exercises: z
    .array(exerciseSchema)
    .optional(),
  notes: z
    .string()
    .max(NOTES_MAX_LENGTH, `備註不能超過 ${NOTES_MAX_LENGTH} 字`)
    .optional()
    .transform(val => val?.trim() || undefined),
})

export type UpdateWorkoutFormData = z.infer<typeof updateWorkoutSchema>

/**
 * Workout filter schema
 */
export const workoutFilterSchema = z.object({
  start_date: z
    .string()
    .optional(),
  end_date: z
    .string()
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

export type WorkoutFilterData = z.infer<typeof workoutFilterSchema>

/**
 * Stats period options
 */
export const WORKOUT_STATS_PERIODS = {
  week: '本週',
  month: '本月',
  year: '今年',
} as const

export type WorkoutStatsPeriod = keyof typeof WORKOUT_STATS_PERIODS

/**
 * Common exercise types for quick selection
 */
export const COMMON_EXERCISES = [
  { name: '跑步機', category: '有氧' },
  { name: '飛輪', category: '有氧' },
  { name: '橢圓機', category: '有氧' },
  { name: '划船機', category: '有氧' },
  { name: '深蹲', category: '腿部' },
  { name: '硬舉', category: '背部' },
  { name: '臥推', category: '胸部' },
  { name: '划船', category: '背部' },
  { name: '肩推', category: '肩部' },
  { name: '二頭彎舉', category: '手臂' },
  { name: '三頭下壓', category: '手臂' },
  { name: '腿推', category: '腿部' },
  { name: '腿彎舉', category: '腿部' },
  { name: '仰臥起坐', category: '核心' },
  { name: '棒式', category: '核心' },
] as const
