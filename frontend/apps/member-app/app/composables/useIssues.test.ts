/**
 * Tests for useIssues composable
 *
 * Tests issue CRUD, offline caching, status/type helpers, and computed properties
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
}

// Mock issue data
const mockIssueSubmitted = {
  id: 'issue-1',
  member_id: 'member-1',
  branch_id: 'branch-1',
  type: 'EQUIPMENT' as const,
  title: '跑步機故障',
  content: '3號跑步機無法啟動',
  attachments: [{ id: 'file-1', filename: 'photo.jpg', type: 'image/jpeg' }],
  status: 'SUBMITTED' as const,
  assigned_to: null,
  branch_name: 'Main Branch',
  resolution: null,
  resolved_at: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}

const mockIssueInProgress = {
  id: 'issue-2',
  member_id: 'member-1',
  branch_id: 'branch-1',
  type: 'SERVICE' as const,
  title: '服務態度問題',
  content: '前台態度不佳',
  attachments: null,
  status: 'IN_PROGRESS' as const,
  assigned_to: 'staff-1',
  assigned_to_name: 'Staff Name',
  branch_name: 'Main Branch',
  resolution: null,
  resolved_at: null,
  created_at: '2024-01-10T10:00:00Z',
  updated_at: '2024-01-12T10:00:00Z',
}

const mockIssueResolved = {
  id: 'issue-3',
  member_id: 'member-1',
  branch_id: 'branch-1',
  type: 'SUGGESTION' as const,
  title: '建議增加瑜珈課',
  content: '希望增加早晨瑜珈課程',
  attachments: null,
  status: 'RESOLVED' as const,
  assigned_to: 'staff-2',
  branch_name: 'Main Branch',
  resolution: '已安排開課',
  resolved_at: '2024-01-20T10:00:00Z',
  created_at: '2024-01-05T10:00:00Z',
  updated_at: '2024-01-20T10:00:00Z',
}

const mockIssueClosed = {
  id: 'issue-4',
  member_id: 'member-1',
  branch_id: 'branch-1',
  type: 'COMPLAINT' as const,
  title: '噪音問題',
  content: '音樂太大聲',
  attachments: null,
  status: 'CLOSED' as const,
  assigned_to: null,
  branch_name: 'Main Branch',
  resolution: '已調整音量',
  resolved_at: '2024-01-18T10:00:00Z',
  created_at: '2024-01-01T10:00:00Z',
  updated_at: '2024-01-18T10:00:00Z',
}

// Mock ISSUE_STATUS_COLORS
vi.mock('../schemas/issue.schema', () => ({
  ISSUE_STATUS_COLORS: {
    SUBMITTED: 'warning',
    IN_PROGRESS: 'primary',
    RESOLVED: 'success',
    CLOSED: 'muted',
  },
}))

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

// Mock useMemberAuth
const mockMemberRef = { value: mockMember }
const mockGetAuthHeader = vi.fn(() => ({ 'X-Member-Token': 'test-token' }))

vi.stubGlobal('useMemberAuth', () => ({
  member: mockMemberRef,
  getAuthHeader: mockGetAuthHeader,
}))

// Mock useOfflineSync
const mockIsOnline = { value: true }
const mockGetCache = vi.fn().mockResolvedValue(null)
const mockSetCache = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('useOfflineSync', () => ({
  isOnline: mockIsOnline,
  getCache: mockGetCache,
  setCache: mockSetCache,
}))

// Import after mocks
import { useIssues } from './useIssues'

describe('useIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockMemberRef.value = mockMember
    mockIsOnline.value = true
    mockGetCache.mockResolvedValue(null)
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const i = useIssues()

      expect(i.issues).toBeDefined()
      expect(i.isLoading).toBeDefined()
      expect(i.isOfflineData).toBeDefined()
      expect(i.issues.value).toEqual([])
    })

    it('should expose all required methods', () => {
      const i = useIssues()

      expect(typeof i.fetchIssues).toBe('function')
      expect(typeof i.getIssue).toBe('function')
      expect(typeof i.createIssue).toBe('function')
      expect(typeof i.updateIssue).toBe('function')
      expect(typeof i.getStatusLabel).toBe('function')
      expect(typeof i.getStatusColor).toBe('function')
      expect(typeof i.getTypeLabel).toBe('function')
      expect(typeof i.getTypeIcon).toBe('function')
      expect(typeof i.canEdit).toBe('function')
      expect(typeof i.formatDate).toBe('function')
    })

    it('should expose computed properties', () => {
      const i = useIssues()

      expect(i.pendingIssues).toBeDefined()
      expect(i.resolvedIssues).toBeDefined()
    })
  })

  describe('fetchIssues', () => {
    it('should return empty array when no member', async () => {
      mockMemberRef.value = null as never

      const { fetchIssues } = useIssues()
      const result = await fetchIssues()

      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch issues successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockIssueSubmitted, mockIssueInProgress],
      })

      const { fetchIssues, issues, isLoading } = useIssues()
      const result = await fetchIssues()

      expect(result).toEqual([mockIssueSubmitted, mockIssueInProgress])
      expect(issues.value).toEqual([mockIssueSubmitted, mockIssueInProgress])
      expect(isLoading.value).toBe(false)
    })

    it('should pass filter parameters', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchIssues } = useIssues()
      await fetchIssues({
        status: 'SUBMITTED',
        type: 'EQUIPMENT',
        limit: 10,
        offset: 5,
      })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('status=SUBMITTED')
      expect(url).toContain('type=EQUIPMENT')
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=5')
    })

    it('should cache data after successful fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockIssueSubmitted],
      })

      const { fetchIssues } = useIssues()
      await fetchIssues()

      expect(mockSetCache).toHaveBeenCalledWith(
        expect.any(String),
        [mockIssueSubmitted],
        5 * 60 * 1000
      )
    })

    it('should use cached data when offline', async () => {
      mockIsOnline.value = false
      mockGetCache.mockResolvedValueOnce([mockIssueSubmitted])

      const { fetchIssues, issues, isOfflineData } = useIssues()
      const result = await fetchIssues()

      expect(result).toEqual([mockIssueSubmitted])
      expect(issues.value).toEqual([mockIssueSubmitted])
      expect(isOfflineData.value).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should return empty array when offline with no cache', async () => {
      mockIsOnline.value = false

      const { fetchIssues } = useIssues()
      const result = await fetchIssues()

      expect(result).toEqual([])
    })

    it('should fall back to cache on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockGetCache.mockResolvedValueOnce([mockIssueSubmitted])

      const { fetchIssues, isOfflineData } = useIssues()
      const result = await fetchIssues()

      expect(result).toEqual([mockIssueSubmitted])
      expect(isOfflineData.value).toBe(true)
    })

    it('should return empty array on network error with no cache', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchIssues } = useIssues()
      const result = await fetchIssues()

      expect(result).toEqual([])
    })

    it('should set loading state during fetch', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: [] }), 50)
        })
      )

      const { fetchIssues, isLoading } = useIssues()
      const promise = fetchIssues()

      expect(isLoading.value).toBe(true)

      await promise

      expect(isLoading.value).toBe(false)
    })
  })

  describe('getIssue', () => {
    it('should return null when no member', async () => {
      mockMemberRef.value = null as never

      const { getIssue } = useIssues()
      const result = await getIssue('issue-1')

      expect(result).toBeNull()
    })

    it('should fetch a single issue', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: mockIssueSubmitted })

      const { getIssue } = useIssues()
      const result = await getIssue('issue-1')

      expect(result).toEqual(mockIssueSubmitted)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/issues/issue-1',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
    })

    it('should return null on unsuccessful response', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { getIssue } = useIssues()
      const result = await getIssue('issue-1')

      expect(result).toBeNull()
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getIssue } = useIssues()
      const result = await getIssue('issue-1')

      expect(result).toBeNull()
    })
  })

  describe('createIssue', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { createIssue } = useIssues()
      const result = await createIssue({
        type: 'EQUIPMENT',
        title: 'Test',
        content: 'Test content',
      })

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should create issue successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Created',
        data: mockIssueSubmitted,
      })

      const { createIssue, issues } = useIssues()
      const result = await createIssue({
        type: 'EQUIPMENT',
        title: '跑步機故障',
        content: '3號跑步機無法啟動',
        attachments: [{ id: 'file-1', filename: 'photo.jpg' }],
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockIssueSubmitted)
      expect(issues.value[0]).toEqual(mockIssueSubmitted)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/issues',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-Member-Token': 'test-token' },
          body: expect.objectContaining({
            type: 'EQUIPMENT',
            title: '跑步機故障',
          }),
        })
      )
    })

    it('should handle create error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server error'))

      const { createIssue } = useIssues()
      const result = await createIssue({
        type: 'EQUIPMENT',
        title: 'Test',
        content: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('updateIssue', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { updateIssue } = useIssues()
      const result = await updateIssue('issue-1', { title: 'Updated' })

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should update issue and local state', async () => {
      const updatedIssue = { ...mockIssueSubmitted, title: 'Updated title' }
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Updated',
        data: updatedIssue,
      })

      stateStore.set('member_issues', { value: [mockIssueSubmitted] })

      const { updateIssue, issues } = useIssues()
      const result = await updateIssue('issue-1', { title: 'Updated title' })

      expect(result.success).toBe(true)
      expect(issues.value[0].title).toBe('Updated title')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/issues/issue-1',
        expect.objectContaining({
          method: 'PUT',
          body: { title: 'Updated title' },
        })
      )
    })

    it('should handle update error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Update failed'))

      const { updateIssue } = useIssues()
      const result = await updateIssue('issue-1', { title: 'Updated' })

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('getStatusLabel', () => {
    it('should return correct labels for all statuses', () => {
      const { getStatusLabel } = useIssues()

      expect(getStatusLabel('SUBMITTED')).toBe('已提交')
      expect(getStatusLabel('IN_PROGRESS')).toBe('處理中')
      expect(getStatusLabel('RESOLVED')).toBe('已解決')
      expect(getStatusLabel('CLOSED')).toBe('已關閉')
    })
  })

  describe('getStatusColor', () => {
    it('should return correct colors for all statuses', () => {
      const { getStatusColor } = useIssues()

      expect(getStatusColor('SUBMITTED')).toBe('warning')
      expect(getStatusColor('IN_PROGRESS')).toBe('primary')
      expect(getStatusColor('RESOLVED')).toBe('success')
      expect(getStatusColor('CLOSED')).toBe('muted')
    })
  })

  describe('getTypeLabel', () => {
    it('should return correct labels for all types', () => {
      const { getTypeLabel } = useIssues()

      expect(getTypeLabel('EQUIPMENT')).toBe('設備問題')
      expect(getTypeLabel('SERVICE')).toBe('服務問題')
      expect(getTypeLabel('SUGGESTION')).toBe('意見建議')
      expect(getTypeLabel('COMPLAINT')).toBe('客訴反映')
    })
  })

  describe('getTypeIcon', () => {
    it('should return correct icons for all types', () => {
      const { getTypeIcon } = useIssues()

      expect(getTypeIcon('EQUIPMENT')).toBe('tool')
      expect(getTypeIcon('SERVICE')).toBe('users')
      expect(getTypeIcon('SUGGESTION')).toBe('lightbulb')
      expect(getTypeIcon('COMPLAINT')).toBe('alert-triangle')
    })
  })

  describe('canEdit', () => {
    it('should return true for SUBMITTED issues', () => {
      const { canEdit } = useIssues()
      expect(canEdit(mockIssueSubmitted)).toBe(true)
    })

    it('should return false for IN_PROGRESS issues', () => {
      const { canEdit } = useIssues()
      expect(canEdit(mockIssueInProgress)).toBe(false)
    })

    it('should return false for RESOLVED issues', () => {
      const { canEdit } = useIssues()
      expect(canEdit(mockIssueResolved)).toBe(false)
    })

    it('should return false for CLOSED issues', () => {
      const { canEdit } = useIssues()
      expect(canEdit(mockIssueClosed)).toBe(false)
    })
  })

  describe('formatDate', () => {
    it('should format date in zh-TW locale with time', () => {
      const { formatDate } = useIssues()
      const result = formatDate('2024-01-15T10:00:00Z')

      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('computed properties', () => {
    it('pendingIssues should include SUBMITTED and IN_PROGRESS', () => {
      stateStore.set('member_issues', {
        value: [mockIssueSubmitted, mockIssueInProgress, mockIssueResolved, mockIssueClosed],
      })

      const { pendingIssues } = useIssues()

      expect(pendingIssues.value).toHaveLength(2)
      expect(pendingIssues.value.map((i: { id: string }) => i.id)).toEqual(['issue-1', 'issue-2'])
    })

    it('resolvedIssues should include RESOLVED and CLOSED', () => {
      stateStore.set('member_issues', {
        value: [mockIssueSubmitted, mockIssueInProgress, mockIssueResolved, mockIssueClosed],
      })

      const { resolvedIssues } = useIssues()

      expect(resolvedIssues.value).toHaveLength(2)
      expect(resolvedIssues.value.map((i: { id: string }) => i.id)).toEqual(['issue-3', 'issue-4'])
    })

    it('should return empty arrays when no issues', () => {
      stateStore.set('member_issues', { value: [] })

      const { pendingIssues, resolvedIssues } = useIssues()

      expect(pendingIssues.value).toHaveLength(0)
      expect(resolvedIssues.value).toHaveLength(0)
    })
  })
})
