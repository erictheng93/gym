/**
 * 會籍方案表單驗證 Schema
 */

import { z } from 'zod'
import { VALIDATION } from '~/constants'

// 方案類型枚舉
export const PlanTypeEnum = z.enum(['TIME_BASED', 'COUNT_BASED'])

// 方案狀態枚舉
export const PlanStatusEnum = z.enum(['enabled', 'archived'])

/**
 * 方案基本資料 Schema
 */
export const planBaseSchema = z.object({
  name: z
    .string({ required_error: VALIDATION.REQUIRED })
    .min(2, VALIDATION.NAME_MIN)
    .max(50, VALIDATION.NAME_MAX),

  plan_type: PlanTypeEnum.optional(),

  price: z
    .number({ required_error: VALIDATION.REQUIRED })
    .positive(VALIDATION.AMOUNT_POSITIVE)
    .max(10000000, VALIDATION.AMOUNT_RANGE),

  duration_months: z
    .number()
    .positive(VALIDATION.DURATION_POSITIVE)
    .max(120, VALIDATION.DURATION_MAX)
    .nullable()
    .optional(),

  class_counts: z
    .number()
    .positive(VALIDATION.CLASS_COUNTS_POSITIVE)
    .max(9999, VALIDATION.CLASS_COUNTS_MAX)
    .nullable()
    .optional(),

  is_transferable: z.boolean().default(false),

  is_pausable: z.boolean().default(false),

  description: z
    .string()
    .max(500, VALIDATION.DESCRIPTION_MAX)
    .nullable()
    .optional(),

  status: PlanStatusEnum.default('enabled'),
})

/**
 * 新增方案 Schema（包含條件驗證）
 */
export const createPlanSchema = planBaseSchema
  .extend({
    plan_type: PlanTypeEnum.refine((val) => val !== undefined, {
      message: VALIDATION.REQUIRED,
    }),
  })
  .refine(
    (data) => {
      // 期限制方案需要 duration_months
      if (data.plan_type === 'TIME_BASED') {
        return data.duration_months != null && data.duration_months > 0
      }
      return true
    },
    {
      message: VALIDATION.PLAN_PARAM_REQUIRED,
      path: ['duration_months'],
    }
  )
  .refine(
    (data) => {
      // 計次制方案需要 class_counts
      if (data.plan_type === 'COUNT_BASED') {
        return data.class_counts != null && data.class_counts > 0
      }
      return true
    },
    {
      message: VALIDATION.PLAN_PARAM_REQUIRED,
      path: ['class_counts'],
    }
  )

/**
 * 更新方案 Schema
 */
export const updatePlanSchema = planBaseSchema
  .refine(
    (data) => {
      if (data.plan_type === 'TIME_BASED') {
        return data.duration_months != null && data.duration_months > 0
      }
      return true
    },
    {
      message: VALIDATION.PLAN_PARAM_REQUIRED,
      path: ['duration_months'],
    }
  )
  .refine(
    (data) => {
      if (data.plan_type === 'COUNT_BASED') {
        return data.class_counts != null && data.class_counts > 0
      }
      return true
    },
    {
      message: VALIDATION.PLAN_PARAM_REQUIRED,
      path: ['class_counts'],
    }
  )

/**
 * 方案篩選 Schema
 */
export const planFilterSchema = z.object({
  search: z.string().optional(),
  plan_type: PlanTypeEnum.optional(),
  status: PlanStatusEnum.optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

// 導出類型
export type PlanBase = z.infer<typeof planBaseSchema>
export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>
export type PlanFilter = z.infer<typeof planFilterSchema>
export type PlanType = z.infer<typeof PlanTypeEnum>
export type PlanStatus = z.infer<typeof PlanStatusEnum>
