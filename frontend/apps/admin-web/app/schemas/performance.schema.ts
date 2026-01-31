/**
 * Performance Review 表單驗證 Schema
 */

import { z } from 'zod'

// 考核類型枚舉
export const ReviewTypeEnum = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL'])

// 考核狀態枚舉
export const ReviewStatusEnum = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED'])

/**
 * KPI 項目 Schema
 */
export const kpiItemSchema = z.object({
  id: z.string({ required_error: 'KPI ID 是必填' }),
  name: z.string({ required_error: 'KPI 名稱是必填' }).min(1, '請輸入 KPI 名稱'),
  weight: z.number({ required_error: '權重是必填' }).min(0, '權重不能為負數').max(100, '權重不能超過 100'),
  target: z.number({ required_error: '目標值是必填' }).min(0, '目標值不能為負數'),
  actual: z.number().min(0, '實際值不能為負數').optional(),
  achievement: z.number().optional(),
  unit: z.string().optional()
})

/**
 * 新增績效考核 Schema
 */
export const createReviewSchema = z.object({
  employee_id: z
    .string({ required_error: '請選擇員工' })
    .uuid('請選擇有效的員工'),

  review_period: z
    .string({ required_error: '請輸入考核期間' })
    .min(1, '請輸入考核期間'),

  review_type: ReviewTypeEnum,

  kpi_data: z
    .array(kpiItemSchema)
    .optional(),

  reviewer_id: z
    .string()
    .uuid('請選擇有效的審核人')
    .nullable()
    .optional()
})

/**
 * 更新績效考核 Schema
 */
export const updateReviewSchema = z.object({
  kpi_data: z
    .array(kpiItemSchema)
    .optional(),

  score: z
    .number()
    .min(0, '分數不能為負數')
    .max(100, '分數不能超過 100')
    .optional(),

  reviewer_comments: z
    .string()
    .max(2000, '評語不能超過 2000 個字')
    .nullable()
    .optional(),

  employee_comments: z
    .string()
    .max(2000, '員工回饋不能超過 2000 個字')
    .nullable()
    .optional(),

  improvement_plan: z
    .string()
    .max(2000, '改善計劃不能超過 2000 個字')
    .nullable()
    .optional()
})

/**
 * 提交審核 Schema
 */
export const submitReviewSchema = z.object({
  reviewer_id: z
    .string()
    .uuid('請選擇有效的審核人')
    .optional()
})

/**
 * 核准審核 Schema
 */
export const approveReviewSchema = z.object({
  reviewer_id: z
    .string({ required_error: '審核人是必填' })
    .uuid('請選擇有效的審核人'),

  final_score: z
    .number()
    .min(0, '分數不能為負數')
    .max(100, '分數不能超過 100')
    .optional(),

  reviewer_comments: z
    .string()
    .max(2000, '評語不能超過 2000 個字')
    .optional()
})

/**
 * 退回審核 Schema
 */
export const rejectReviewSchema = z.object({
  reviewer_id: z
    .string()
    .uuid('請選擇有效的審核人')
    .optional(),

  rejection_reason: z
    .string({ required_error: '請輸入退回原因' })
    .min(1, '請輸入退回原因')
    .max(500, '退回原因不能超過 500 個字')
})

/**
 * 新增 KPI 範本 Schema
 */
export const createTemplateSchema = z.object({
  name: z
    .string({ required_error: '請輸入範本名稱' })
    .min(1, '請輸入範本名稱')
    .max(100, '名稱不能超過 100 個字'),

  job_title_id: z
    .string()
    .uuid('請選擇有效的職稱')
    .nullable()
    .optional(),

  review_type: ReviewTypeEnum,

  kpi_config: z
    .array(kpiItemSchema)
    .min(1, '至少需要一個 KPI 項目'),

  is_default: z
    .boolean()
    .default(false)
}).refine(
  (data) => {
    const totalWeight = data.kpi_config.reduce((sum, kpi) => sum + (kpi.weight || 0), 0)
    return totalWeight === 100
  },
  {
    message: 'KPI 權重總和必須等於 100',
    path: ['kpi_config']
  }
)

/**
 * 績效考核篩選 Schema
 */
export const reviewFilterSchema = z.object({
  employee_id: z.string().uuid().optional(),
  reviewer_id: z.string().uuid().optional(),
  status: ReviewStatusEnum.optional(),
  review_type: ReviewTypeEnum.optional(),
  period: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20)
})

// 導出類型
export type KPIItem = z.infer<typeof kpiItemSchema>
export type CreateReviewInput = z.infer<typeof createReviewSchema>
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>
export type ApproveReviewInput = z.infer<typeof approveReviewSchema>
export type RejectReviewInput = z.infer<typeof rejectReviewSchema>
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type ReviewFilter = z.infer<typeof reviewFilterSchema>
