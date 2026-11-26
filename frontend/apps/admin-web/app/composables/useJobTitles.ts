import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { MESSAGES } from '~/constants'
import { apiErrorMessage } from '~/utils/api-error'
import type { PermissionMatrix } from '~/composables/useEmployees'

// =============================================================================
// Wire format of the staff job-titles API (backend/src/routes/job-titles.ts):
// camelCase rows, tenant-scoped, sorted by name; no status / pagination.
// =============================================================================

export interface ApiJobTitle {
  id: string
  createdAt: string
  name: string
  code: string
  description: string | null
  level: number | null
  sort: number | null
  permissionsConfig: PermissionMatrix | null
  tenantId: string
}

/** Body of POST /api/job-titles (createJobTitleSchema); `code` is required (max 20 chars) */
export interface CreateJobTitleInput {
  name: string
  code: string
  description?: string
  level?: number
  sort?: number
  permissionsConfig?: PermissionMatrix
}

export type UpdateJobTitleInput = Partial<CreateJobTitleInput>

let inFlightJobTitlesPromise: Promise<void> | null = null
const inFlightSingleJobTitleMap = new Map<string, Promise<ApiJobTitle | null>>()

export const useJobTitles = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()
  const jobTitles = useState<ApiJobTitle[]>('job_titles', () => [])
  const isLoading = useState('job_titles_loading', () => false)

  const fetchJobTitles = async (force = false) => {
    if (!force && inFlightJobTitlesPromise) {
      return inFlightJobTitlesPromise
    }

    inFlightJobTitlesPromise = (async () => {
      isLoading.value = true
      try {
        const { data } = await apiFetch<ApiJobTitle[]>('/job-titles')
        jobTitles.value = data || []
      } catch (error) {
        handleError(error, {
          context: 'useJobTitles.fetchJobTitles',
          customMessage: MESSAGES.ERRORS.JOB_TITLE_FETCH_FAILED
        })
        jobTitles.value = []
      } finally {
        isLoading.value = false
        inFlightJobTitlesPromise = null
      }
    })()

    return inFlightJobTitlesPromise
  }

  const getJobTitle = async (id: string) => {
    const existing = inFlightSingleJobTitleMap.get(id)
    if (existing) return existing

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiJobTitle>(`/job-titles/${id}`)
        return data ?? null
      } catch (error) {
        handleError(error, {
          context: 'useJobTitles.getJobTitle',
          customMessage: MESSAGES.ERRORS.JOB_TITLE_FETCH_FAILED
        })
        return null
      } finally {
        inFlightSingleJobTitleMap.delete(id)
      }
    })()

    inFlightSingleJobTitleMap.set(id, promise)
    return promise
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const createJobTitle = async (input: CreateJobTitleInput): Promise<ApiJobTitle | null> => {
    try {
      const { data } = await apiFetch<ApiJobTitle>('/job-titles', { method: 'POST', body: input })
      if (!data) throw new Error(MESSAGES.ERRORS.JOB_TITLE_CREATE_FAILED)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useJobTitles.createJobTitle',
        customMessage: apiErrorMessage(error, MESSAGES.ERRORS.JOB_TITLE_CREATE_FAILED)
      })
      return null
    }
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const updateJobTitle = async (id: string, input: UpdateJobTitleInput): Promise<ApiJobTitle | null> => {
    try {
      const { data } = await apiFetch<ApiJobTitle>(`/job-titles/${id}`, { method: 'PATCH', body: input })
      if (!data) throw new Error(MESSAGES.ERRORS.JOB_TITLE_UPDATE_FAILED)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useJobTitles.updateJobTitle',
        customMessage: apiErrorMessage(error, MESSAGES.ERRORS.JOB_TITLE_UPDATE_FAILED)
      })
      return null
    }
  }

  /** Returns false on failure (e.g. 403 for non-admins), after showing the backend's reason. */
  const deleteJobTitle = async (id: string): Promise<boolean> => {
    try {
      await apiFetch(`/job-titles/${id}`, { method: 'DELETE' })
      return true
    } catch (error) {
      handleError(error, {
        context: 'useJobTitles.deleteJobTitle',
        customMessage: apiErrorMessage(error, MESSAGES.ERRORS.JOB_TITLE_DELETE_FAILED)
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
