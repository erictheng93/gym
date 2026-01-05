import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Employee } from '~/types/directus'
import { MESSAGES } from '~/constants'

export const useEmployees = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()
  const employees = useState<Employee[]>('employees', () => [])
  const isLoading = useState('employees_loading', () => false)
  const totalCount = useState('employees_total', () => 0)

  const fetchEmployees = async (options?: {
    page?: number
    limit?: number
    search?: string
    branchId?: string
    status?: string
    jobTitleId?: string
  }) => {
    isLoading.value = true
    const { page = 1, limit = 20, search, branchId, status, jobTitleId } = options || {}

    try {
      const filter: Record<string, unknown> = {}

      if (search) {
        filter._or = [
          { full_name: { _contains: search } },
          { employee_code: { _contains: search } }
        ]
      }
      if (branchId) filter.branch_id = { _eq: branchId }
      if (status) filter.employment_status = { _eq: status }
      if (jobTitleId) filter.job_title_id = { _eq: jobTitleId }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('employees', {
            filter,
            fields: ['*', 'branch_id.name', 'job_title_id.name'],
            sort: ['-date_created'],
            limit,
            offset: (page - 1) * limit
          })
        ),
        directus.request(
          aggregate('employees', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      employees.value = data as Employee[]
      totalCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      handleError(error, {
        context: 'useEmployees.fetchEmployees',
        customMessage: MESSAGES.ERRORS.EMPLOYEE_FETCH_FAILED
      })
      employees.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  const getEmployee = async (id: string) => {
    try {
      const data = await directus.request(
        readItem('employees', id, {
          fields: ['*', 'branch_id.*', 'job_title_id.*']
        })
      )
      return data as Employee
    } catch (error) {
      handleError(error, {
        context: 'useEmployees.getEmployee',
        customMessage: MESSAGES.ERRORS.EMPLOYEE_FETCH_FAILED
      })
      return null
    }
  }

  const createEmployee = async (employee: Partial<Employee>) => {
    try {
      const data = await directus.request(createItem('employees', employee))
      return data
    } catch (error) {
      handleError(error, {
        context: 'useEmployees.createEmployee',
        customMessage: MESSAGES.ERRORS.EMPLOYEE_CREATE_FAILED
      })
      return null
    }
  }

  const updateEmployee = async (id: string, employee: Partial<Employee>) => {
    try {
      const data = await directus.request(updateItem('employees', id, employee))
      return data
    } catch (error) {
      handleError(error, {
        context: 'useEmployees.updateEmployee',
        customMessage: MESSAGES.ERRORS.EMPLOYEE_UPDATE_FAILED
      })
      return null
    }
  }

  const deleteEmployee = async (id: string) => {
    try {
      await directus.request(deleteItem('employees', id))
      return true
    } catch (error) {
      handleError(error, {
        context: 'useEmployees.deleteEmployee',
        customMessage: MESSAGES.ERRORS.EMPLOYEE_DELETE_FAILED
      })
      return false
    }
  }

  // 取得所有員工（用於下拉選單）
  const fetchAllEmployees = async () => {
    try {
      const data = await directus.request(
        readItems('employees', {
          fields: ['id', 'full_name', 'employee_code', 'branch_id'],
          filter: { employment_status: { _eq: 'ACTIVE' } },
          sort: ['full_name'],
          limit: -1
        })
      )
      return data as Employee[]
    } catch (error) {
      handleError(error, {
        context: 'useEmployees.fetchAllEmployees',
        customMessage: MESSAGES.ERRORS.EMPLOYEE_FETCH_FAILED,
        showToast: false
      })
      return []
    }
  }

  return {
    employees,
    isLoading,
    totalCount,
    fetchEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    fetchAllEmployees
  }
}
