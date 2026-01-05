import { readItems, readItem, createItem, updateItem, deleteItem } from '@directus/sdk'
import type { Branch, Employee } from '~/types/directus'
import { MESSAGES } from '~/constants'

export const useBranches = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()
  const branches = useState<Branch[]>('branches', () => [])
  const isLoading = useState('branches_loading', () => false)

  const fetchBranches = async (includeArchived = false) => {
    isLoading.value = true
    try {
      const filter = includeArchived ? {} : { status: { _eq: 'active' } }
      const data = await directus.request(
        readItems('branches', {
          filter,
          sort: ['name']
        })
      )
      branches.value = data as Branch[]
    } catch (error) {
      handleError(error, {
        context: 'useBranches.fetchBranches',
        customMessage: MESSAGES.ERRORS.BRANCH_FETCH_FAILED
      })
      branches.value = []
    } finally {
      isLoading.value = false
    }
  }

  const fetchBranch = async (id: string) => {
    try {
      const data = await directus.request(
        readItem('branches', id)
      )
      return data as Branch
    } catch (error) {
      handleError(error, {
        context: 'useBranches.fetchBranch',
        customMessage: MESSAGES.ERRORS.BRANCH_FETCH_FAILED
      })
      return null
    }
  }

  const fetchBranchEmployees = async (branchId: string) => {
    try {
      const data = await directus.request(
        readItems('employees', {
          filter: { branch_id: { _eq: branchId }, status: { _eq: 'active' } },
          fields: ['*', 'job_title.*'],
          sort: ['full_name']
        })
      )
      return data as Employee[]
    } catch (error) {
      handleError(error, {
        context: 'useBranches.fetchBranchEmployees',
        customMessage: MESSAGES.ERRORS.EMPLOYEE_FETCH_FAILED
      })
      return []
    }
  }

  const createBranch = async (branch: Partial<Branch>) => {
    try {
      const data = await directus.request(createItem('branches', branch))
      await fetchBranches()
      return data
    } catch (error) {
      handleError(error, {
        context: 'useBranches.createBranch',
        customMessage: MESSAGES.ERRORS.BRANCH_CREATE_FAILED
      })
      return null
    }
  }

  const updateBranch = async (id: string, branch: Partial<Branch>) => {
    try {
      const data = await directus.request(updateItem('branches', id, branch))
      await fetchBranches()
      return data
    } catch (error) {
      handleError(error, {
        context: 'useBranches.updateBranch',
        customMessage: MESSAGES.ERRORS.BRANCH_UPDATE_FAILED
      })
      return null
    }
  }

  const deleteBranch = async (id: string) => {
    try {
      await directus.request(deleteItem('branches', id))
      await fetchBranches()
      return true
    } catch (error) {
      handleError(error, {
        context: 'useBranches.deleteBranch',
        customMessage: MESSAGES.ERRORS.BRANCH_DELETE_FAILED
      })
      return false
    }
  }

  return {
    branches,
    isLoading,
    fetchBranches,
    fetchBranch,
    fetchBranchEmployees,
    createBranch,
    updateBranch,
    deleteBranch
  }
}
