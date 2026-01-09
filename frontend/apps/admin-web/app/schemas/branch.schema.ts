/**
 * 分店表單驗證 Schema
 */

import { z } from 'zod'
import { VALIDATION } from '~/constants'

// 電話驗證正則表達式
const phoneRegex = /^[0-9-]{8,15}$/

// 統一編號驗證正則表達式
const taxIdRegex = /^\d{8}$/

// 分店類型枚舉
export const BranchTypeEnum = z.enum(['HEADQUARTER', 'BRANCH'])

// 分店狀態枚舉
export const BranchStatusEnum = z.enum(['active', 'archived'])

/**
 * 分店基本資料 Schema
 */
export const branchBaseSchema = z.object({
  name: z
    .string({ required_error: VALIDATION.REQUIRED })
    .min(1, VALIDATION.REQUIRED)
    .max(50, VALIDATION.NAME_MAX),

  type: BranchTypeEnum.optional(),

  address: z
    .string()
    .max(200, '地址不能超過 200 個字')
    .nullable()
    .optional(),

  phone: z
    .string()
    .regex(phoneRegex, VALIDATION.PHONE_INVALID)
    .nullable()
    .optional()
    .or(z.literal('')),

  tax_id: z
    .string()
    .regex(taxIdRegex, VALIDATION.TAX_ID_INVALID)
    .nullable()
    .optional()
    .or(z.literal('')),

  status: BranchStatusEnum.default('active'),
})

/**
 * 新增分店 Schema
 */
export const createBranchSchema = branchBaseSchema.extend({
  type: BranchTypeEnum.refine((val) => val !== undefined, {
    message: VALIDATION.REQUIRED,
  }),
})

/**
 * 更新分店 Schema
 */
export const updateBranchSchema = branchBaseSchema

// 導出類型
export type BranchBase = z.infer<typeof branchBaseSchema>
export type CreateBranchInput = z.infer<typeof createBranchSchema>
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>
export type BranchType = z.infer<typeof BranchTypeEnum>
export type BranchStatus = z.infer<typeof BranchStatusEnum>
