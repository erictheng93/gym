/**
 * Tests for useMemberAuth composable (Facade)
 *
 * This tests the unified authentication facade that delegates to:
 * - useAuthTokens
 * - useAuthSession
 * - useAuthMethods
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state stores
const stateStore = new Map<string, { value: unknown }>()
const cookieStore = new Map<string, { value: string | null | undefined }>()

// Mock member data
const mockMember = {
  id: 'member-1',
  member_code: 'M001',
  full_name: 'Test User',
  phone: '0912345678',
  email: 'test@example.com',
  branch_id: 'branch-1',
  branch_name: 'Main Branch',
  member_status: 'ACTIVE' as const,
  activeContract: null,
}

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})

vi.stubGlobal('useCookie', (name: string) => {
  if (!cookieStore.has(name)) {
    cookieStore.set(name, { value: null })
  }
  return cookieStore.get(name)!
})

vi.stubGlobal('computed', (getter: () => unknown) => ({
  get value() {
    return getter()
  },
}))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock navigateTo
const mockNavigateTo = vi.fn()
vi.stubGlobal('navigateTo', mockNavigateTo)

// Mock useRouter
vi.stubGlobal('useRouter', () => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: { PROD: false },
  },
})

// Mock child composables for facade testing
const mockTokens = {
  accessToken: { value: null as string | null },
  refreshToken: { value: null as string | null },
  hasAccessToken: { get value() { return !!cookieStore.get('member_access_token')?.value } },
  hasRefreshToken: { get value() { return !!cookieStore.get('member_refresh_token')?.value } },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  refreshAccessToken: vi.fn().mockResolvedValue(true),
  getAuthHeader: () => {
    const token = cookieStore.get('member_access_token')?.value
    return token ? { 'X-Member-Token': token } : {}
  },
  getTokenState: () => ({
    accessToken: cookieStore.get('member_access_token')?.value ?? null,
    refreshToken: cookieStore.get('member_refresh_token')?.value ?? null,
  }),
}

const mockSession = {
  member: stateStore.get('member') || { value: null },
  isAuthenticated: { get value() { return !!stateStore.get('member')?.value } },
  isLoading: { value: false },
  activeContract: { get value() { return stateStore.get('member')?.value?.activeContract ?? null } },
  displayName: { get value() { return stateStore.get('member')?.value?.full_name ?? '會員' } },
  memberStatus: { get value() { return stateStore.get('member')?.value?.member_status ?? null } },
  fetchMember: vi.fn().mockResolvedValue(true),
  clearSession: vi.fn(),
  setLoading: vi.fn(),
  updateMemberData: vi.fn(),
}

const mockMethods = {
  otpLoading: { value: false },
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  loginWithOtp: vi.fn(),
  login: vi.fn(),
  loginWithOAuth: vi.fn().mockResolvedValue({ success: false }),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  completeProfile: vi.fn(),
  logout: vi.fn(),
}

vi.stubGlobal('useAuthTokens', () => mockTokens)
vi.stubGlobal('useAuthSession', () => {
  // Ensure member state exists
  if (!stateStore.has('member')) {
    stateStore.set('member', { value: null })
  }
  return {
    ...mockSession,
    member: stateStore.get('member')!,
    isAuthenticated: { get value() { return !!stateStore.get('member')?.value } },
    activeContract: { get value() { return stateStore.get('member')?.value?.activeContract ?? null } },
    displayName: { get value() { return stateStore.get('member')?.value?.full_name ?? '會員' } },
    memberStatus: { get value() { return stateStore.get('member')?.value?.member_status ?? null } },
  }
})
vi.stubGlobal('useAuthMethods', () => mockMethods)

// Import after mocks are set up
import { useMemberAuth } from './useMemberAuth'

describe('useMemberAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
  })

  describe('initialization', () => {
    it('should expose state from useAuthSession', () => {
      const auth = useMemberAuth()

      expect(auth.member).toBeDefined()
      expect(auth.isAuthenticated).toBeDefined()
      expect(auth.isLoading).toBeDefined()
      expect(auth.activeContract).toBeDefined()
      expect(auth.displayName).toBeDefined()
      expect(auth.memberStatus).toBeDefined()
    })

    it('should expose token state from useAuthTokens', () => {
      const auth = useMemberAuth()

      expect(auth.accessToken).toBeDefined()
      expect(auth.getAuthHeader).toBeDefined()
      expect(auth.refreshAccessToken).toBeDefined()
    })

    it('should expose methods from useAuthMethods', () => {
      const auth = useMemberAuth()

      expect(auth.login).toBeDefined()
      expect(auth.logout).toBeDefined()
      expect(auth.sendOtp).toBeDefined()
      expect(auth.verifyOtp).toBeDefined()
      expect(auth.loginWithOtp).toBeDefined()
      expect(auth.forgotPassword).toBeDefined()
      expect(auth.resetPassword).toBeDefined()
      expect(auth.changePassword).toBeDefined()
    })
  })

  describe('isAuthenticated', () => {
    it('should return false when no member is logged in', () => {
      const { isAuthenticated } = useMemberAuth()
      expect(isAuthenticated.value).toBe(false)
    })

    it('should return true when member exists', () => {
      const { member, isAuthenticated } = useMemberAuth()
      member.value = mockMember
      expect(isAuthenticated.value).toBe(true)
    })
  })

  describe('displayName', () => {
    it('should return default when no member', () => {
      const { displayName } = useMemberAuth()
      expect(displayName.value).toBe('會員')
    })

    it('should return member full name when available', () => {
      const { member, displayName } = useMemberAuth()
      member.value = mockMember
      expect(displayName.value).toBe('Test User')
    })
  })

  describe('checkAuth', () => {
    it('should return true if already authenticated', async () => {
      stateStore.set('member', { value: mockMember })

      const auth = useMemberAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(true)
    })

    it('should try to fetch member with access token', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockSession.fetchMember.mockResolvedValueOnce(true)

      const auth = useMemberAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(true)
      expect(mockSession.fetchMember).toHaveBeenCalled()
    })

    it('should try to refresh token if access token fetch fails', async () => {
      cookieStore.set('member_access_token', { value: 'expired-token' })
      cookieStore.set('member_refresh_token', { value: 'valid-refresh-token' })

      // First fetch fails
      mockSession.fetchMember.mockResolvedValueOnce(false)
      // Token refresh succeeds
      mockTokens.refreshAccessToken.mockResolvedValueOnce(true)
      // Second fetch succeeds
      mockSession.fetchMember.mockResolvedValueOnce(true)

      const auth = useMemberAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(true)
      expect(mockTokens.refreshAccessToken).toHaveBeenCalled()
    })

    it('should return false if all auth methods fail', async () => {
      mockSession.fetchMember.mockResolvedValue(false)
      mockTokens.refreshAccessToken.mockResolvedValue(false)
      mockMethods.loginWithOAuth.mockResolvedValue({ success: false })

      const auth = useMemberAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(false)
    })
  })

  describe('getAuthHeader', () => {
    it('should return empty object when no token', () => {
      const { getAuthHeader } = useMemberAuth()
      expect(getAuthHeader()).toEqual({})
    })

    it('should return X-Member-Token header when token exists', () => {
      cookieStore.set('member_access_token', { value: 'my-token' })

      const { getAuthHeader } = useMemberAuth()
      expect(getAuthHeader()).toEqual({
        'X-Member-Token': 'my-token',
      })
    })
  })

  describe('activeContract', () => {
    it('should return null when no member', () => {
      const { activeContract } = useMemberAuth()
      expect(activeContract.value).toBeNull()
    })

    it('should return active contract from member', () => {
      const contract = {
        id: 'contract-1',
        contract_status: 'ACTIVE' as const,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      }

      const { member, activeContract } = useMemberAuth()
      member.value = { ...mockMember, activeContract: contract as any }

      expect(activeContract.value).toEqual(contract)
    })
  })

  describe('memberStatus', () => {
    it('should return null when no member', () => {
      const { memberStatus } = useMemberAuth()
      expect(memberStatus.value).toBeNull()
    })

    it('should return member status when member exists', () => {
      const { member, memberStatus } = useMemberAuth()
      member.value = { ...mockMember, member_status: 'SUSPENDED' }

      expect(memberStatus.value).toBe('SUSPENDED')
    })
  })

  describe('facade pattern', () => {
    it('should provide unified interface to all auth functionality', () => {
      const auth = useMemberAuth()

      // Verify all expected properties are exposed
      const expectedProperties = [
        // State
        'member',
        'isAuthenticated',
        'isLoading',
        'activeContract',
        'displayName',
        'memberStatus',
        'accessToken',
        'otpLoading',
        // OTP methods
        'sendOtp',
        'verifyOtp',
        'loginWithOtp',
        // Email/Password methods
        'login',
        // OAuth methods
        'loginWithOAuth',
        // Password management
        'forgotPassword',
        'resetPassword',
        'changePassword',
        // Profile
        'completeProfile',
        // Session management
        'logout',
        'fetchMember',
        'checkAuth',
        // Token management
        'refreshAccessToken',
        'getAuthHeader',
      ]

      for (const prop of expectedProperties) {
        expect(auth).toHaveProperty(prop)
      }
    })
  })
})
