import { readItems, readItem, createItem, updateItem, deleteItem } from '@directus/sdk'
import type { MembershipPlan } from '~/types/directus'

export const usePlans = () => {
  const directus = useDirectus()
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
      console.error('Failed to fetch plans:', error)
    } finally {
      isLoading.value = false
    }
  }

  const getPlan = async (id: string) => {
    const data = await directus.request(
      readItem('membership_plans', id, {
        fields: ['*']
      })
    )
    return data as MembershipPlan
  }

  const createPlan = async (plan: Partial<MembershipPlan>) => {
    const data = await directus.request(createItem('membership_plans', plan))
    return data
  }

  const updatePlan = async (id: string, plan: Partial<MembershipPlan>) => {
    const data = await directus.request(updateItem('membership_plans', id, plan))
    return data
  }

  const deletePlan = async (id: string) => {
    await directus.request(deleteItem('membership_plans', id))
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
