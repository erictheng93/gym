/**
 * Integration Tests: Authentication Workflow
 *
 * Real useAuth (useAuthV2) + real session-storage (sessionStorage); only the network
 * (global fetch) is mocked. Covers login/logout, session persistence and the
 * checkAuth recovery chain the auth middleware relies on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockGlobalFetch, mockHandleError, mockNavigateTo } from '@test/setup'
// Load useAuth at collection time: a cold transform inside the first test can
// exceed the 5s test timeout under full-suite load.
import { useAuth } from '~/composables/useAuth'
import { loadSession, saveSession } from '~/utils/session-storage'

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 401) => ({
  ok,
  status,
  json: () => Promise.resolve(body)
})

const apiUser = {
  id: 'user-1',
  email: 'admin@gym.com',
  role: 'admin',
  employeeId: 'emp-1',
  tenantId: 'tenant-1'
}

const apiEmployee = {
  id: 'emp-1',
  fullName: '管理員',
  employeeCode: 'ADMIN001',
  phone: null,
  branchId: 'branch-1',
  branchName: '總店',
  jobTitleId: 'job-1',
  jobTitleName: '系統管理員'
}

const meOk = () => jsonResponse({ success: true, data: { user: { ...apiUser, isActive: true }, employee: apiEmployee } })
const unauthorized = () => jsonResponse({ success: false, error: 'Unauthorized' }, false)

const calledEndpoints = () => mockGlobalFetch.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''))

describe('Auth workflow (useAuth + session storage)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGlobalFetch.mockReset()
    sessionStorage.clear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('login maps the employee, persists the session; logout clears it and redirects', async () => {
    mockGlobalFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { user: apiUser, employee: apiEmployee } }))
    const { login, logout, user, currentEmployee, isAuthenticated } = useAuth()

    const result = await login('admin@gym.com', 'password123')

    expect(result).toEqual({ success: true })
    expect(isAuthenticated.value).toBe(true)
    expect(currentEmployee.value).toEqual({
      id: 'emp-1',
      full_name: '管理員',
      employee_code: 'ADMIN001',
      branch_id: 'branch-1',
      branch_name: '總店',
      job_title_id: 'job-1',
      job_title_name: '系統管理員'
    })
    const [url, init] = mockGlobalFetch.mock.calls[0]!
    expect(url).toMatch(/\/api\/auth\/login$/)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(init.body)).toEqual({ email: 'admin@gym.com', password: 'password123' })
    expect(loadSession()?.user.id).toBe('user-1')

    mockGlobalFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
    await logout()

    expect(user.value).toBeNull()
    expect(currentEmployee.value).toBeNull()
    expect(loadSession()).toBeNull()
    expect(mockNavigateTo).toHaveBeenCalledWith('/login')
  })

  it('logout still clears local state when the server call fails', async () => {
    mockGlobalFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { user: apiUser, employee: null } }))
    const { login, logout, user } = useAuth()
    await login('admin@gym.com', 'pw')

    mockGlobalFetch.mockRejectedValueOnce(new Error('offline'))
    await logout()

    expect(user.value).toBeNull()
    expect(loadSession()).toBeNull()
  })

  it('a rejected login leaves the user signed out and stores nothing', async () => {
    mockGlobalFetch.mockResolvedValueOnce(jsonResponse({ success: false, error: 'Invalid email or password' }, false))
    const { login, isAuthenticated } = useAuth()

    const result = await login('wrong@email.com', 'wrong')

    expect(result).toEqual({ success: false, error: 'Invalid email or password' })
    expect(isAuthenticated.value).toBe(false)
    expect(loadSession()).toBeNull()
    expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'useAuthV2.login' }))
  })

  it('a network failure during login is reported, not thrown', async () => {
    mockGlobalFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await useAuth().login('admin@gym.com', 'pw')
    expect(result).toEqual({ success: false, error: 'Network error' })
  })

  describe('checkAuth', () => {
    it('accepts a valid cookie session and caches it', async () => {
      mockGlobalFetch.mockResolvedValueOnce(meOk())
      const { checkAuth, user } = useAuth()

      expect(await checkAuth()).toBe(true)
      expect(user.value?.id).toBe('user-1')
      expect(loadSession()?.employee?.branch_id).toBe('branch-1')
    })

    it('recovers via /refresh when /me fails but a cached session exists', async () => {
      saveSession(apiUser, null)
      mockGlobalFetch
        .mockResolvedValueOnce(unauthorized()) // /me
        .mockResolvedValueOnce(jsonResponse({ success: true })) // /refresh
        .mockResolvedValueOnce(meOk()) // /me again
      const { checkAuth, isAuthenticated } = useAuth()

      expect(await checkAuth()).toBe(true)
      expect(calledEndpoints()).toEqual(['/api/auth/me', '/api/auth/refresh', '/api/auth/me'])
      expect(isAuthenticated.value).toBe(true)
    })

    it('clears the cached session when refresh fails', async () => {
      saveSession(apiUser, null)
      mockGlobalFetch
        .mockResolvedValueOnce(unauthorized()) // /me
        .mockResolvedValueOnce(unauthorized()) // /refresh
      const { checkAuth, isAuthenticated } = useAuth()

      expect(await checkAuth()).toBe(false)
      expect(isAuthenticated.value).toBe(false)
      expect(loadSession()).toBeNull()
    })

    it('does not try to refresh an expired (>24h) cached session', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2024-11-14T09:00:00Z'))
      saveSession(apiUser, null)
      vi.setSystemTime(new Date('2024-11-15T09:00:01Z'))
      mockGlobalFetch.mockResolvedValueOnce(unauthorized())

      expect(await useAuth().checkAuth()).toBe(false)
      expect(calledEndpoints()).toEqual(['/api/auth/me'])
    })
  })

  describe('changePassword', () => {
    it('posts current and new password', async () => {
      mockGlobalFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      const result = await useAuth().changePassword('oldpassword', 'newpassword123')

      expect(result.success).toBe(true)
      const [url, init] = mockGlobalFetch.mock.calls[0]!
      expect(url).toMatch(/\/api\/auth\/change-password$/)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({ currentPassword: 'oldpassword', newPassword: 'newpassword123' })
    })

    it('reports a wrong current password', async () => {
      mockGlobalFetch.mockResolvedValueOnce(jsonResponse({ success: false, error: 'Current password is incorrect' }, false))

      const result = await useAuth().changePassword('wrong', 'newpassword123')

      expect(result.success).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })
})
