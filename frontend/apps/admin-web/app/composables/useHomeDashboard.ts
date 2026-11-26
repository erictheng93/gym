/**
 * Home dashboard data (pages/index.vue)
 *
 * Every number comes from a backend aggregate rather than a client-side count:
 * - GET /api/dashboard/overview: members, ACTIVE contracts, this month's COMPLETED income
 * - GET /api/reports/revenue for today (COMPLETED INCOME, end day inclusive)
 * - GET /api/contracts?status=DRAFT for the "pending signature" count
 */

import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { normalizeContractRow, type ApiContractListRow, type ContractView } from '~/composables/useContracts'
import type { ApiMember } from '~/composables/useMembers'
import { MESSAGES } from '~/constants'
import { toLocalDateString } from '~/utils/date'

/** GET /api/dashboard/overview → data */
export interface DashboardOverview {
  members: { total: number; active: number; newThisMonth: number }
  contracts: { active: number; expiringSoon: number }
  revenue: { thisMonth: number; lastMonth: number; growth: number }
  checkIns: { today: number; thisMonth: number }
}

export interface HomeDashboard {
  members: { total: number; active: number; newThisMonth: number }
  /** ACTIVE contracts; expiringSoon = ending within 7 days */
  contracts: { active: number; expiringSoon: number; draft: number }
  revenue: { today: number; thisMonth: number }
  recentMembers: ApiMember[]
  recentContracts: ContractView[]
}

export const EMPTY_HOME_DASHBOARD: HomeDashboard = Object.freeze({
  members: { total: 0, active: 0, newThisMonth: 0 },
  contracts: { active: 0, expiringSoon: 0, draft: 0 },
  revenue: { today: 0, thisMonth: 0 },
  recentMembers: [],
  recentContracts: []
}) as HomeDashboard

type Envelope<T> = { data?: T; pagination?: { total?: number }; meta?: { total?: number } }

const toNumber = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export const useHomeDashboard = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()

  /** Load everything the home page shows; null (after showing an error) when a request fails */
  const fetchHomeDashboard = async (branchId?: string): Promise<HomeDashboard | null> => {
    const today = toLocalDateString()
    try {
      const [overview, drafts, todayRevenue, members, contracts] = await Promise.all([
        apiFetch<DashboardOverview>('/dashboard/overview', { params: { branchId } }),
        apiFetch<ApiContractListRow[]>('/contracts', { params: { status: 'DRAFT', limit: 1, branchId } }),
        apiFetch<{ total: number }>('/reports/revenue', { params: { startDate: today, endDate: today, branchId } }),
        apiFetch<ApiMember[]>('/members', { params: { limit: 5, sortBy: 'dateCreated', sortOrder: 'desc', branchId } }),
        apiFetch<ApiContractListRow[]>('/contracts', { params: { limit: 5, sortOrder: 'desc', branchId } })
      ]) as [Envelope<DashboardOverview>, Envelope<ApiContractListRow[]>, Envelope<{ total: number }>, Envelope<ApiMember[]>, Envelope<ApiContractListRow[]>]

      const o = overview.data
      return {
        members: {
          total: toNumber(o?.members.total),
          active: toNumber(o?.members.active),
          newThisMonth: toNumber(o?.members.newThisMonth)
        },
        contracts: {
          active: toNumber(o?.contracts.active),
          expiringSoon: toNumber(o?.contracts.expiringSoon),
          draft: toNumber(drafts.pagination?.total ?? drafts.meta?.total)
        },
        revenue: {
          today: toNumber(todayRevenue.data?.total),
          thisMonth: toNumber(o?.revenue.thisMonth)
        },
        recentMembers: members.data ?? [],
        recentContracts: (contracts.data ?? []).map(normalizeContractRow)
      }
    } catch (error) {
      handleError(error, {
        context: 'useHomeDashboard.fetchHomeDashboard',
        customMessage: MESSAGES.ERRORS.DASHBOARD_LOAD_FAILED
      })
      return null
    }
  }

  return { fetchHomeDashboard }
}
