/**
 * Coupon 表單驗證 Schema（欄位與列舉對應 backend/src/routes/coupons.ts）
 */

import { z } from 'zod'

// 折扣類型枚舉（COUPON_DISCOUNT_TYPE）
export const DiscountTypeEnum = z.enum(['PERCENTAGE', 'FIXED'])

/**
 * 新增優惠券 Schema
 */
export const createCouponSchema = z.object({
  code: z
    .string({ error: '請輸入優惠碼' })
    .min(1, '請輸入優惠碼')
    .max(20, '代碼不能超過 20 個字')
    .regex(/^[A-Za-z0-9-]*$/, '代碼只能包含英文字母、數字和連字號'),

  name: z
    .string({ error: '請輸入優惠券名稱' })
    .min(1, '請輸入優惠券名稱')
    .max(100, '名稱不能超過 100 個字'),

  discountType: DiscountTypeEnum,

  discountValue: z
    .number({ error: '請輸入折扣值' })
    .positive('折扣值必須大於 0'),

  minPurchase: z
    .number()
    .min(0, '最低消費不能為負數')
    .default(0),

  maxDiscount: z
    .number()
    .positive('最高折扣必須大於 0')
    .nullable()
    .optional(),

  usageLimit: z
    .number()
    .int('使用次數必須是整數')
    .positive('使用次數必須大於 0')
    .nullable()
    .optional(),

  usageLimitPerMember: z
    .number()
    .int('每人使用次數必須是整數')
    .positive('每人使用次數必須大於 0')
    .default(1),

  applicablePlans: z
    .array(z.string().uuid())
    .nullable()
    .optional(),

  validFrom: z
    .string({ error: '請選擇開始日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    ),

  validUntil: z
    .string({ error: '請選擇結束日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    )
}).refine(
  (data) => !(data.discountType === 'PERCENTAGE' && data.discountValue > 100),
  {
    message: '百分比折扣不能超過 100',
    path: ['discountValue']
  }
).refine(
  (data) => new Date(data.validUntil) >= new Date(data.validFrom),
  {
    message: '結束日期不能早於開始日期',
    path: ['validUntil']
  }
)

// 導出類型
export type CouponFormInput = z.infer<typeof createCouponSchema>
