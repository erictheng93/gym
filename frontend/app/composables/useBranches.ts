import { readItems, readItem, createItem, updateItem, deleteItem } from '@directus/sdk'
import type { Branch, Employee } from '~/types/directus'

export const useBranches = () => {
  const directus = useDirectus()
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
      console.error('Failed to fetch branches:', error)
    } finally {
      isLoading.value = false
    }
  }

  const fetchBranch = async (id: string) => {
    const data = await directus.request(
      readItem('branches', id)
    )
    return data as Branch
  }

  const fetchBranchEmployees = async (branchId: string) => {
    const data = await directus.request(
      readItems('employees', {
        filter: { branch_id: { _eq: branchId }, status: { _eq: 'active' } },
        fields: ['*', 'job_title.*'],
        sort: ['full_name']
      })
    )
    return data as Employee[]
  }

  const createBranch = async (branch: Partial<Branch>) => {
    const data = await directus.request(createItem('branches', branch))
    await fetchBranches()
    return data
  }

  const updateBranch = async (id: string, branch: Partial<Branch>) => {
    const data = await directus.request(updateItem('branches', id, branch))
    await fetchBranches()
    return data
  }

  const deleteBranch = async (id: string) => {
    await directus.request(deleteItem('branches', id))
    await fetchBranches()
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
