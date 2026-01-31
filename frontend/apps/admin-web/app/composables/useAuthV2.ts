/**
 * useAuthV2 - New authentication composable for backend-v2
 * Replaces Directus SDK authentication with custom API
 */
import * as Sentry from '@sentry/vue'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { saveSession, loadSession, clearSession } from '~/utils/session-storage'

export interface User {
  id: string
  email: string
  role: string
  employeeId: string | null
  tenantId: string | null
  first_name?: string | null
  last_name?: string | null
}

// Alias for backwards compatibility
export type Employee = CurrentEmployee

export interface CurrentEmployee {
  id: string
  full_name: string
  employee_code: string | null
  branch_id: string | null
  branch_name: string | null
  job_title_id: string | null
  job_title_name: string | null
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export const useAuthV2 = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()
  const toast = useToast()

  const apiBaseUrl = config.public?.apiBaseUrl || 'http://localhost:8056'

  const user = useState<User | null>('auth_user', () => null)
  const currentEmployee = useState<CurrentEmployee | null>('auth_employee', () => null)
  const isAuthenticated = computed(() => !!user.value)
  const isLoading = useState('auth_loading', () => false)

  // Helper for API requests
  const apiRequest = async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`)
    }

    return data
  }

  const login = async (email: string, password: string) => {
    isLoading.value = true
    try {
      interface LoginData {
        user: User
        employee: {
          id: string
          fullName: string
          employeeCode: string | null
          branchId: string | null
          branchName: string | null
          jobTitleId: string | null
          jobTitleName: string | null
        } | null
      }

      const response = await apiRequest<LoginData>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Login failed')
      }

      user.value = response.data.user

      // Set employee info from login response
      if (response.data.employee) {
        currentEmployee.value = {
          id: response.data.employee.id,
          full_name: response.data.employee.fullName,
          employee_code: response.data.employee.employeeCode,
          branch_id: response.data.employee.branchId,
          branch_name: response.data.employee.branchName,
          job_title_id: response.data.employee.jobTitleId,
          job_title_name: response.data.employee.jobTitleName,
        }
      } else {
        currentEmployee.value = null
      }

      // Save session to localStorage for persistence
      if (user.value) {
        saveSession(user.value, currentEmployee.value)

        // Set Sentry user context
        try {
          Sentry.setUser({
            id: user.value.id,
            email: user.value.email,
          })
        } catch {
          // Sentry not initialized - ignore
        }
      }

      toast.success('登入成功')
      return { success: true }
    } catch (error: unknown) {
      handleError(error, {
        context: 'useAuthV2.login',
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
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore logout errors
    } finally {
      clearSession()

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

  interface MeData {
    id: string
    email: string
    role: string
    employeeId: string | null
    tenantId: string | null
    isActive: boolean
    employee: {
      id: string
      fullName: string
      employeeCode: string | null
      phone: string | null
      branchId: string | null
      branchName: string | null
      jobTitleId: string | null
      jobTitleName: string | null
    } | null
  }

  const fetchUser = async () => {
    try {
      const response = await apiRequest<MeData>('/api/auth/me')
      if (response.success && response.data) {
        user.value = {
          id: response.data.id,
          email: response.data.email,
          role: response.data.role,
          employeeId: response.data.employeeId,
          tenantId: response.data.tenantId,
        }

        // Also update employee info from /me response
        if (response.data.employee) {
          currentEmployee.value = {
            id: response.data.employee.id,
            full_name: response.data.employee.fullName,
            employee_code: response.data.employee.employeeCode,
            branch_id: response.data.employee.branchId,
            branch_name: response.data.employee.branchName,
            job_title_id: response.data.employee.jobTitleId,
            job_title_name: response.data.employee.jobTitleName,
          }
        }
      } else {
        user.value = null
        currentEmployee.value = null
      }
    } catch (error) {
      handleError(error, {
        context: 'useAuthV2.fetchUser',
        showToast: false,
        redirectOnAuth: false
      })
      user.value = null
      currentEmployee.value = null
    }
  }

  const fetchCurrentEmployee = async () => {
    // Employee info is now fetched together with user in /me endpoint
    // This method is kept for backwards compatibility
    if (!user.value) {
      currentEmployee.value = null
    }
  }

  const checkAuth = async () => {
    // Step 1: If we already have user state, verify it's still valid
    if (user.value) {
      try {
        await fetchUser()
        if (user.value) {
          saveSession(user.value, currentEmployee.value)
          return true
        }
      } catch {
        user.value = null
        currentEmployee.value = null
      }
    }

    // Step 2: Try server-side auth (cookies may still be valid)
    try {
      await fetchUser()
      if (user.value) {
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
        // Attempt to refresh the session
        await apiRequest('/api/auth/refresh', { method: 'POST' })

        // Re-fetch user data to verify session is valid
        await fetchUser()
        if (user.value) {
          saveSession(user.value, currentEmployee.value)
          return true
        }
      } catch {
        console.log('[useAuthV2] Session refresh failed, clearing session')
        clearSession()
      }
    }

    // All recovery attempts failed
    return false
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const response = await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to change password')
      }

      toast.success('密碼已更新')
      return { success: true }
    } catch (error) {
      handleError(error, {
        context: 'useAuthV2.changePassword',
        customMessage: '密碼更新失敗'
      })
      return { success: false }
    }
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
    checkAuth,
    changePassword
  }
}
