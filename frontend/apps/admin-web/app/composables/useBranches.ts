import { useFetch } from '~/composables/core/useFetch'
import type { Branch, Employee } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

export const useBranches = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
  const { handleError } = useErrorHandler()
  const branches = useState<Branch[]>('branches', () => [])
  const isLoading = useState('branches_loading', () => false)

  const fetchBranches = async (includeArchived = false) => {
    isLoading.value = true
    try {
      const filter: Record<string, unknown> = {}
      if (!includeArchived) {
        filter.status = 'active'
      }

      const { data } = await readItems<Branch>('branches', {
        filter,
        sort: 'name',
        sortOrder: 'asc'
      })
      branches.value = data
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
      const data = await readItem<Branch>('branches', id)
      return data
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
      const { data } = await readItems<Employee>('employees', {
        filter: {
          branch_id: branchId,
          status: 'active'
        },
        sort: 'full_name',
        sortOrder: 'asc'
      })
      return data
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
      const data = await createItem<Branch>('branches', branch)
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
      const data = await updateItem<Branch>('branches', id, branch)
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
      const success = await deleteItem('branches', id)
      if (success) {
        await fetchBranches()
      }
      return success
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
