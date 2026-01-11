import { readMe, readItems } from '@directus/sdk'
import * as Sentry from '@sentry/vue'
import type { Employee } from '~/types/directus'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { saveSession, loadSession, clearSession } from '~/utils/session-storage'

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

      // Save session to localStorage for persistence across page refresh
      if (user.value) {
        saveSession(user.value, currentEmployee.value)

        // Set Sentry user context for error tracking
        try {
          Sentry.setUser({
            id: user.value.id,
            email: user.value.email,
            username: `${user.value.first_name || ''} ${user.value.last_name || ''}`.trim() || user.value.email,
          })
        } catch {
          // Sentry not initialized - ignore
        }
      }

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
      // Clear localStorage session
      clearSession()

      // Clear Sentry user context
      try {
        Sentry.setUser(null)
      } catch {
        // Sentry not initialized - ignore
      }

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
    // Step 1: If we already have user state, verify it's still valid
    if (user.value) {
      try {
        // Verify the session is still valid with the server
        await directus.request(readMe({ fields: ['id'] }))
        if (!currentEmployee.value) {
          await fetchCurrentEmployee()
        }
        // Update session timestamp
        saveSession(user.value, currentEmployee.value)
        return true
      } catch {
        // Server auth failed, clear state and try recovery
        user.value = null
        currentEmployee.value = null
      }
    }

    // Step 2: Try server-side auth (cookies may still be valid)
    try {
      await fetchUser()
      if (user.value) {
        await fetchCurrentEmployee()
        saveSession(user.value, currentEmployee.value)
        return true
      }
    } catch {
      // Server auth failed, continue to localStorage recovery
    }

    // Step 3: Try localStorage session recovery
    const cachedSession = loadSession()
    if (cachedSession) {
      try {
        // Attempt to refresh the Directus session
        await directus.refresh()

        // Re-fetch user data to verify session is valid
        await fetchUser()
        if (user.value) {
          await fetchCurrentEmployee()
          saveSession(user.value, currentEmployee.value)
          return true
        }
      } catch {
        // Token refresh failed, clear everything
        console.log('[useAuth] Session refresh failed, clearing session')
        clearSession()
      }
    }

    // All recovery attempts failed
    return false
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
