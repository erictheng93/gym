/**
 * API Response Contract Schemas
 * 用於驗證後端 API 回應結構一致性
 */

import { z } from 'zod'

// ============================================
// 通用 Response 結構
// ============================================

/**
 * 標準 API 成功回應
 */
export const apiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z
      .object({
        total: z.number().optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      })
      .optional(),
  })

/**
 * 標準 API 錯誤回應
 */
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().optional(),
  message: z.string(),
  code: z.string().optional(),
})

/**
 * 分頁參數 Schema
 */
export const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

// ============================================
// 會員 API Response Schemas
// ============================================

export const memberResponseSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gender: z.enum(['M', 'F', 'O']).nullable(),
  birthday: z.string().nullable(),
  member_status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'BANNED', 'INACTIVE']),
  branch_id: z.string().uuid(),
  sales_person_id: z.string().uuid().nullable(),
  tags: z.array(z.string()).nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

export const membersListResponseSchema = apiSuccessResponseSchema(
  z.array(memberResponseSchema)
)

// ============================================
// 合約 API Response Schemas
// ============================================

export const contractResponseSchema = z.object({
  id: z.string().uuid(),
  contract_no: z.string(),
  member_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'TERMINATED']),
  start_date: z.string(),
  end_date: z.string(),
  total_amount: z.number(),
  remaining_counts: z.number().nullable(),
  payment_status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

export const contractsListResponseSchema = apiSuccessResponseSchema(
  z.array(contractResponseSchema)
)

// ============================================
// 員工 API Response Schemas
// ============================================

export const employeeResponseSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  employee_code: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  job_title_id: z.string().uuid().nullable(),
  branch_id: z.string().uuid(),
  hire_date: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

export const employeesListResponseSchema = apiSuccessResponseSchema(
  z.array(employeeResponseSchema)
)

// ============================================
// Dashboard API Response Schemas
// ============================================

export const dashboardKPIsResponseSchema = z.object({
  success: z.boolean(),
  period: z.object({
    type: z.enum(['today', 'week', 'month', 'year']),
    start_date: z.string(),
    end_date: z.string(),
  }),
  revenue: z.object({
    today: z.number(),
    mtd: z.number(),
    ytd: z.number(),
    period: z.number(),
    change: z.number(),
    transactions: z.object({
      today: z.number(),
      period: z.number(),
    }),
    by_payment_method: z.array(
      z.object({
        payment_method: z.string(),
        amount: z.number(),
        count: z.number(),
      })
    ),
    by_branch: z.array(
      z.object({
        branch_id: z.string(),
        branch_name: z.string(),
        revenue: z.number(),
        transactions: z.number(),
      })
    ),
  }),
  members: z.object({
    total: z.number(),
    active: z.number(),
    new: z.number(),
    churned: z.number(),
    active_rate: z.number(),
    by_gender: z.object({
      male: z.number(),
      female: z.number(),
    }),
    by_age: z.array(
      z.object({
        age_group: z.string(),
        count: z.number(),
      })
    ),
    by_branch: z.array(
      z.object({
        branch_id: z.string(),
        branch_name: z.string(),
        total: z.number(),
        active: z.number(),
      })
    ),
  }),
  contracts: z.object({
    active: z.number(),
    expiring_7: z.number(),
    expiring_30: z.number(),
    expiring_90: z.number(),
    renewal_rate: z.number(),
    avg_value: z.number(),
    by_type: z.array(
      z.object({
        contract_type: z.string(),
        plan_name: z.string(),
        count: z.number(),
        total_value: z.number(),
      })
    ),
  }),
  operations: z.object({
    today_checkins: z.number(),
    period_checkins: z.number(),
    peak_hour: z.number(),
    hourly_distribution: z.array(z.number()),
    class_attendance_rate: z.number(),
    by_branch: z.array(
      z.object({
        branch_id: z.string(),
        branch_name: z.string(),
        today_checkins: z.number(),
        period_checkins: z.number(),
      })
    ),
  }),
  generated_at: z.string(),
})

// ============================================
// 報表 API Response Schemas
// ============================================

export const revenueReportResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    summary: z.object({
      total_revenue: z.number(),
      new_contracts: z.number(),
      renewals: z.number(),
    }),
    trend: z.array(
      z.object({
        date: z.string(),
        revenue: z.number(),
        contracts: z.number(),
      })
    ),
    by_branch: z.array(
      z.object({
        branch_id: z.string(),
        branch_name: z.string(),
        revenue: z.number(),
        percentage: z.number(),
      })
    ),
  }),
})

export const memberGrowthReportResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    summary: z.object({
      total: z.number(),
      new: z.number(),
      churned: z.number(),
      net_growth: z.number(),
    }),
    trend: z.array(
      z.object({
        date: z.string(),
        new: z.number(),
        churned: z.number(),
        total: z.number(),
      })
    ),
  }),
})

// ============================================
// HR API Response Schemas
// ============================================

export const salaryRecordResponseSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  period: z.string(),
  base_salary: z.number(),
  overtime_hours: z.number().nullable(),
  overtime_pay: z.number().nullable(),
  bonus: z.number().nullable(),
  deductions: z.number().nullable(),
  commission: z.number().nullable(),
  net_salary: z.number(),
  status: z.enum(['PENDING', 'APPROVED', 'PAID']),
  approved_by: z.string().uuid().nullable(),
  approved_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

export const salaryRecordsListResponseSchema = apiSuccessResponseSchema(
  z.array(salaryRecordResponseSchema)
)

export const performanceReviewResponseSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  review_type: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  review_date: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  kpi_data: z.record(z.unknown()),
  overall_score: z.number().nullable(),
  reviewer_id: z.string().uuid().nullable(),
  comments: z.string().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'ACKNOWLEDGED']),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

// ============================================
// 行銷 API Response Schemas
// ============================================

export const leadResponseSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  source: z.string(),
  status: z.enum(['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'VISITED', 'CONVERTED', 'LOST']),
  assigned_to: z.string().uuid().nullable(),
  branch_id: z.string().uuid(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

export const leadsListResponseSchema = apiSuccessResponseSchema(z.array(leadResponseSchema))

export const campaignResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(['PROMOTION', 'EVENT', 'CHECKIN', 'REFERRAL']),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']),
  start_date: z.string(),
  end_date: z.string(),
  budget: z.number().nullable(),
  description: z.string().nullable(),
  branch_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

export const campaignsListResponseSchema = apiSuccessResponseSchema(
  z.array(campaignResponseSchema)
)

// ============================================
// Type Exports
// ============================================

export type MemberResponse = z.infer<typeof memberResponseSchema>
export type ContractResponse = z.infer<typeof contractResponseSchema>
export type EmployeeResponse = z.infer<typeof employeeResponseSchema>
export type DashboardKPIsResponse = z.infer<typeof dashboardKPIsResponseSchema>
export type SalaryRecordResponse = z.infer<typeof salaryRecordResponseSchema>
export type PerformanceReviewResponse = z.infer<typeof performanceReviewResponseSchema>
export type LeadResponse = z.infer<typeof leadResponseSchema>
export type CampaignResponse = z.infer<typeof campaignResponseSchema>
