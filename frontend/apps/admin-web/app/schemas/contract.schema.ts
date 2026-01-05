/**
 * 合約表單驗證 Schema
 */

import { z } from 'zod'

// 合約狀態枚舉
export const ContractStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'TERMINATED'])

// 付款狀態枚舉
export const PaymentStatusEnum = z.enum(['UNPAID', 'PARTIAL', 'PAID'])

/**
 * 新增合約 Schema
 */
export const createContractSchema = z.object({
  member_id: z
    .string({ required_error: '請選擇會員' })
    .uuid('請選擇有效的會員'),

  plan_id: z
    .string({ required_error: '請選擇方案' })
    .uuid('請選擇有效的方案'),

  branch_id: z
    .string({ required_error: '請選擇分店' })
    .uuid('請選擇有效的分店'),

  start_date: z
    .string({ required_error: '請選擇開始日期' })
    .refine(
      (val) => {
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      { message: '請輸入有效的日期' }
    ),

  total_amount: z
    .number({ required_error: '請輸入合約金額' })
    .positive('金額必須大於 0'),

  sales_person_id: z
    .string()
    .uuid('請選擇有效的業務人員')
    .nullable()
    .optional(),

  notes: z
    .string()
    .max(500, '備註不能超過 500 個字')
    .nullable()
    .optional(),

  digital_signature: z
    .string()
    .nullable()
    .optional(),
})

/**
 * 暫停合約 Schema
 */
export const pauseContractSchema = z.object({
  start_date: z
    .string({ required_error: '請選擇暫停開始日期' })
    .refine(
      (val) => {
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      { message: '請輸入有效的日期' }
    ),

  end_date: z
    .string({ required_error: '請選擇暫停結束日期' })
    .refine(
      (val) => {
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      { message: '請輸入有效的日期' }
    ),

  reason: z
    .string()
    .max(200, '原因不能超過 200 個字')
    .nullable()
    .optional(),
}).refine(
  (data) => {
    const start = new Date(data.start_date)
    const end = new Date(data.end_date)
    return end > start
  },
  {
    message: '結束日期必須晚於開始日期',
    path: ['end_date'],
  }
)

/**
 * 轉讓合約 Schema
 */
export const transferContractSchema = z.object({
  target_member_id: z
    .string({ required_error: '請選擇目標會員' })
    .uuid('請選擇有效的會員'),

  reason: z
    .string()
    .max(200, '原因不能超過 200 個字')
    .nullable()
    .optional(),
})

/**
 * 終止合約 Schema
 */
export const terminateContractSchema = z.object({
  reason: z
    .string({ required_error: '請輸入終止原因' })
    .min(1, '請輸入終止原因')
    .max(200, '原因不能超過 200 個字'),

  refund_amount: z
    .number()
    .min(0, '退款金額不能為負數')
    .nullable()
    .optional(),
})

/**
 * 延期合約 Schema
 */
export const extendContractSchema = z.object({
  days: z
    .number({ required_error: '請輸入延期天數' })
    .int('天數必須是整數')
    .positive('延期天數必須大於 0')
    .max(365, '延期天數不能超過 365 天'),

  reason: z
    .string()
    .max(200, '原因不能超過 200 個字')
    .nullable()
    .optional(),
})

/**
 * 續約 Schema
 */
export const renewContractSchema = z.object({
  start_date: z
    .string({ required_error: '請選擇新合約開始日期' })
    .refine(
      (val) => {
        const date = new Date(val)
        return !isNaN(date.getTime())
      },
      { message: '請輸入有效的日期' }
    ),

  total_amount: z
    .number({ required_error: '請輸入續約金額' })
    .positive('金額必須大於 0'),
})

/**
 * 合約篩選 Schema
 */
export const contractFilterSchema = z.object({
  search: z.string().optional(),
  branch_id: z.string().uuid().optional(),
  status: ContractStatusEnum.optional(),
  payment_status: PaymentStatusEnum.optional(),
  member_id: z.string().uuid().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

// 導出類型
export type CreateContractInput = z.infer<typeof createContractSchema>
export type PauseContractInput = z.infer<typeof pauseContractSchema>
export type TransferContractInput = z.infer<typeof transferContractSchema>
export type TerminateContractInput = z.infer<typeof terminateContractSchema>
export type ExtendContractInput = z.infer<typeof extendContractSchema>
export type RenewContractInput = z.infer<typeof renewContractSchema>
export type ContractFilter = z.infer<typeof contractFilterSchema>
