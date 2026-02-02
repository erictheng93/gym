import { useFetch } from '~/composables/core/useFetch'
import type { Employee } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

export const useEmployees = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
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
      if (branchId) filter.branch_id = branchId
      if (status) filter.employment_status = status
      if (jobTitleId) filter.job_title_id = jobTitleId

      const { data, total } = await readItems<Employee>('employees', {
        page,
        limit,
        search,
        filter,
        sort: 'date_created',
        sortOrder: 'desc'
      })

      employees.value = data
      totalCount.value = total
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
      const data = await readItem<Employee>('employees', id)
      return data
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
      const data = await createItem<Employee>('employees', employee)
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
      const data = await updateItem<Employee>('employees', id, employee)
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
      const success = await deleteItem('employees', id)
      return success
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
      const { data } = await readItems<Employee>('employees', {
        limit: 1000, // Large limit to get all
        filter: {
          employment_status: 'ACTIVE'
        },
        sort: 'full_name',
        sortOrder: 'asc'
      })
      return data
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
