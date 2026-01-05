import { readItems, readItem, createItem, updateItem, deleteItem } from '@directus/sdk'
import type { MembershipPlan } from '~/types/directus'
import { MESSAGES } from '~/constants'

export const usePlans = () => {
  const directus = useDirectus()
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
      // 只在 status 有值且不為空字串時添加篩選
      if (status && status !== '') filter.status = { _eq: status }
      if (planType && planType !== '') filter.plan_type = { _eq: planType }

      const data = await directus.request(
        readItems('membership_plans', {
          filter,
          fields: ['*'],
          sort: ['price']
        })
      )
      plans.value = data as MembershipPlan[]
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
      const data = await directus.request(
        readItem('membership_plans', id, {
          fields: ['*']
        })
      )
      return data as MembershipPlan
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
      const data = await directus.request(createItem('membership_plans', plan))
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
      const data = await directus.request(updateItem('membership_plans', id, plan))
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
      await directus.request(deleteItem('membership_plans', id))
      return true
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
