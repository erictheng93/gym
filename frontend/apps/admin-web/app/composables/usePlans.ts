import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import type { MembershipPlan } from '~/types/schema'
import { MESSAGES } from '~/constants'

const inFlightPlansMap = new Map<string, Promise<void>>()
const inFlightSinglePlanMap = new Map<string, Promise<MembershipPlan | null>>()

export const usePlans = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
  const { handleError } = useErrorHandler()
  const plans = useState<MembershipPlan[]>('plans', () => [])
  const isLoading = useState('plans_loading', () => false)

  const fetchPlans = async (options?: {
    status?: string
    planType?: string
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force && inFlightPlansMap.has(key)) {
      return inFlightPlansMap.get(key)!
    }

    const promise = (async () => {
      isLoading.value = true
      const { status, planType } = options || {}

      try {
        const filter: Record<string, unknown> = {}
        if (status && status !== '') filter.status = status
        if (planType && planType !== '') filter.plan_type = planType

        const { data } = await readItems<MembershipPlan>('membership-plans', {
          filter,
          sort: 'price'
        })
        plans.value = data
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
        const data = await readItem<MembershipPlan>('membership-plans', id)
        return data
      } catch (error) {
        handleError(error, {
          context: 'usePlans.getPlan',
          customMessage: MESSAGES.ERRORS.PLAN_FETCH_FAILED
        })
        return null
      } finally {
        inFlightSinglePlanMap.delete(id)
      }
    })()

    inFlightSinglePlanMap.set(id, promise)
    return promise
  }

  const createPlan = async (plan: Partial<MembershipPlan>) => {
    try {
      const data = await createItem<MembershipPlan>('membership-plans', plan)
      return data
    } catch (error) {
      handleError(error, {
        context: 'usePlans.createPlan',
        customMessage: MESSAGES.ERRORS.PLAN_CREATE_FAILED
      })
      return null
    }
  }

  const updatePlan = async (id: string, plan: Partial<MembershipPlan>) => {
    try {
      const data = await updateItem<MembershipPlan>('membership-plans', id, plan)
      return data
    } catch (error) {
      handleError(error, {
        context: 'usePlans.updatePlan',
        customMessage: MESSAGES.ERRORS.PLAN_UPDATE_FAILED
      })
      return null
    }
  }

  const deletePlan = async (id: string) => {
    try {
      const result = await deleteItem('membership-plans', id)
      return result
    } catch (error) {
      handleError(error, {
        context: 'usePlans.deletePlan',
        customMessage: MESSAGES.ERRORS.PLAN_DELETE_FAILED
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
