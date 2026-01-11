/**
 * Profile validation schemas
 * Used for member profile operations
 */

import { z } from 'zod'

// Phone number regex for Taiwan mobile numbers
const PHONE_REGEX = /^09\d{8}$/

// Name constraints
const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 50

/**
 * Complete profile schema (after social login)
 */
export const completeProfileSchema = z.object({
  full_name: z
    .string()
    .min(NAME_MIN_LENGTH, `姓名至少需要 ${NAME_MIN_LENGTH} 個字`)
    .max(NAME_MAX_LENGTH, `姓名不能超過 ${NAME_MAX_LENGTH} 個字`)
    .regex(/^[\u4e00-\u9fa5a-zA-Z\s]+$/, '姓名只能包含中文、英文字母和空格'),
  phone: z
    .string()
    .min(1, '請輸入手機號碼')
    .regex(PHONE_REGEX, '請輸入有效的手機號碼（09開頭，共10碼）'),
  gender: z
    .enum(['MALE', 'FEMALE', 'OTHER'])
    .optional()
    .nullable(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '請輸入有效的日期格式（YYYY-MM-DD）')
    .optional()
    .refine(val => {
      if (!val) return true
      const date = new Date(val)
      const now = new Date()
      return date < now && date > new Date('1900-01-01')
    }, '請輸入有效的出生日期'),
  branch_id: z
    .string()
    .uuid('無效的分店')
    .optional(),
  emergency_contact: z
    .string()
    .min(NAME_MIN_LENGTH, `緊急聯絡人姓名至少需要 ${NAME_MIN_LENGTH} 個字`)
    .max(NAME_MAX_LENGTH, `緊急聯絡人姓名不能超過 ${NAME_MAX_LENGTH} 個字`)
    .optional(),
  emergency_phone: z
    .string()
    .regex(PHONE_REGEX, '請輸入有效的緊急聯絡電話')
    .optional(),
})

export type CompleteProfileFormData = z.infer<typeof completeProfileSchema>

/**
 * Update profile schema (for existing members)
 */
export const updateProfileSchema = z.object({
  full_name: z
    .string()
    .min(NAME_MIN_LENGTH, `姓名至少需要 ${NAME_MIN_LENGTH} 個字`)
    .max(NAME_MAX_LENGTH, `姓名不能超過 ${NAME_MAX_LENGTH} 個字`)
    .optional(),
  phone: z
    .string()
    .regex(PHONE_REGEX, '請輸入有效的手機號碼')
    .optional(),
  email: z
    .string()
    .email('請輸入有效的電子郵件')
    .optional(),
  gender: z
    .enum(['MALE', 'FEMALE', 'OTHER'])
    .optional()
    .nullable(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '請輸入有效的日期格式')
    .optional(),
  address: z
    .string()
    .max(200, '地址不能超過 200 字')
    .optional(),
  emergency_contact: z
    .string()
    .max(NAME_MAX_LENGTH, `緊急聯絡人姓名不能超過 ${NAME_MAX_LENGTH} 個字`)
    .optional(),
  emergency_phone: z
    .string()
    .regex(PHONE_REGEX, '請輸入有效的緊急聯絡電話')
    .optional(),
})

export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>

/**
 * Contract pause schema
 */
export const contractPauseSchema = z.object({
  contract_id: z
    .string()
    .uuid('無效的合約'),
  reason: z
    .string()
    .min(1, '請輸入暫停原因')
    .max(500, '暫停原因不能超過 500 字'),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '請輸入有效的開始日期'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '請輸入有效的結束日期')
    .optional(),
}).refine(data => {
  if (!data.end_date) return true
  return new Date(data.start_date) < new Date(data.end_date)
}, {
  message: '結束日期必須晚於開始日期',
  path: ['end_date'],
})

export type ContractPauseFormData = z.infer<typeof contractPauseSchema>

/**
 * Gender options for display
 */
export const GENDER_OPTIONS = [
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' },
  { value: 'OTHER', label: '其他' },
] as const
