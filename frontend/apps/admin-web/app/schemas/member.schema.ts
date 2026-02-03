/**
 * 會員表單驗證 Schema
 */

import { z } from 'zod'
import { VALIDATION } from '~/constants'

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
    .string({ error: VALIDATION.REQUIRED })
    .min(2, VALIDATION.NAME_MIN)
    .max(50, VALIDATION.NAME_MAX),

  phone: z
    .string()
    .regex(phoneRegex, VALIDATION.PHONE_INVALID)
    .nullable()
    .optional(),

  email: z
    .string()
    .email(VALIDATION.EMAIL_INVALID)
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
      { message: VALIDATION.DATE_NOT_FUTURE }
    )
    .nullable()
    .optional(),

  height: z
    .number()
    .min(50, VALIDATION.HEIGHT_MIN)
    .max(300, VALIDATION.HEIGHT_MAX)
    .nullable()
    .optional(),

  branch_id: z
    .string()
    .uuid(VALIDATION.BRANCH_INVALID)
    .nullable()
    .optional(),

  emergency_contact: z
    .string()
    .max(50, VALIDATION.EMERGENCY_CONTACT_MAX)
    .nullable()
    .optional(),

  emergency_phone: z
    .string()
    .regex(phoneRegex, VALIDATION.PHONE_INVALID)
    .nullable()
    .optional()
    .or(z.literal('')),

  tags: z
    .array(z.string())
    .nullable()
    .optional(),

  sales_person_id: z
    .string()
    .uuid(VALIDATION.UUID_INVALID)
    .nullable()
    .optional(),
})

/**
 * 新增會員 Schema
 */
export const createMemberSchema = memberBaseSchema.extend({
  branch_id: z
    .string({ error: VALIDATION.BRANCH_REQUIRED })
    .uuid(VALIDATION.BRANCH_INVALID),
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
