import { readMe, readItems } from '@directus/sdk'
import type { Employee } from '~/types/directus'
import { MESSAGES } from '~/constants'

interface User {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: string | null
}

// 當前員工資訊（包含分店）
interface CurrentEmployee {
  id: string
  full_name: string
  employee_code: string | null
  branch_id: string | null
  branch_name: string | null
  job_title_id: string | null
  job_title_name: string | null
}

export const useAuth = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()
  const toast = useToast()
  const user = useState<User | null>('auth_user', () => null)
  const currentEmployee = useState<CurrentEmployee | null>('auth_employee', () => null)
  const isAuthenticated = computed(() => !!user.value)
  const isLoading = useState('auth_loading', () => false)

  const login = async (email: string, password: string) => {
    isLoading.value = true
    try {
      await directus.login({ email, password })
      await fetchUser()
      await fetchCurrentEmployee()
      toast.success('登入成功')
      return { success: true }
    } catch (error: unknown) {
      // 登入錯誤特殊處理：顯示 toast 但不重定向
      handleError(error, {
        context: 'useAuth.login',
        customMessage: MESSAGES.AUTH.LOGIN_ERROR,
        redirectOnAuth: false
      })
      return { success: false }
    } finally {
      isLoading.value = false
    }
  }

  const logout = async () => {
    try {
      await directus.logout()
    } catch {
      // Ignore logout errors
    } finally {
      user.value = null
      currentEmployee.value = null
      await navigateTo('/login')
    }
  }

  const fetchUser = async () => {
    try {
      const me = await directus.request(readMe({
        fields: ['id', 'email', 'first_name', 'last_name', 'role']
      }))
      user.value = me as User
    } catch (error) {
      // 靜默處理：不顯示 toast，不重定向（可能是檢查登入狀態）
      handleError(error, {
        context: 'useAuth.fetchUser',
        showToast: false,
        redirectOnAuth: false
      })
      user.value = null
    }
  }

  // 根據當前登入用戶取得對應的員工資訊
  const fetchCurrentEmployee = async () => {
    if (!user.value?.id) {
      currentEmployee.value = null
      return
    }

    try {
      const employees = await directus.request(
        readItems('employees', {
          filter: { user_id: { _eq: user.value.id } },
          fields: ['id', 'full_name', 'employee_code', 'branch_id', 'job_title_id', 'branch.name', 'job_title.name'],
          limit: 1
        })
      )

      if (employees.length > 0) {
        const emp = employees[0] as Employee & { branch?: { name: string }, job_title?: { name: string } }
        currentEmployee.value = {
          id: emp.id,
          full_name: emp.full_name,
          employee_code: emp.employee_code || null,
          branch_id: emp.branch_id || null,
          branch_name: emp.branch?.name || null,
          job_title_id: emp.job_title_id || null,
          job_title_name: emp.job_title?.name || null
        }
      } else {
        currentEmployee.value = null
      }
    } catch (error) {
      handleError(error, {
        context: 'useAuth.fetchCurrentEmployee',
        showToast: false,
        redirectOnAuth: false
      })
      currentEmployee.value = null
    }
  }

  const checkAuth = async () => {
    if (!user.value) {
      await fetchUser()
    }
    if (user.value && !currentEmployee.value) {
      await fetchCurrentEmployee()
    }
    return isAuthenticated.value
  }

  return {
    user,
    currentEmployee,
    isAuthenticated,
    isLoading,
    login,
    logout,
    fetchUser,
    fetchCurrentEmployee,
    checkAuth
  }
}
