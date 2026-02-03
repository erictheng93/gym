/**
 * Coupon 表單驗證 Schema
 */

import { z } from 'zod'

// 折扣類型枚舉
export const DiscountTypeEnum = z.enum(['PERCENTAGE', 'FIXED_AMOUNT'])

// 優惠券狀態枚舉
export const CouponStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED'])

/**
 * 新增優惠券 Schema
 */
export const createCouponSchema = z.object({
  code: z
    .string()
    .max(30, '代碼不能超過 30 個字')
    .regex(/^[A-Z0-9-]*$/, '代碼只能包含大寫字母、數字和連字號')
    .optional(),

  name: z
    .string({ error: '請輸入優惠券名稱' })
    .min(1, '請輸入優惠券名稱')
    .max(100, '名稱不能超過 100 個字'),

  discount_type: DiscountTypeEnum,

  discount_value: z
    .number({ error: '請輸入折扣值' })
    .positive('折扣值必須大於 0'),

  min_purchase: z
    .number()
    .min(0, '最低消費不能為負數')
    .default(0),

  max_discount: z
    .number()
    .positive('最高折扣必須大於 0')
    .nullable()
    .optional(),

  usage_limit: z
    .number()
    .int('使用次數必須是整數')
    .positive('使用次數必須大於 0')
    .nullable()
    .optional(),

  usage_per_member: z
    .number()
    .int('每人使用次數必須是整數')
    .positive('每人使用次數必須大於 0')
    .default(1),

  applicable_plans: z
    .array(z.string().uuid())
    .nullable()
    .optional(),

  start_date: z
    .string({ error: '請選擇開始日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    ),

  end_date: z
    .string({ error: '請選擇結束日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    )
}).refine(
  (data) => {
    if (data.discount_type === 'PERCENTAGE' && data.discount_value > 100) {
      return false
    }
    return true
  },
  {
    message: '百分比折扣不能超過 100',
    path: ['discount_value']
  }
).refine(
  (data) => {
    const start = new Date(data.start_date)
    const end = new Date(data.end_date)
    return end > start
  },
  {
    message: '結束日期必須晚於開始日期',
    path: ['end_date']
  }
)

/**
 * 更新優惠券 Schema
 */
export const updateCouponSchema = z.object({
  name: z
    .string()
    .min(1, '請輸入優惠券名稱')
    .max(100, '名稱不能超過 100 個字')
    .optional(),

  discount_type: DiscountTypeEnum.optional(),

  discount_value: z
    .number()
    .positive('折扣值必須大於 0')
    .optional(),

  min_purchase: z
    .number()
    .min(0, '最低消費不能為負數')
    .optional(),

  max_discount: z
    .number()
    .positive('最高折扣必須大於 0')
    .nullable()
    .optional(),

  usage_limit: z
    .number()
    .int('使用次數必須是整數')
    .positive('使用次數必須大於 0')
    .nullable()
    .optional(),

  usage_per_member: z
    .number()
    .int('每人使用次數必須是整數')
    .positive('每人使用次數必須大於 0')
    .optional(),

  applicable_plans: z
    .array(z.string().uuid())
    .nullable()
    .optional(),

  start_date: z
    .string()
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    )
    .optional(),

  end_date: z
    .string()
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    )
    .optional(),

  status: CouponStatusEnum.optional()
})

/**
 * 批次產生優惠券 Schema
 */
export const batchGenerateCouponSchema = z.object({
  prefix: z
    .string()
    .max(10, '前綴不能超過 10 個字')
    .regex(/^[A-Z0-9]*$/, '前綴只能包含大寫字母和數字')
    .optional(),

  count: z
    .number({ error: '請輸入數量' })
    .int('數量必須是整數')
    .min(1, '數量至少為 1')
    .max(1000, '數量不能超過 1000'),

  name: z
    .string({ error: '請輸入優惠券名稱' })
    .min(1, '請輸入優惠券名稱')
    .max(100, '名稱不能超過 100 個字'),

  discount_type: DiscountTypeEnum,

  discount_value: z
    .number({ error: '請輸入折扣值' })
    .positive('折扣值必須大於 0'),

  min_purchase: z
    .number()
    .min(0, '最低消費不能為負數')
    .default(0),

  max_discount: z
    .number()
    .positive('最高折扣必須大於 0')
    .nullable()
    .optional(),

  usage_limit: z
    .number()
    .int('使用次數必須是整數')
    .positive('使用次數必須大於 0')
    .default(1),

  start_date: z
    .string({ error: '請選擇開始日期' }),

  end_date: z
    .string({ error: '請選擇結束日期' })
})

/**
 * 驗證優惠券 Schema
 */
export const validateCouponSchema = z.object({
  code: z
    .string({ error: '請輸入優惠券代碼' })
    .min(1, '請輸入優惠券代碼'),

  member_id: z
    .string({ error: '請選擇會員' })
    .uuid('請選擇有效的會員'),

  amount: z
    .number({ error: '請輸入金額' })
    .positive('金額必須大於 0'),

  plan_id: z
    .string()
    .uuid('請選擇有效的方案')
    .optional()
})

// 導出類型
export type CreateCouponInput = z.infer<typeof createCouponSchema>
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>
export type BatchGenerateCouponInput = z.infer<typeof batchGenerateCouponSchema>
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>
