/**
 * Campaign 表單驗證 Schema（欄位與列舉對應 backend/src/routes/campaigns.ts）
 */

import { z } from 'zod'

// 活動類型枚舉（CAMPAIGN_TYPE）
export const CampaignTypeEnum = z.enum(['PROMOTION', 'REFERRAL', 'SEASONAL', 'MEMBERSHIP', 'EVENT', 'OTHER'])

/**
 * 新增活動 Schema
 */
export const createCampaignSchema = z.object({
  name: z
    .string({ error: '請輸入活動名稱' })
    .min(1, '請輸入活動名稱')
    .max(100, '名稱不能超過 100 個字'),

  campaignType: CampaignTypeEnum,

  description: z
    .string()
    .max(1000, '描述不能超過 1000 個字')
    .optional(),

  startDate: z
    .string({ error: '請選擇開始日期' })
    .refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: '請輸入有效的日期' }
    ),

  endDate: z
    .string({ error: '請選擇結束日期' })
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
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    return end >= start
  },
  {
    message: '結束日期不能早於開始日期',
    path: ['endDate']
  }
)

// Alias for backwards compatibility
export const campaignSchema = createCampaignSchema

// 導出類型
export type CampaignFormInput = z.infer<typeof createCampaignSchema>
