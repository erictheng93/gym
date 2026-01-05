/**
 * 員工表單驗證 Schema
 */

import { z } from 'zod'

// 電話驗證正則表達式
const phoneRegex = /^[0-9]{8,15}$/

// 聘僱狀態枚舉
export const EmploymentStatusEnum = z.enum(['ACTIVE', 'RESIGNED', 'LEAVE'])

// 聘僱類型枚舉
export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'FREELANCE'])

/**
 * 員工基本資料 Schema
 */
export const employeeBaseSchema = z.object({
  full_name: z
    .string({ required_error: '請輸入員工姓名' })
    .min(2, '姓名至少需要 2 個字')
    .max(50, '姓名不能超過 50 個字'),

  employee_code: z
    .string()
    .max(20, '員工編號不能超過 20 個字')
    .nullable()
    .optional(),

  branch_id: z
    .string({ required_error: '請選擇分店' })
    .uuid('請選擇有效的分店'),

  job_title_id: z
    .string({ required_error: '請選擇職位' })
    .uuid('請選擇有效的職位'),

  employment_type: EmploymentTypeEnum.default('FULL_TIME'),

  basic_salary: z
    .number()
    .min(0, '薪資不能為負數')
    .nullable()
    .optional(),
})

/**
 * 新增員工 Schema
 */
export const createEmployeeSchema = employeeBaseSchema.extend({
  user_id: z
    .string()
    .uuid('請選擇有效的用戶帳號')
    .nullable()
    .optional(),
})

/**
 * 更新員工 Schema
 */
export const updateEmployeeSchema = employeeBaseSchema.extend({
  employment_status: EmploymentStatusEnum.optional(),

  custom_permissions: z
    .record(z.boolean())
    .nullable()
    .optional(),
})

/**
 * 員工篩選 Schema
 */
export const employeeFilterSchema = z.object({
  search: z.string().optional(),
  branch_id: z.string().uuid().optional(),
  job_title_id: z.string().uuid().optional(),
  employment_status: EmploymentStatusEnum.optional(),
  employment_type: EmploymentTypeEnum.optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

/**
 * 職位 Schema
 */
export const jobTitleSchema = z.object({
  name: z
    .string({ required_error: '請輸入職位名稱' })
    .min(1, '請輸入職位名稱')
    .max(50, '職位名稱不能超過 50 個字'),

  permissions_config: z
    .record(z.boolean())
    .nullable()
    .optional(),
})

// 導出類型
export type EmployeeBase = z.infer<typeof employeeBaseSchema>
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
export type EmployeeFilter = z.infer<typeof employeeFilterSchema>
export type JobTitleInput = z.infer<typeof jobTitleSchema>
