import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Employee } from '~/types/directus'

export const useEmployees = () => {
  const directus = useDirectus()
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
      console.error('Failed to fetch employees:', error)
    } finally {
      isLoading.value = false
    }
  }

  const getEmployee = async (id: string) => {
    const data = await directus.request(
      readItem('employees', id, {
        fields: ['*', 'branch_id.*', 'job_title_id.*']
      })
    )
    return data as Employee
  }

  const createEmployee = async (employee: Partial<Employee>) => {
    const data = await directus.request(createItem('employees', employee))
    return data
  }

  const updateEmployee = async (id: string, employee: Partial<Employee>) => {
    const data = await directus.request(updateItem('employees', id, employee))
    return data
  }

  const deleteEmployee = async (id: string) => {
    await directus.request(deleteItem('employees', id))
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
      console.error('Failed to fetch all employees:', error)
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
