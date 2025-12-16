import { readItems, createItem, updateItem, deleteItem } from '@directus/sdk'
import type { Branch } from '~/types/directus'

export const useBranches = () => {
  const directus = useDirectus()
  const branches = useState<Branch[]>('branches', () => [])
  const isLoading = useState('branches_loading', () => false)

  const fetchBranches = async () => {
    isLoading.value = true
    try {
      const data = await directus.request(
        readItems('branches', {
          filter: { status: { _eq: 'active' } },
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
    createBranch,
    updateBranch,
    deleteBranch
  }
}
