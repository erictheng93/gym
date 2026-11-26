/**
 * Lead 表單驗證 Schema
 *
 * Field names and enums mirror backend/src/routes/leads.ts (camelCase; the pipeline stage is `status`).
 */

import { z } from 'zod'

// Lead 來源枚舉
export const LeadSourceEnum = z.enum(['WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'EVENT', 'AD', 'OTHER'])

// Lead 狀態枚舉（銷售階段）
export const LeadStatusEnum = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL', 'NEGOTIATION', 'CONVERTED', 'LOST'])

/**
 * 新增 Lead Schema
 */
export const createLeadSchema = z.object({
  fullName: z
    .string({ error: '請輸入姓名' })
    .min(1, '請輸入姓名')
    .max(100, '姓名不能超過 100 個字'),

  phone: z
    .string({ error: '請輸入電話' })
    .min(1, '請輸入電話')
    .regex(/^[0-9+-]+$/, '請輸入有效的電話號碼'),

  // The form keeps an empty input as '' and the page omits it from the request
  email: z
    .union([z.string().email('請輸入有效的 Email'), z.literal('')])
    .nullable()
    .optional(),

  source: LeadSourceEnum,

  sourceDetail: z
    .string()
    .max(100, '來源說明不能超過 100 個字')
    .nullable()
    .optional(),

  branchId: z
    .string({ error: '請選擇分店' })
    .uuid('請選擇有效的分店'),

  assignedToId: z
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
 * 更新 Lead Schema
 */
export const updateLeadSchema = z.object({
  fullName: z
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

  assignedToId: z
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

// 導出類型
export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
