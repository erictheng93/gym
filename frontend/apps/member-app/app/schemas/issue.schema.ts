/**
 * Issue validation schemas
 * Used for issue report operations
 */

import { z } from 'zod'

// Issue type options
export const ISSUE_TYPES = {
  EQUIPMENT: '設備問題',
  SERVICE: '服務問題',
  SUGGESTION: '意見建議',
  COMPLAINT: '客訴反映',
} as const

export type IssueType = keyof typeof ISSUE_TYPES

// Issue status options
export const ISSUE_STATUSES = {
  SUBMITTED: '已提交',
  IN_PROGRESS: '處理中',
  RESOLVED: '已解決',
  CLOSED: '已關閉',
} as const

export type IssueStatus = keyof typeof ISSUE_STATUSES

// Status colors for UI
export const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  SUBMITTED: 'warning',
  IN_PROGRESS: 'primary',
  RESOLVED: 'success',
  CLOSED: 'muted',
}

// Constraints
const TITLE_MAX_LENGTH = 100
const CONTENT_MAX_LENGTH = 2000

/**
 * Create issue schema
 */
export const createIssueSchema = z.object({
  type: z
    .enum(['EQUIPMENT', 'SERVICE', 'SUGGESTION', 'COMPLAINT'], {
      message: '請選擇問題類型',
    }),
  title: z
    .string()
    .min(1, '請輸入標題')
    .max(TITLE_MAX_LENGTH, `標題不能超過 ${TITLE_MAX_LENGTH} 字`)
    .transform(val => val.trim()),
  content: z
    .string()
    .min(1, '請輸入內容')
    .max(CONTENT_MAX_LENGTH, `內容不能超過 ${CONTENT_MAX_LENGTH} 字`)
    .transform(val => val.trim()),
  attachments: z
    .array(z.object({
      id: z.string(),
      filename: z.string(),
      type: z.string().optional(),
    }))
    .optional(),
})

export type CreateIssueFormData = z.infer<typeof createIssueSchema>

/**
 * Update issue schema (only for SUBMITTED status)
 */
export const updateIssueSchema = z.object({
  title: z
    .string()
    .min(1, '請輸入標題')
    .max(TITLE_MAX_LENGTH, `標題不能超過 ${TITLE_MAX_LENGTH} 字`)
    .transform(val => val.trim())
    .optional(),
  content: z
    .string()
    .min(1, '請輸入內容')
    .max(CONTENT_MAX_LENGTH, `內容不能超過 ${CONTENT_MAX_LENGTH} 字`)
    .transform(val => val.trim())
    .optional(),
  attachments: z
    .array(z.object({
      id: z.string(),
      filename: z.string(),
      type: z.string().optional(),
    }))
    .optional(),
})

export type UpdateIssueFormData = z.infer<typeof updateIssueSchema>

/**
 * Issue filter schema
 */
export const issueFilterSchema = z.object({
  status: z
    .enum(['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
    .optional(),
  type: z
    .enum(['EQUIPMENT', 'SERVICE', 'SUGGESTION', 'COMPLAINT'])
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional(),
  offset: z
    .number()
    .int()
    .min(0)
    .optional(),
})

export type IssueFilterData = z.infer<typeof issueFilterSchema>
