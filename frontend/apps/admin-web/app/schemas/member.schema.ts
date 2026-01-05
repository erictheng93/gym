/**
 * 會員表單驗證 Schema
 */

import { z } from 'zod'

// 電話驗證正則表達式
const phoneRegex = /^[0-9]{8,15}$/

// 會員狀態枚舉
export const MemberStatusEnum = z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'BANNED', 'INACTIVE'])

// 性別枚舉
export const GenderEnum = z.enum(['M', 'F', 'O'])

/**
 * 會員基本資料 Schema
 */
export const memberBaseSchema = z.object({
  full_name: z
    .string({ required_error: '請輸入會員姓名' })
    .min(2, '姓名至少需要 2 個字')
    .max(50, '姓名不能超過 50 個字'),

  phone: z
    .string()
    .regex(phoneRegex, '請輸入有效的電話號碼（8-15 位數字）')
    .nullable()
    .optional(),

  email: z
    .string()
    .email('請輸入有效的電子郵件')
    .nullable()
    .optional()
    .or(z.literal('')),

  gender: GenderEnum.nullable().optional(),

  birthday: z
    .string()
    .refine(
      (val) => {
        if (!val) return true
        const date = new Date(val)
        return date <= new Date()
      },
      { message: '生日不能是未來日期' }
    )
    .nullable()
    .optional(),

  height: z
    .number()
    .min(50, '身高至少 50 公分')
    .max(300, '身高不能超過 300 公分')
    .nullable()
    .optional(),

  branch_id: z
    .string()
    .uuid('請選擇有效的分店')
    .nullable()
    .optional(),

  emergency_contact: z
    .string()
    .max(50, '緊急聯絡人姓名不能超過 50 個字')
    .nullable()
    .optional(),

  emergency_phone: z
    .string()
    .regex(phoneRegex, '請輸入有效的緊急聯絡電話')
    .nullable()
    .optional()
    .or(z.literal('')),

  tags: z
    .array(z.string())
    .nullable()
    .optional(),

  sales_person_id: z
    .string()
    .uuid('請選擇有效的業務人員')
    .nullable()
    .optional(),
})

/**
 * 新增會員 Schema
 */
export const createMemberSchema = memberBaseSchema.extend({
  branch_id: z
    .string({ required_error: '請選擇分店' })
    .uuid('請選擇有效的分店'),
})

/**
 * 更新會員 Schema
 */
export const updateMemberSchema = memberBaseSchema.extend({
  member_status: MemberStatusEnum.optional(),
})

/**
 * 會員搜尋/篩選 Schema
 */
export const memberFilterSchema = z.object({
  search: z.string().optional(),
  branch_id: z.string().uuid().optional(),
  status: MemberStatusEnum.optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

// 導出類型
export type MemberBase = z.infer<typeof memberBaseSchema>
export type CreateMemberInput = z.infer<typeof createMemberSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
export type MemberFilter = z.infer<typeof memberFilterSchema>
