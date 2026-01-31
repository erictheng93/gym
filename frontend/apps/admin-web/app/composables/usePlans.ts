import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import type { MembershipPlan } from '~/types/directus'
import { MESSAGES } from '~/constants'

export const usePlans = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
  const { handleError } = useErrorHandler()
  const plans = useState<MembershipPlan[]>('plans', () => [])
  const isLoading = useState('plans_loading', () => false)

  const fetchPlans = async (options?: {
    status?: string
    planType?: string
  }) => {
    isLoading.value = true
    const { status, planType } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (status && status !== '') filter.status = status
      if (planType && planType !== '') filter.plan_type = planType

      const { data } = await readItems<MembershipPlan>('membership_plans', {
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
    }
  }

  const getPlan = async (id: string) => {
    try {
      const data = await readItem<MembershipPlan>('membership_plans', id)
      return data
    } catch (error) {
      handleError(error, {
        context: 'usePlans.getPlan',
        customMessage: MESSAGES.ERRORS.PLAN_FETCH_FAILED
      })
      return null
    }
  }

  const createPlan = async (plan: Partial<MembershipPlan>) => {
    try {
      const data = await createItem<MembershipPlan>('membership_plans', plan)
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
      const data = await updateItem<MembershipPlan>('membership_plans', id, plan)
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
      const result = await deleteItem('membership_plans', id)
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
