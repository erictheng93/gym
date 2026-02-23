/**
 * Integration Tests: Authentication Workflow
 *
 * Tests the complete authentication flow including login, session management,
 * and permission-based access.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockGlobalFetch, mockHandleError } from '@test/setup'

// Helper to create a mock fetch response
const mockFetchResponse = (data: any, ok = true) => ({
  ok,
  json: () => Promise.resolve(data)
})

// Test data types
interface User {
  id: string
  email: string
  role: string
  employeeId: string | null
  tenantId: string | null
}

describe('Auth Workflow Integration', () => {
  const testUser: User = {
    id: 'user-1',
    email: 'admin@gym.com',
    role: 'admin',
    employeeId: 'emp-1',
    tenantId: 'tenant-1'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Login -> Session -> Logout Flow', () => {
    it('should complete full authentication lifecycle', async () => {
      // Step 1: Login
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: testUser,
          employee: {
            id: 'emp-1',
            fullName: '管理員',
            employeeCode: 'ADMIN001',
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-1',
            jobTitleName: '系統管理員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, user, currentEmployee, isAuthenticated, logout } = useAuth()

      // Perform login
      const loginResult = await login('admin@gym.com', 'password123')

      expect(loginResult.success).toBe(true)
      expect(user.value?.email).toBe('admin@gym.com')
      expect(user.value?.role).toBe('admin')
      expect(currentEmployee.value?.full_name).toBe('管理員')
      expect(isAuthenticated.value).toBe(true)

      // Step 2: Logout
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }))

      await logout()

      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
      expect(isAuthenticated.value).toBe(false)
    })

    it('should handle login failure with invalid credentials', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: false,
        error: 'Invalid email or password'
      }, false))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, isAuthenticated } = useAuth()

      const result = await login('wrong@email.com', 'wrongpassword')

      expect(result.success).toBe(false)
      expect(isAuthenticated.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('Session Persistence', () => {
    it('should verify session on checkAuth', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: {
            id: 'user-1',
            email: 'admin@gym.com',
            role: 'admin',
            employeeId: 'emp-1',
            tenantId: 'tenant-1',
            isActive: true,
          },
          employee: {
            id: 'emp-1',
            fullName: '管理員',
            employeeCode: 'ADMIN001',
            phone: null,
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-1',
            jobTitleName: '系統管理員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { checkAuth, user, isAuthenticated } = useAuth()

      const isValid = await checkAuth()

      expect(isValid).toBe(true)
      expect(user.value?.id).toBe('user-1')
      expect(isAuthenticated.value).toBe(true)
    })

    it('should handle expired session', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Unauthorized'))

      const { useAuth } = await import('~/composables/useAuth')
      const { checkAuth, user, isAuthenticated } = useAuth()

      // Reset state
      user.value = null

      const isValid = await checkAuth()

      expect(isValid).toBe(false)
      expect(isAuthenticated.value).toBe(false)
    })
  })

  describe('Role-based Access', () => {
    it('should identify admin user correctly', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: { ...testUser, role: 'admin' },
          employee: {
            id: 'emp-1',
            fullName: '管理員',
            employeeCode: 'ADMIN001',
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-1',
            jobTitleName: '系統管理員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, user } = useAuth()

      await login('admin@gym.com', 'password')

      expect(user.value?.role).toBe('admin')

      // Check if user can access admin features
      const canAccessAdmin = user.value?.role === 'admin' || user.value?.role === 'manager'
      expect(canAccessAdmin).toBe(true)
    })

    it('should identify coach user correctly', async () => {
      const coachUser = { ...testUser, id: 'user-2', email: 'coach@gym.com', role: 'coach' }

      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: coachUser,
          employee: {
            id: 'emp-2',
            fullName: '教練小王',
            employeeCode: 'COACH001',
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-2',
            jobTitleName: '健身教練'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, user } = useAuth()

      await login('coach@gym.com', 'password')

      expect(user.value?.role).toBe('coach')

      // Check coach-specific access
      const canAccessCoachDashboard = user.value?.role === 'coach' || user.value?.role === 'admin'
      expect(canAccessCoachDashboard).toBe(true)

      // Coach should not have admin access
      const canAccessUserManagement = user.value?.role === 'admin'
      expect(canAccessUserManagement).toBe(false)
    })

    it('should identify staff user correctly', async () => {
      const staffUser = { ...testUser, id: 'user-3', email: 'staff@gym.com', role: 'staff' }

      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: staffUser,
          employee: {
            id: 'emp-3',
            fullName: '櫃檯人員',
            employeeCode: 'STAFF001',
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-3',
            jobTitleName: '櫃檯人員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, user } = useAuth()

      await login('staff@gym.com', 'password')

      expect(user.value?.role).toBe('staff')

      // Staff should have limited access
      const canViewMembers = ['admin', 'manager', 'staff'].includes(user.value?.role || '')
      expect(canViewMembers).toBe(true)

      const canManageEmployees = ['admin', 'manager'].includes(user.value?.role || '')
      expect(canManageEmployees).toBe(false)
    })
  })

  describe('Branch Context', () => {
    it('should set branch context from employee data', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: testUser,
          employee: {
            id: 'emp-1',
            fullName: '管理員',
            employeeCode: 'ADMIN001',
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-1',
            jobTitleName: '系統管理員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, currentEmployee } = useAuth()

      await login('admin@gym.com', 'password')

      expect(currentEmployee.value?.branch_id).toBe('branch-1')
      expect(currentEmployee.value?.branch_name).toBe('總店')
    })

    it('should allow HQ admin to access all branches', async () => {
      const hqAdmin = { ...testUser, role: 'admin' }

      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: hqAdmin,
          employee: {
            id: 'emp-1',
            fullName: '總部管理員',
            employeeCode: 'HQ001',
            branchId: null, // HQ admin might not be tied to a specific branch
            branchName: null,
            jobTitleId: 'job-1',
            jobTitleName: '總部管理員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, user, currentEmployee } = useAuth()

      await login('hq@gym.com', 'password')

      // HQ admin should be able to access all branches
      const canAccessAllBranches = user.value?.role === 'admin' && !currentEmployee.value?.branch_id
      expect(canAccessAllBranches).toBe(true)
    })
  })

  describe('Password Management', () => {
    it('should change password successfully', async () => {
      // First login
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: testUser,
          employee: {
            id: 'emp-1',
            fullName: '管理員',
            employeeCode: 'ADMIN001',
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-1',
            jobTitleName: '系統管理員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, changePassword } = useAuth()

      await login('admin@gym.com', 'oldpassword')

      // Change password
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }))

      const result = await changePassword('oldpassword', 'newpassword123')

      expect(result.success).toBe(true)
      expect(mockGlobalFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/change-password'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('newpassword123')
        })
      )
    })

    it('should handle incorrect current password', async () => {
      // Login first
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: testUser,
          employee: {
            id: 'emp-1',
            fullName: '管理員',
            employeeCode: 'ADMIN001',
            branchId: 'branch-1',
            branchName: '總店',
            jobTitleId: 'job-1',
            jobTitleName: '系統管理員'
          }
        }
      }))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, changePassword } = useAuth()

      await login('admin@gym.com', 'password')

      // Attempt to change with wrong current password
      mockGlobalFetch.mockRejectedValueOnce(new Error('Current password is incorrect'))

      const result = await changePassword('wrongpassword', 'newpassword123')

      expect(result.success).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors during login', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Network error'))

      const { useAuth } = await import('~/composables/useAuth')
      const { login, isAuthenticated } = useAuth()

      const result = await login('admin@gym.com', 'password')

      expect(result.success).toBe(false)
      expect(isAuthenticated.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: 'useAuthV2.login'
        })
      )
    })

    it('should handle server errors during checkAuth', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: false,
        error: 'Internal server error'
      }, false))

      const { useAuth } = await import('~/composables/useAuth')
      const { checkAuth, isAuthenticated } = useAuth()

      const result = await checkAuth()

      expect(result).toBe(false)
      expect(isAuthenticated.value).toBe(false)
    })
  })
})
