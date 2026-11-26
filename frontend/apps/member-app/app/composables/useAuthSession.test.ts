/**
 * Tests for useAuthSession composable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock state and cookie storage
const stateStore = new Map<string, { value: unknown }>()
const cookieStore = new Map<string, { value: string | null | undefined }>()

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

// Mock useAuthTokens
const mockRefreshAccessToken = vi.fn()
vi.stubGlobal('useAuthTokens', () => ({
  getAuthHeader: () => {
    const token = cookieStore.get('member_access_token')?.value
    return token ? { 'X-Member-Token': token } : {}
  },
  refreshAccessToken: mockRefreshAccessToken,
  hasAccessToken: {
    get value() {
      return !!cookieStore.get('member_access_token')?.value
    },
  },
  accessToken: {
    get value() {
      return cookieStore.get('member_access_token')?.value ?? null
    },
  },
}))

// Import after mocks
import { useAuthSession } from './useAuthSession'

describe('useAuthSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockRefreshAccessToken.mockResolvedValue(true)
  })

  describe('isAuthenticated', () => {
    it('should return false when no member', () => {
      const { isAuthenticated } = useAuthSession()
      expect(isAuthenticated.value).toBe(false)
    })

    it('should return true when member exists', () => {
      const { member, isAuthenticated } = useAuthSession()

      member.value = {
        id: 'member-1',
        member_code: 'M001',
        full_name: 'Test User',
        phone: '0912345678',
        email: 'test@example.com',
        branch_id: 'branch-1',
        branch_name: 'Main Branch',
        member_status: 'ACTIVE',
        activeContract: null,
      }

      expect(isAuthenticated.value).toBe(true)
    })
  })

  describe('activeContract', () => {
    it('should return null when no member', () => {
      const { activeContract } = useAuthSession()
      expect(activeContract.value).toBeNull()
    })

    it('should return null when member has no active contract', () => {
      const { member, activeContract } = useAuthSession()

      member.value = {
        id: 'member-1',
        member_code: 'M001',
        full_name: 'Test User',
        phone: '0912345678',
        email: 'test@example.com',
        branch_id: 'branch-1',
        branch_name: 'Main Branch',
        member_status: 'ACTIVE',
        activeContract: null,
      }

      expect(activeContract.value).toBeNull()
    })

    it('should return active contract when exists', () => {
      const contract = {
        id: 'contract-1',
        contract_status: 'ACTIVE' as const,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      }

      const { member, activeContract } = useAuthSession()

      member.value = {
        id: 'member-1',
        member_code: 'M001',
        full_name: 'Test User',
        phone: '0912345678',
        email: 'test@example.com',
        branch_id: 'branch-1',
        branch_name: 'Main Branch',
        member_status: 'ACTIVE',
        activeContract: contract as any,
      }

      expect(activeContract.value).toEqual(contract)
    })
  })

  describe('displayName', () => {
    it('should return "會員" when no member', () => {
      const { displayName } = useAuthSession()
      expect(displayName.value).toBe('會員')
    })

    it('should return member full_name when exists', () => {
      const { member, displayName } = useAuthSession()

      member.value = {
        id: 'member-1',
        member_code: 'M001',
        full_name: '王小明',
        phone: '0912345678',
        email: 'test@example.com',
        branch_id: 'branch-1',
        branch_name: 'Main Branch',
        member_status: 'ACTIVE',
        activeContract: null,
      }

      expect(displayName.value).toBe('王小明')
    })
  })

  describe('memberStatus', () => {
    it('should return null when no member', () => {
      const { memberStatus } = useAuthSession()
      expect(memberStatus.value).toBeNull()
    })

    it('should return member status when exists', () => {
      const { member, memberStatus } = useAuthSession()

      member.value = {
        id: 'member-1',
        member_code: 'M001',
        full_name: 'Test User',
        phone: '0912345678',
        email: 'test@example.com',
        branch_id: 'branch-1',
        branch_name: 'Main Branch',
        member_status: 'SUSPENDED',
        activeContract: null,
      }

      expect(memberStatus.value).toBe('SUSPENDED')
    })
  })

  describe('fetchMember', () => {
    it('should return false when no token', async () => {
      const { fetchMember, member } = useAuthSession()
      const result = await fetchMember()

      expect(result).toBe(false)
      expect(member.value).toBeNull()
    })

    // Shape of GET /api/member/me (backend/src/routes/member-profile.ts)
    const apiContract = (id: string) => ({
      id,
      contractNo: `NO-${id}`,
      status: 'ACTIVE',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      remainingCounts: 8,
      plan: { id: 'p1', name: '10 堂課', type: 'COUNT_BASED' },
    })
    const meData = (contracts: unknown[]) => ({
      member: {
        id: 'member-1',
        memberCode: 'M001',
        fullName: 'Test User',
        phone: '0912345678',
        email: 'test@example.com',
        status: 'ACTIVE',
      },
      branch: { id: 'branch-1', name: '台北總店' },
      contracts,
    })

    it('should map the nested /me payload to the session member', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: meData([{ ...apiContract('c0'), status: 'PAUSED' }, apiContract('c1')]),
      })

      const { fetchMember, member } = useAuthSession()
      const result = await fetchMember()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/me',
        { headers: { 'X-Member-Token': 'valid-token' } }
      )
      expect(member.value).toEqual({
        id: 'member-1',
        member_code: 'M001',
        full_name: 'Test User',
        phone: '0912345678',
        email: 'test@example.com',
        branch_id: 'branch-1',
        branch_name: '台北總店',
        member_status: 'ACTIVE',
        activeContract: {
          id: 'c1',
          contract_no: 'NO-c1',
          contract_status: 'ACTIVE',
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          remaining_counts: 8,
          plan: { name: '10 堂課', plan_type: 'COUNT_BASED' },
        },
      })
    })

    it('should use provided token instead of stored token', async () => {
      cookieStore.set('member_access_token', { value: 'stored-token' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: meData([]),
      })

      const { fetchMember } = useAuthSession()
      await fetchMember('provided-token')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/me',
        { headers: { 'X-Member-Token': 'provided-token' } }
      )
    })

    it('should return false on API failure', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })

      mockFetch.mockResolvedValueOnce({
        success: false,
      })

      const { fetchMember, member } = useAuthSession()
      const result = await fetchMember()

      expect(result).toBe(false)
      expect(member.value).toBeNull()
    })

    it('should set activeContract to null when no active contracts', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: meData([{ ...apiContract('c1'), status: 'PAUSED' }]),
      })

      const { fetchMember, member } = useAuthSession()
      await fetchMember()

      expect(member.value?.activeContract).toBeNull()
    })
  })

  describe('clearSession', () => {
    it('should clear member data', () => {
      const { member, clearSession } = useAuthSession()

      member.value = {
        id: 'member-1',
        member_code: 'M001',
        full_name: 'Test User',
        phone: null,
        email: null,
        branch_id: null,
        branch_name: null,
        member_status: 'ACTIVE',
        activeContract: null,
      }

      clearSession()

      expect(member.value).toBeNull()
    })
  })

  describe('setLoading', () => {
    it('should set loading state to true', () => {
      const { setLoading, isLoading } = useAuthSession()
      setLoading(true)

      expect(isLoading.value).toBe(true)
    })

    it('should set loading state to false', () => {
      const { setLoading, isLoading } = useAuthSession()
      setLoading(true)
      setLoading(false)

      expect(isLoading.value).toBe(false)
    })
  })

  describe('updateMemberData', () => {
    it('should update member data when member exists', () => {
      const { member, updateMemberData } = useAuthSession()

      member.value = {
        id: 'member-1',
        member_code: 'M001',
        full_name: 'Old Name',
        phone: '0900000000',
        email: 'old@example.com',
        branch_id: 'branch-1',
        branch_name: 'Old Branch',
        member_status: 'ACTIVE',
        activeContract: null,
      }

      updateMemberData({
        full_name: 'New Name',
        phone: '0912345678',
      })

      expect(member.value?.full_name).toBe('New Name')
      expect(member.value?.phone).toBe('0912345678')
      expect(member.value?.email).toBe('old@example.com') // unchanged
    })

    it('should not update when no member exists', () => {
      const { member, updateMemberData } = useAuthSession()

      updateMemberData({
        full_name: 'New Name',
      })

      expect(member.value).toBeNull()
    })
  })
})
