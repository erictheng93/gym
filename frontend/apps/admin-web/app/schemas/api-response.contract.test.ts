// -nocheck
/**
 * API Contract Tests
 * 驗證後端 API 回應結構與前端 Schema 定義一致
 */

import { describe, it, expect } from 'vitest'
import {
  memberResponseSchema,
  membersListResponseSchema,
  contractResponseSchema,
  contractsListResponseSchema,
  employeeResponseSchema,
  employeesListResponseSchema,
  dashboardKPIsResponseSchema,
  salaryRecordResponseSchema,
  salaryRecordsListResponseSchema,
  leadResponseSchema,
  leadsListResponseSchema,
  campaignResponseSchema,
  revenueReportResponseSchema,
  memberGrowthReportResponseSchema,
  apiErrorResponseSchema,
} from './api-response.schema'

// Mock API responses (simulating real backend responses)
const mockMemberResponse = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  full_name: '張三',
  phone: '0912345678',
  email: 'zhang@example.com',
  gender: 'M',
  birthday: '1990-01-15',
  member_status: 'ACTIVE',
  branch_id: '550e8400-e29b-41d4-a716-446655440001',
  sales_person_id: '550e8400-e29b-41d4-a716-446655440002',
  tags: ['VIP', '健身達人'],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-15T10:30:00Z',
}

const mockContractResponse = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  contract_no: 'CT-2024-001',
  member_id: '550e8400-e29b-41d4-a716-446655440000',
  plan_id: '550e8400-e29b-41d4-a716-446655440004',
  branch_id: '550e8400-e29b-41d4-a716-446655440001',
  status: 'ACTIVE',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  total_amount: 36000,
  remaining_counts: 24,
  payment_status: 'PAID',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T10:30:00Z',
}

const mockEmployeeResponse = {
  id: '550e8400-e29b-41d4-a716-446655440005',
  full_name: '李教練',
  employee_code: 'E001',
  email: 'li@gym.com',
  phone: '0922333444',
  job_title_id: '550e8400-e29b-41d4-a716-446655440006',
  branch_id: '550e8400-e29b-41d4-a716-446655440001',
  hire_date: '2023-06-01',
  status: 'ACTIVE',
  created_at: '2023-06-01T00:00:00Z',
  updated_at: null,
}

const mockDashboardKPIsResponse = {
  success: true,
  period: {
    type: 'today' as const,
    start_date: '2024-06-15',
    end_date: '2024-06-15',
  },
  revenue: {
    today: 25000,
    mtd: 450000,
    ytd: 2500000,
    period: 25000,
    change: 15.5,
    transactions: { today: 5, period: 5 },
    by_payment_method: [
      { payment_method: 'CASH', amount: 10000, count: 2 },
      { payment_method: 'CREDIT_CARD', amount: 15000, count: 3 },
    ],
    by_branch: [
      { branch_id: 'b1', branch_name: '台北店', revenue: 25000, transactions: 5 },
    ],
  },
  members: {
    total: 1200,
    active: 950,
    new: 45,
    churned: 12,
    active_rate: 79.17,
    by_gender: { male: 550, female: 650 },
    by_age: [
      { age_group: '18-25', count: 200 },
      { age_group: '26-35', count: 400 },
    ],
    by_branch: [
      { branch_id: 'b1', branch_name: '台北店', total: 1200, active: 950 },
    ],
  },
  contracts: {
    active: 800,
    expiring_7: 15,
    expiring_30: 45,
    expiring_90: 120,
    renewal_rate: 85.5,
    avg_value: 28000,
    by_type: [
      { contract_type: 'TIME_BASED', plan_name: '年費會籍', count: 500, total_value: 15000000 },
    ],
  },
  operations: {
    today_checkins: 156,
    period_checkins: 156,
    peak_hour: 18,
    hourly_distribution: [0, 0, 0, 0, 0, 0, 10, 25, 35, 30, 20, 15, 20, 25, 30, 35, 45, 50, 55, 45, 30, 20, 10, 5],
    class_attendance_rate: 87.5,
    by_branch: [
      { branch_id: 'b1', branch_name: '台北店', today_checkins: 156, period_checkins: 156 },
    ],
  },
  generated_at: '2024-06-15T18:00:00Z',
}

const mockSalaryRecordResponse = {
  id: '550e8400-e29b-41d4-a716-446655440007',
  employee_id: '550e8400-e29b-41d4-a716-446655440005',
  period: '2024-06',
  base_salary: 45000,
  overtime_hours: 10,
  overtime_pay: 2812,
  bonus: 5000,
  deductions: 1000,
  commission: 8000,
  net_salary: 59812,
  status: 'APPROVED',
  approved_by: '550e8400-e29b-41d4-a716-446655440008',
  approved_at: '2024-06-25T10:00:00Z',
  paid_at: null,
  notes: '績效獎金',
  created_at: '2024-06-20T00:00:00Z',
  updated_at: '2024-06-25T10:00:00Z',
}

const mockLeadResponse = {
  id: '550e8400-e29b-41d4-a716-446655440009',
  full_name: '王小明',
  phone: '0933444555',
  email: 'wang@example.com',
  source: 'FB_ADS',
  status: 'TRIAL_BOOKED',
  assigned_to: '550e8400-e29b-41d4-a716-446655440005',
  branch_id: '550e8400-e29b-41d4-a716-446655440001',
  notes: '對重訓有興趣',
  created_at: '2024-06-10T00:00:00Z',
  updated_at: '2024-06-12T15:30:00Z',
}

const mockCampaignResponse = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: '夏季優惠活動',
  type: 'PROMOTION' as const,
  status: 'ACTIVE' as const,
  start_date: '2024-06-01',
  end_date: '2024-08-31',
  budget: 50000,
  description: '夏季會員招募優惠',
  branch_id: null,
  created_at: '2024-05-15T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
}

describe('API Contract Tests - 會員模組', () => {
  it('會員單一回應結構應符合 Schema', () => {
    const result = memberResponseSchema.safeParse(mockMemberResponse)
    expect(result.success).toBe(true)
    if (!result.success) {
      console.error('Schema validation errors:', result.error.errors)
    }
  })

  it('會員列表回應結構應符合 Schema', () => {
    const listResponse = {
      success: true,
      data: [mockMemberResponse],
      meta: { total: 1, page: 1, limit: 20 },
    }
    const result = membersListResponseSchema.safeParse(listResponse)
    expect(result.success).toBe(true)
  })

  it('缺少必要欄位應驗證失敗', () => {
    const invalidMember = { ...mockMemberResponse, full_name: undefined }
    const result = memberResponseSchema.safeParse(invalidMember)
    expect(result.success).toBe(false)
  })

  it('無效的狀態值應驗證失敗', () => {
    const invalidMember = { ...mockMemberResponse, member_status: 'INVALID_STATUS' }
    const result = memberResponseSchema.safeParse(invalidMember)
    expect(result.success).toBe(false)
  })
})

describe('API Contract Tests - 合約模組', () => {
  it('合約單一回應結構應符合 Schema', () => {
    const result = contractResponseSchema.safeParse(mockContractResponse)
    expect(result.success).toBe(true)
  })

  it('合約列表回應結構應符合 Schema', () => {
    const listResponse = {
      success: true,
      data: [mockContractResponse],
      meta: { total: 1, page: 1, limit: 20 },
    }
    const result = contractsListResponseSchema.safeParse(listResponse)
    expect(result.success).toBe(true)
  })

  it('合約狀態列舉驗證', () => {
    const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'TERMINATED']
    validStatuses.forEach(status => {
      const contract = { ...mockContractResponse, status }
      const result = contractResponseSchema.safeParse(contract)
      expect(result.success).toBe(true)
    })
  })

  it('付款狀態列舉驗證', () => {
    const validStatuses = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']
    validStatuses.forEach(status => {
      const contract = { ...mockContractResponse, payment_status: status }
      const result = contractResponseSchema.safeParse(contract)
      expect(result.success).toBe(true)
    })
  })
})

describe('API Contract Tests - 員工模組', () => {
  it('員工單一回應結構應符合 Schema', () => {
    const result = employeeResponseSchema.safeParse(mockEmployeeResponse)
    expect(result.success).toBe(true)
  })

  it('員工列表回應結構應符合 Schema', () => {
    const listResponse = {
      success: true,
      data: [mockEmployeeResponse],
      meta: { total: 1, page: 1, limit: 20 },
    }
    const result = employeesListResponseSchema.safeParse(listResponse)
    expect(result.success).toBe(true)
  })

  it('員工狀態列舉驗證', () => {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']
    validStatuses.forEach(status => {
      const employee = { ...mockEmployeeResponse, status }
      const result = employeeResponseSchema.safeParse(employee)
      expect(result.success).toBe(true)
    })
  })
})

describe('API Contract Tests - Dashboard 模組', () => {
  it('Dashboard KPIs 回應結構應符合 Schema', () => {
    const result = dashboardKPIsResponseSchema.safeParse(mockDashboardKPIsResponse)
    expect(result.success).toBe(true)
    if (!result.success) {
      console.error('Schema validation errors:', result.error.errors)
    }
  })

  it('Dashboard 時間區間列舉驗證', () => {
    const validPeriods = ['today', 'week', 'month', 'year']
    validPeriods.forEach(type => {
      const dashboard = {
        ...mockDashboardKPIsResponse,
        period: { ...mockDashboardKPIsResponse.period, type },
      }
      const result = dashboardKPIsResponseSchema.safeParse(dashboard)
      expect(result.success).toBe(true)
    })
  })

  it('hourly_distribution 應為 24 小時陣列', () => {
    const result = dashboardKPIsResponseSchema.safeParse(mockDashboardKPIsResponse)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.operations.hourly_distribution).toHaveLength(24)
    }
  })
})

describe('API Contract Tests - HR 薪資模組', () => {
  it('薪資紀錄回應結構應符合 Schema', () => {
    const result = salaryRecordResponseSchema.safeParse(mockSalaryRecordResponse)
    expect(result.success).toBe(true)
  })

  it('薪資列表回應結構應符合 Schema', () => {
    const listResponse = {
      success: true,
      data: [mockSalaryRecordResponse],
      meta: { total: 1, page: 1, limit: 20 },
    }
    const result = salaryRecordsListResponseSchema.safeParse(listResponse)
    expect(result.success).toBe(true)
  })

  it('薪資狀態列舉驗證', () => {
    const validStatuses = ['PENDING', 'APPROVED', 'PAID']
    validStatuses.forEach(status => {
      const salary = { ...mockSalaryRecordResponse, status }
      const result = salaryRecordResponseSchema.safeParse(salary)
      expect(result.success).toBe(true)
    })
  })

  it('nullable 欄位應接受 null 值', () => {
    const salaryWithNulls = {
      ...mockSalaryRecordResponse,
      overtime_hours: null,
      overtime_pay: null,
      bonus: null,
      commission: null,
      approved_by: null,
      approved_at: null,
    }
    const result = salaryRecordResponseSchema.safeParse(salaryWithNulls)
    expect(result.success).toBe(true)
  })
})

describe('API Contract Tests - 行銷模組', () => {
  it('Lead 回應結構應符合 Schema', () => {
    const result = leadResponseSchema.safeParse(mockLeadResponse)
    expect(result.success).toBe(true)
  })

  it('Lead 列表回應結構應符合 Schema', () => {
    const listResponse = {
      success: true,
      data: [mockLeadResponse],
      meta: { total: 1, page: 1, limit: 20 },
    }
    const result = leadsListResponseSchema.safeParse(listResponse)
    expect(result.success).toBe(true)
  })

  it('Lead 狀態流程驗證', () => {
    const validStatuses = ['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'VISITED', 'CONVERTED', 'LOST']
    validStatuses.forEach(status => {
      const lead = { ...mockLeadResponse, status }
      const result = leadResponseSchema.safeParse(lead)
      expect(result.success).toBe(true)
    })
  })

  it('Campaign 回應結構應符合 Schema', () => {
    const result = campaignResponseSchema.safeParse(mockCampaignResponse)
    expect(result.success).toBe(true)
  })

  it('Campaign 類型列舉驗證', () => {
    const validTypes = ['PROMOTION', 'EVENT', 'CHECKIN', 'REFERRAL']
    validTypes.forEach(type => {
      const campaign = { ...mockCampaignResponse, type }
      const result = campaignResponseSchema.safeParse(campaign)
      expect(result.success).toBe(true)
    })
  })
})

describe('API Contract Tests - 錯誤回應', () => {
  it('標準錯誤回應結構應符合 Schema', () => {
    const errorResponse = {
      success: false,
      message: '找不到資源',
      error: 'NOT_FOUND',
      code: '404',
    }
    const result = apiErrorResponseSchema.safeParse(errorResponse)
    expect(result.success).toBe(true)
  })

  it('最小錯誤回應結構應符合 Schema', () => {
    const minimalError = {
      success: false,
      message: '伺服器錯誤',
    }
    const result = apiErrorResponseSchema.safeParse(minimalError)
    expect(result.success).toBe(true)
  })
})

describe('API Contract Tests - 報表模組', () => {
  it('營收報表回應結構應符合 Schema', () => {
    const revenueReport = {
      success: true,
      data: {
        summary: {
          total_revenue: 500000,
          new_contracts: 25,
          renewals: 15,
        },
        trend: [
          { date: '2024-06-01', revenue: 50000, contracts: 5 },
          { date: '2024-06-02', revenue: 45000, contracts: 4 },
        ],
        by_branch: [
          { branch_id: 'b1', branch_name: '台北店', revenue: 300000, percentage: 60 },
          { branch_id: 'b2', branch_name: '高雄店', revenue: 200000, percentage: 40 },
        ],
      },
    }
    const result = revenueReportResponseSchema.safeParse(revenueReport)
    expect(result.success).toBe(true)
  })

  it('會員成長報表回應結構應符合 Schema', () => {
    const growthReport = {
      success: true,
      data: {
        summary: {
          total: 1200,
          new: 50,
          churned: 10,
          net_growth: 40,
        },
        trend: [
          { date: '2024-06-01', new: 10, churned: 2, total: 1160 },
          { date: '2024-06-02', new: 8, churned: 1, total: 1167 },
        ],
      },
    }
    const result = memberGrowthReportResponseSchema.safeParse(growthReport)
    expect(result.success).toBe(true)
  })
})
