/**
 * Lead 表單驗證 Schema
 */

import { z } from 'zod'

// Lead 來源枚舉
export const LeadSourceEnum = z.enum(['FB_AD', 'IG_AD', 'GOOGLE_AD', 'WEBSITE', 'WALK_IN', 'REFERRAL'])

// Lead 狀態枚舉
export const LeadStatusEnum = z.enum(['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'VISITED', 'CONVERTED', 'LOST'])

// 活動類型枚舉
export const ActivityTypeEnum = z.enum(['CALL', 'SMS', 'EMAIL', 'VISIT', 'TRIAL'])

/**
 * 新增 Lead Schema
 */
export const createLeadSchema = z.object({
  name: z
    .string({ required_error: '請輸入姓名' })
    .min(1, '請輸入姓名')
    .max(100, '姓名不能超過 100 個字'),

  phone: z
    .string({ required_error: '請輸入電話' })
    .min(1, '請輸入電話')
    .regex(/^[0-9+-]+$/, '請輸入有效的電話號碼'),

  email: z
    .string()
    .email('請輸入有效的 Email')
    .nullable()
    .optional(),

  source: LeadSourceEnum,

  branch_id: z
    .string({ required_error: '請選擇分店' })
    .uuid('請選擇有效的分店'),

  assigned_to: z
    .string()
    .uuid('請選擇有效的員工')
    .nullable()
    .optional(),

  utm_source: z
    .string()
    .max(50, 'UTM Source 不能超過 50 個字')
    .nullable()
    .optional(),

  utm_medium: z
    .string()
    .max(50, 'UTM Medium 不能超過 50 個字')
    .nullable()
    .optional(),

  utm_campaign: z
    .string()
    .max(100, 'UTM Campaign 不能超過 100 個字')
    .nullable()
    .optional(),

  notes: z
    .string()
    .max(500, '備註不能超過 500 個字')
    .nullable()
    .optional()
})

/**
 * 更新 Lead Schema
 */
export const updateLeadSchema = z.object({
  name: z
    .string()
    .min(1, '請輸入姓名')
    .max(100, '姓名不能超過 100 個字')
    .optional(),

  phone: z
    .string()
    .regex(/^[0-9+-]+$/, '請輸入有效的電話號碼')
    .optional(),

  email: z
    .string()
    .email('請輸入有效的 Email')
    .nullable()
    .optional(),

  status: LeadStatusEnum.optional(),

  assigned_to: z
    .string()
    .uuid('請選擇有效的員工')
    .nullable()
    .optional(),

  notes: z
    .string()
    .max(500, '備註不能超過 500 個字')
    .nullable()
    .optional()
})

/**
 * 新增活動 Schema
 */
export const createActivitySchema = z.object({
  activity_type: ActivityTypeEnum,

  content: z
    .string({ required_error: '請輸入內容' })
    .min(1, '請輸入內容')
    .max(1000, '內容不能超過 1000 個字'),

  result: z
    .string()
    .max(255, '結果不能超過 255 個字')
    .nullable()
    .optional(),

  next_action: z
    .string()
    .max(255, '下一步不能超過 255 個字')
    .nullable()
    .optional(),

  next_action_date: z
    .string()
    .nullable()
    .optional()
})

/**
 * 指派 Lead Schema
 */
export const assignLeadSchema = z.object({
  assigned_to: z
    .string({ required_error: '請選擇員工' })
    .uuid('請選擇有效的員工')
})

/**
 * Lead 篩選 Schema
 */
export const leadFilterSchema = z.object({
  search: z.string().optional(),
  status: LeadStatusEnum.optional(),
  source: LeadSourceEnum.optional(),
  assigned_to: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20)
})

// 導出類型
export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type CreateActivityInput = z.infer<typeof createActivitySchema>
export type AssignLeadInput = z.infer<typeof assignLeadSchema>
export type LeadFilter = z.infer<typeof leadFilterSchema>
