import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import type { JobTitle } from '~/types/directus'
import { MESSAGES } from '~/constants'

export const useJobTitles = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
  const { handleError } = useErrorHandler()
  const jobTitles = useState<JobTitle[]>('job_titles', () => [])
  const isLoading = useState('job_titles_loading', () => false)

  const fetchJobTitles = async () => {
    isLoading.value = true
    try {
      const { data } = await readItems<JobTitle>('job_titles', {
        filter: { status: 'active' },
        sort: 'name',
        limit: 1000
      })
      jobTitles.value = data
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
      const data = await readItem<JobTitle>('job_titles', id)
      return data
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
      const data = await createItem<JobTitle>('job_titles', jobTitle)
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
      const data = await updateItem<JobTitle>('job_titles', id, jobTitle)
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
      const result = await deleteItem('job_titles', id)
      return result
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
