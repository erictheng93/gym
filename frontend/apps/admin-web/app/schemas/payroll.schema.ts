/**
 * Payroll 表單驗證 Schema
 */

import { z } from 'zod'

// 薪資狀態枚舉
export const SalaryStatusEnum = z.enum(['PENDING', 'APPROVED', 'PAID'])

// 異動類型枚舉
export const PromotionTypeEnum = z.enum(['PROMOTION', 'TRANSFER', 'DEMOTION'])

/**
 * 產生薪資 Schema
 */
export const generatePayrollSchema = z.object({
  period: z
    .string({ error: '請選擇薪資期間' })
    .regex(/^\d{4}-\d{2}$/, '期間格式必須為 YYYY-MM'),

  branch_id: z
    .string()
    .uuid('請選擇有效的分店')
    .optional(),

  employee_ids: z
    .array(z.string().uuid())
    .optional()
})

/**
 * 調整薪資 Schema
 */
export const adjustSalarySchema = z.object({
  bonus: z
    .number()
    .min(0, '獎金不能為負數')
    .optional(),

  deductions: z
    .number()
    .min(0, '扣款不能為負數')
    .optional(),

  overtime_pay: z
    .number()
    .min(0, '加班費不能為負數')
    .optional(),

  commission: z
    .number()
    .min(0, '獎金提成不能為負數')
    .optional(),

  notes: z
    .string()
    .max(500, '備註不能超過 500 個字')
    .optional()
})

/**
 * 核准薪資 Schema
 */
export const approveSalarySchema = z.object({
  approved_by: z
    .string({ error: '核准人是必填' })
    .uuid('請選擇有效的員工')
})

/**
 * 批次核准 Schema
 */
export const batchApproveSchema = z.object({
  record_ids: z
    .array(z.string().uuid())
    .min(1, '請至少選擇一筆紀錄'),

  approved_by: z
    .string({ error: '核准人是必填' })
    .uuid('請選擇有效的員工')
})

/**
 * 標記已發放 Schema
 */
export const markAsPaidSchema = z.object({
  paid_at: z
    .string()
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    )
    .optional(),

  payment_reference: z
    .string()
    .max(100, '付款參考編號不能超過 100 個字')
    .optional()
})

/**
 * 新增異動 Schema
 */
export const createPromotionSchema = z.object({
  employee_id: z
    .string({ error: '請選擇員工' })
    .uuid('請選擇有效的員工'),

  type: PromotionTypeEnum,

  from_job_title_id: z
    .string()
    .uuid('請選擇有效的職稱')
    .nullable()
    .optional(),

  to_job_title_id: z
    .string()
    .uuid('請選擇有效的職稱')
    .nullable()
    .optional(),

  from_branch_id: z
    .string()
    .uuid('請選擇有效的分店')
    .nullable()
    .optional(),

  to_branch_id: z
    .string()
    .uuid('請選擇有效的分店')
    .nullable()
    .optional(),

  effective_date: z
    .string({ error: '請選擇生效日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    ),

  reason: z
    .string()
    .max(500, '原因不能超過 500 個字')
    .optional(),

  new_base_salary: z
    .number()
    .min(0, '新底薪不能為負數')
    .optional()
})

/**
 * 薪資篩選 Schema
 */
export const salaryFilterSchema = z.object({
  employee_id: z.string().uuid().optional(),
  period: z.string().optional(),
  status: SalaryStatusEnum.optional(),
  branch_id: z.string().uuid().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20)
})

/**
 * 異動篩選 Schema
 */
export const promotionFilterSchema = z.object({
  employee_id: z.string().uuid().optional(),
  type: PromotionTypeEnum.optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20)
})

// 導出類型
export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>
export type AdjustSalaryInput = z.infer<typeof adjustSalarySchema>
export type ApproveSalaryInput = z.infer<typeof approveSalarySchema>
export type BatchApproveInput = z.infer<typeof batchApproveSchema>
export type MarkAsPaidInput = z.infer<typeof markAsPaidSchema>
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>
export type SalaryFilter = z.infer<typeof salaryFilterSchema>
export type PromotionFilter = z.infer<typeof promotionFilterSchema>
