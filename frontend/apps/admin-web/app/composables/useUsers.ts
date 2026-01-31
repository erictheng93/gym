/**
 * useUsers - User management composable for backend-v2
 * Admin-only operations for managing system users
 */
import { useErrorHandler } from '~/composables/core/useErrorHandler'

interface User {
  id: string
  email: string
  role: string
  isActive: boolean
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  employeeId: string | null
  employee?: {
    id: string
    fullName: string
    employeeCode: string
    branch?: { id: string; name: string } | null
    jobTitle?: { id: string; name: string } | null
  } | null
}

interface CreateUserInput {
  email: string
  password: string
  role: 'admin' | 'manager' | 'coach' | 'staff'
  employeeId?: string | null
}

interface UpdateUserInput {
  email?: string
  role?: 'admin' | 'manager' | 'coach' | 'staff'
  isActive?: boolean
  employeeId?: string | null
}

interface AvailableEmployee {
  id: string
  fullName: string
  employeeCode: string
  email: string | null
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  pagination?: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export const useUsers = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()
  const toast = useToast()

  const apiBaseUrl = config.public?.apiBaseUrl || 'http://localhost:8056'

  const users = useState<User[]>('admin_users', () => [])
  const isLoading = useState('admin_users_loading', () => false)
  const pagination = useState('admin_users_pagination', () => ({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  }))

  // Helper for API requests with auth
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

  const fetchUsers = async (options: {
    page?: number
    limit?: number
    search?: string
    role?: string
    isActive?: boolean
  } = {}) => {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      if (options.page) params.append('page', String(options.page))
      if (options.limit) params.append('limit', String(options.limit))
      if (options.search) params.append('search', options.search)
      if (options.role) params.append('role', options.role)
      if (options.isActive !== undefined) params.append('isActive', String(options.isActive))

      const queryString = params.toString()
      const endpoint = `/api/users${queryString ? `?${queryString}` : ''}`

      const response = await apiRequest<User[]>(endpoint)

      if (response.success && response.data) {
        users.value = response.data
        if (response.pagination) {
          pagination.value = response.pagination
        }
      }

      return { success: true, data: users.value }
    } catch (error) {
      handleError(error, {
        context: 'useUsers.fetchUsers',
        customMessage: '載入使用者列表失敗',
      })
      return { success: false }
    } finally {
      isLoading.value = false
    }
  }

  const fetchUser = async (id: string) => {
    isLoading.value = true
    try {
      const response = await apiRequest<User>(`/api/users/${id}`)

      if (response.success && response.data) {
        return { success: true, data: response.data }
      }

      throw new Error('Failed to fetch user')
    } catch (error) {
      handleError(error, {
        context: 'useUsers.fetchUser',
        customMessage: '載入使用者資料失敗',
      })
      return { success: false, data: null }
    } finally {
      isLoading.value = false
    }
  }

  const createUser = async (input: CreateUserInput) => {
    isLoading.value = true
    try {
      const response = await apiRequest<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify(input),
      })

      if (response.success && response.data) {
        toast.success('使用者已建立')
        // Refresh the list
        await fetchUsers({ page: pagination.value.page })
        return { success: true, data: response.data }
      }

      throw new Error(response.error || 'Failed to create user')
    } catch (error) {
      handleError(error, {
        context: 'useUsers.createUser',
        customMessage: '建立使用者失敗',
      })
      return { success: false }
    } finally {
      isLoading.value = false
    }
  }

  const updateUser = async (id: string, input: UpdateUserInput) => {
    isLoading.value = true
    try {
      const response = await apiRequest<User>(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })

      if (response.success && response.data) {
        toast.success('使用者已更新')
        // Update local state
        const index = users.value.findIndex(u => u.id === id)
        if (index !== -1) {
          users.value[index] = response.data
        }
        return { success: true, data: response.data }
      }

      throw new Error(response.error || 'Failed to update user')
    } catch (error) {
      handleError(error, {
        context: 'useUsers.updateUser',
        customMessage: '更新使用者失敗',
      })
      return { success: false }
    } finally {
      isLoading.value = false
    }
  }

  const deleteUser = async (id: string) => {
    isLoading.value = true
    try {
      const response = await apiRequest<void>(`/api/users/${id}`, {
        method: 'DELETE',
      })

      if (response.success) {
        toast.success('使用者已刪除')
        // Remove from local state
        users.value = users.value.filter(u => u.id !== id)
        return { success: true }
      }

      throw new Error(response.error || 'Failed to delete user')
    } catch (error) {
      handleError(error, {
        context: 'useUsers.deleteUser',
        customMessage: '刪除使用者失敗',
      })
      return { success: false }
    } finally {
      isLoading.value = false
    }
  }

  const resetPassword = async (id: string, newPassword: string) => {
    isLoading.value = true
    try {
      const response = await apiRequest<void>(`/api/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      })

      if (response.success) {
        toast.success('密碼已重設')
        return { success: true }
      }

      throw new Error(response.error || 'Failed to reset password')
    } catch (error) {
      handleError(error, {
        context: 'useUsers.resetPassword',
        customMessage: '重設密碼失敗',
      })
      return { success: false }
    } finally {
      isLoading.value = false
    }
  }

  const fetchAvailableEmployees = async () => {
    try {
      const response = await apiRequest<AvailableEmployee[]>('/api/users/available-employees')

      if (response.success && response.data) {
        return { success: true, data: response.data }
      }

      throw new Error('Failed to fetch available employees')
    } catch (error) {
      handleError(error, {
        context: 'useUsers.fetchAvailableEmployees',
        customMessage: '載入可用員工列表失敗',
      })
      return { success: false, data: [] }
    }
  }

  const toggleUserStatus = async (id: string, isActive: boolean) => {
    return updateUser(id, { isActive })
  }

  return {
    users,
    isLoading,
    pagination,
    fetchUsers,
    fetchUser,
    createUser,
    updateUser,
    deleteUser,
    resetPassword,
    fetchAvailableEmployees,
    toggleUserStatus,
  }
}
