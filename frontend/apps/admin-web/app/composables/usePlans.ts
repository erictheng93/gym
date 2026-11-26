import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { MESSAGES } from '~/constants'

// =============================================================================
// Wire format of the staff membership-plans API (backend/src/routes/membership-plans.ts)
// =============================================================================

export type PlanType = 'TIME_BASED' | 'COUNT_BASED'

/** A plan row (MEMBERSHIP_PLAN_SELECT): camelCase, price as a decimal string ("3000.00") */
export interface ApiPlan {
  id: string
  name: string
  code: string
  planType: PlanType
  description: string | null
  durationMonths: number | null
  classCounts: number | null
  price: string | number
  allowPause: boolean
  maxPauseDays: number | null
  allowTransfer: boolean
  isActive: boolean
  sort?: number | null
  branchId: string | null
  branch?: { id: string | null; name: string | null } | null
  createdAt?: string | null
  updatedAt?: string | null
}

/** A plan as the pages use it: price as a number */
export interface Plan extends Omit<ApiPlan, 'price'> {
  price: number
}

/** Body of POST /api/membership-plans; field names match the backend zod schema exactly */
export interface PlanInput {
  name: string
  code: string
  planType: PlanType
  /** required for TIME_BASED */
  durationMonths?: number
  /** required for COUNT_BASED */
  classCounts?: number
  price: number
  description?: string
  allowTransfer: boolean
  allowPause: boolean
  isActive: boolean
  branchId?: string
}

/** Query of GET /api/membership-plans; names match what the handler reads */
export interface PlanListFilters {
  planType?: PlanType | ''
  branchId?: string
  /** only plans that can be sold (isActive) */
  activeOnly?: boolean
}

const toNumber = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export const normalizeApiPlan = (row: ApiPlan): Plan => ({ ...row, price: toNumber(row.price) })

/** Backend error text when it is a readable message, otherwise the fallback */
const errorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}

const inFlightPlansMap = new Map<string, Promise<void>>()
const inFlightSinglePlanMap = new Map<string, Promise<Plan | null>>()

export const usePlans = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()
  const plans = useState<Plan[]>('plans', () => [])
  const isLoading = useState('plans_loading', () => false)

  const fetchPlans = async (filters: PlanListFilters = {}, force = false) => {
    const key = JSON.stringify(filters)
    if (!force && inFlightPlansMap.has(key)) {
      return inFlightPlansMap.get(key)!
    }

    const promise = (async () => {
      isLoading.value = true
      const { planType, branchId, activeOnly } = filters

      try {
        const params: Record<string, string> = {}
        if (planType) params.planType = planType
        if (branchId) params.branchId = branchId
        if (activeOnly) params.activeOnly = 'true'

        const { data } = await apiFetch<ApiPlan[]>('/membership-plans', { params })
        plans.value = (data || []).map(normalizeApiPlan)
      } catch (error) {
        handleError(error, {
          context: 'usePlans.fetchPlans',
          customMessage: MESSAGES.ERRORS.PLAN_FETCH_FAILED
        })
        plans.value = []
      } finally {
        isLoading.value = false
        inFlightPlansMap.delete(key)
      }
    })()

    inFlightPlansMap.set(key, promise)
    return promise
  }

  const getPlan = async (id: string) => {
    const existing = inFlightSinglePlanMap.get(id)
    if (existing) return existing

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiPlan>(`/membership-plans/${id}`)
        return data ? normalizeApiPlan(data) : null
      } catch (error) {
        handleError(error, {
          context: 'usePlans.getPlan',
          customMessage: errorMessage(error, MESSAGES.ERRORS.PLAN_FETCH_FAILED)
        })
        return null
      } finally {
        inFlightSinglePlanMap.delete(id)
      }
    })()

    inFlightSinglePlanMap.set(id, promise)
    return promise
  }

  /** Returns the created plan, or null after showing the backend's reason */
  const createPlan = async (input: PlanInput): Promise<Plan | null> => {
    try {
      const { data } = await apiFetch<ApiPlan>('/membership-plans', { method: 'POST', body: input })
      if (!data) throw new Error(MESSAGES.ERRORS.PLAN_CREATE_FAILED)
      return normalizeApiPlan(data)
    } catch (error) {
      handleError(error, {
        context: 'usePlans.createPlan',
        customMessage: errorMessage(error, MESSAGES.ERRORS.PLAN_CREATE_FAILED)
      })
      return null
    }
  }

  /** PATCH only changes the fields sent. Returns the updated plan, or null after showing why. */
  const updatePlan = async (id: string, patch: Partial<PlanInput>): Promise<Plan | null> => {
    try {
      const { data } = await apiFetch<ApiPlan>(`/membership-plans/${id}`, { method: 'PATCH', body: patch })
      if (!data) throw new Error(MESSAGES.ERRORS.PLAN_UPDATE_FAILED)
      return normalizeApiPlan(data)
    } catch (error) {
      handleError(error, {
        context: 'usePlans.updatePlan',
        customMessage: errorMessage(error, MESSAGES.ERRORS.PLAN_UPDATE_FAILED)
      })
      return null
    }
  }

  /** DELETE /membership-plans/:id deactivates the plan (isActive=false). Returns false after showing why. */
  const deletePlan = async (id: string): Promise<boolean> => {
    try {
      await apiFetch(`/membership-plans/${id}`, { method: 'DELETE' })
      return true
    } catch (error) {
      handleError(error, {
        context: 'usePlans.deletePlan',
        customMessage: errorMessage(error, MESSAGES.ERRORS.PLAN_DELETE_FAILED)
      })
      return false
    }
  }

  return {
    plans,
    isLoading,
    fetchPlans,
    getPlan,
    createPlan,
    updatePlan,
    deletePlan
  }
}
