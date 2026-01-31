/**
 * Campaign 表單驗證 Schema
 */

import { z } from 'zod'

// 活動類型枚舉
export const CampaignTypeEnum = z.enum(['PROMOTION', 'EVENT', 'CHECKIN', 'REFERRAL'])

// 活動狀態枚舉
export const CampaignStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'])

/**
 * 新增活動 Schema
 */
export const createCampaignSchema = z.object({
  name: z
    .string({ required_error: '請輸入活動名稱' })
    .min(1, '請輸入活動名稱')
    .max(100, '名稱不能超過 100 個字'),

  type: CampaignTypeEnum,

  description: z
    .string()
    .max(1000, '描述不能超過 1000 個字')
    .nullable()
    .optional(),

  start_date: z
    .string({ required_error: '請選擇開始日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    ),

  end_date: z
    .string({ required_error: '請選擇結束日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    ),

  budget: z
    .number()
    .min(0, '預算不能為負數')
    .nullable()
    .optional()
}).refine(
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
 * 更新活動 Schema
 */
export const updateCampaignSchema = z.object({
  name: z
    .string()
    .min(1, '請輸入活動名稱')
    .max(100, '名稱不能超過 100 個字')
    .optional(),

  type: CampaignTypeEnum.optional(),

  description: z
    .string()
    .max(1000, '描述不能超過 1000 個字')
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

  budget: z
    .number()
    .min(0, '預算不能為負數')
    .nullable()
    .optional(),

  actual_cost: z
    .number()
    .min(0, '實際花費不能為負數')
    .optional(),

  status: CampaignStatusEnum.optional()
})

/**
 * 新增素材 Schema
 */
export const createAssetSchema = z.object({
  name: z
    .string({ required_error: '請輸入素材名稱' })
    .min(1, '請輸入素材名稱')
    .max(100, '名稱不能超過 100 個字'),

  type: z.enum(['IMAGE', 'VIDEO', 'COPY', 'TEMPLATE']),

  category: z
    .string()
    .max(50, '分類不能超過 50 個字')
    .optional(),

  file_id: z
    .string()
    .uuid('請選擇有效的檔案')
    .nullable()
    .optional(),

  content: z
    .string()
    .max(5000, '內容不能超過 5000 個字')
    .nullable()
    .optional()
})

/**
 * 更新活動指標 Schema
 */
export const updateMetricsSchema = z.object({
  impressions: z
    .number()
    .int('曝光數必須是整數')
    .min(0, '曝光數不能為負數')
    .optional(),

  clicks: z
    .number()
    .int('點擊數必須是整數')
    .min(0, '點擊數不能為負數')
    .optional(),

  conversions: z
    .number()
    .int('轉換數必須是整數')
    .min(0, '轉換數不能為負數')
    .optional(),

  revenue: z
    .number()
    .min(0, '營收不能為負數')
    .optional(),

  actual_cost: z
    .number()
    .min(0, '實際花費不能為負數')
    .optional()
})

/**
 * 活動篩選 Schema
 */
export const campaignFilterSchema = z.object({
  search: z.string().optional(),
  type: CampaignTypeEnum.optional(),
  status: CampaignStatusEnum.optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20)
})

// Alias for backwards compatibility
export const campaignSchema = createCampaignSchema

// 導出類型
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>
export type CreateAssetInput = z.infer<typeof createAssetSchema>
export type UpdateMetricsInput = z.infer<typeof updateMetricsSchema>
export type CampaignFilter = z.infer<typeof campaignFilterSchema>
