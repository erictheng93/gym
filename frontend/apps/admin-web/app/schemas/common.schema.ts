/**
 * 通用表單驗證 Schema 和工具
 */

import { z } from 'zod'

// UUID 驗證
export const uuidSchema = z.string().uuid('無效的 ID 格式')

// 電話驗證
export const phoneSchema = z
  .string()
  .regex(/^[0-9]{8,15}$/, '請輸入有效的電話號碼（8-15 位數字）')

// Email 驗證
export const emailSchema = z
  .string()
  .email('請輸入有效的電子郵件')

// 日期驗證（不能是未來日期）
export const pastDateSchema = z
  .string()
  .refine(
    (val) => {
      if (!val) return true
      const date = new Date(val)
      return date <= new Date()
    },
    { message: '日期不能是未來日期' }
  )

// 日期驗證（不能是過去日期）
export const futureDateSchema = z
  .string()
  .refine(
    (val) => {
      if (!val) return true
      const date = new Date(val)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return date >= today
    },
    { message: '日期不能是過去日期' }
  )

// 分頁參數 Schema
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

// 日期範圍 Schema
export const dateRangeSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
}).refine(
  (data) => {
    if (!data.start_date || !data.end_date) return true
    const start = new Date(data.start_date)
    const end = new Date(data.end_date)
    return end >= start
  },
  {
    message: '結束日期必須晚於或等於開始日期',
    path: ['end_date'],
  }
)

// 金額 Schema（正數）
export const positiveAmountSchema = z
  .number()
  .positive('金額必須大於 0')

// 金額 Schema（非負數）
export const nonNegativeAmountSchema = z
  .number()
  .min(0, '金額不能為負數')

/**
 * 將 Zod 錯誤轉換為表單友好的格式
 */
export function formatZodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!errors[path]) {
      errors[path] = issue.message
    }
  }

  return errors
}

/**
 * 安全解析數據
 */
export function safeParse<T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  return { success: false, errors: formatZodErrors(result.error) }
}

// 導出類型
export type Pagination = z.infer<typeof paginationSchema>
export type DateRange = z.infer<typeof dateRangeSchema>
