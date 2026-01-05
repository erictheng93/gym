import { readItems, readItem, createItem, updateItem, deleteItem } from '@directus/sdk'
import type { JobTitle } from '~/types/directus'
import { MESSAGES } from '~/constants'

export const useJobTitles = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()
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
      handleError(error, {
        context: 'useJobTitles.fetchJobTitles',
        customMessage: MESSAGES.ERRORS.JOB_TITLE_FETCH_FAILED
      })
      jobTitles.value = []
    } finally {
      isLoading.value = false
    }
  }

  const getJobTitle = async (id: string) => {
    try {
      const data = await directus.request(
        readItem('job_titles', id, {
          fields: ['*']
        })
      )
      return data as JobTitle
    } catch (error) {
      handleError(error, {
        context: 'useJobTitles.getJobTitle',
        customMessage: MESSAGES.ERRORS.JOB_TITLE_FETCH_FAILED
      })
      return null
    }
  }

  const createJobTitle = async (jobTitle: Partial<JobTitle>) => {
    try {
      const data = await directus.request(createItem('job_titles', jobTitle))
      return data
    } catch (error) {
      handleError(error, {
        context: 'useJobTitles.createJobTitle',
        customMessage: MESSAGES.ERRORS.JOB_TITLE_CREATE_FAILED
      })
      return null
    }
  }

  const updateJobTitle = async (id: string, jobTitle: Partial<JobTitle>) => {
    try {
      const data = await directus.request(updateItem('job_titles', id, jobTitle))
      return data
    } catch (error) {
      handleError(error, {
        context: 'useJobTitles.updateJobTitle',
        customMessage: MESSAGES.ERRORS.JOB_TITLE_UPDATE_FAILED
      })
      return null
    }
  }

  const deleteJobTitle = async (id: string) => {
    try {
      await directus.request(deleteItem('job_titles', id))
      return true
    } catch (error) {
      handleError(error, {
        context: 'useJobTitles.deleteJobTitle',
        customMessage: MESSAGES.ERRORS.JOB_TITLE_DELETE_FAILED
      })
      return false
    }
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
