import { readItems, readItem, createItem, updateItem, deleteItem } from '@directus/sdk'
import type { JobTitle } from '~/types/directus'

export const useJobTitles = () => {
  const directus = useDirectus()
  const jobTitles = useState<JobTitle[]>('job_titles', () => [])
  const isLoading = useState('job_titles_loading', () => false)

  const fetchJobTitles = async () => {
    isLoading.value = true
    try {
      const data = await directus.request(
        readItems('job_titles', {
          fields: ['*'],
          filter: { status: { _eq: 'active' } },
          sort: ['name'],
          limit: -1
        })
      )
      jobTitles.value = data as JobTitle[]
    } catch (error) {
      console.error('Failed to fetch job titles:', error)
    } finally {
      isLoading.value = false
    }
  }

  const getJobTitle = async (id: string) => {
    const data = await directus.request(
      readItem('job_titles', id, {
        fields: ['*']
      })
    )
    return data as JobTitle
  }

  const createJobTitle = async (jobTitle: Partial<JobTitle>) => {
    const data = await directus.request(createItem('job_titles', jobTitle))
    return data
  }

  const updateJobTitle = async (id: string, jobTitle: Partial<JobTitle>) => {
    const data = await directus.request(updateItem('job_titles', id, jobTitle))
    return data
  }

  const deleteJobTitle = async (id: string) => {
    await directus.request(deleteItem('job_titles', id))
  }

  return {
    jobTitles,
    isLoading,
    fetchJobTitles,
    getJobTitle,
    createJobTitle,
    updateJobTitle,
    deleteJobTitle
  }
}
