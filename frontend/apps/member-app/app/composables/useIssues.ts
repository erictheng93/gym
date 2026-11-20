/**
 * useIssues composable
 * Handles issue reporting with offline caching
 */

import type { IssueType, IssueStatus } from '../schemas/issue.schema'
import { ISSUE_STATUS_COLORS } from '../schemas/issue.schema'
import { extractErrorMessage } from '../utils/apiHelpers'
import { deduplicateRequest } from '../utils/debounce'

// Cache settings
const CACHE_KEY_ISSUES = 'member:issues'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export interface Issue {
  id: string
  member_id: string
  branch_id: string
  type: IssueType
  title: string
  content: string
  attachments: Array<{ id: string; filename: string; type?: string }> | null
  status: IssueStatus
  assigned_to: string | null
  assigned_to_name?: string
  branch_name?: string
  resolution: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

interface IssueResult {
  success: boolean
  message: string
  data?: Issue
}

interface IssuesResponse {
  success: boolean
  data: Issue[]
}

export const useIssues = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader, member } = useMemberAuth()
  const { isOnline, getCache, setCache } = useOfflineSync()

  const issues = useState<Issue[]>('member_issues', () => [])
  const isLoading = useState('issues_loading', () => false)
  const isOfflineData = useState('issues_is_offline', () => false)

  /**
   * Fetch member's issues with optional filters
   */
  const fetchIssues = async (options?: {
    status?: IssueStatus
    type?: IssueType
    limit?: number
    offset?: number
  }) => {
    if (!member.value) return []

    const cacheKey = `${CACHE_KEY_ISSUES}:${member.value.id}:${JSON.stringify(options || {})}`

    return deduplicateRequest(cacheKey, async () => {
      isLoading.value = true
      isOfflineData.value = false

      try {
        // If offline, try cached data
        if (!isOnline.value) {
          const cached = await getCache<Issue[]>(cacheKey)
          if (cached) {
            issues.value = cached
            isOfflineData.value = true
            return cached
          }
          return []
        }

        const params = new URLSearchParams()
        if (options?.status) params.append('status', options.status)
        if (options?.type) params.append('type', options.type)
        if (options?.limit) params.append('limit', String(options.limit))
        if (options?.offset) params.append('offset', String(options.offset))

        const response = await $fetch<IssuesResponse>(`${apiUrl}/api/member/issues?${params}`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          issues.value = response.data
          await setCache(cacheKey, response.data, CACHE_TTL)
        }
        return response.data
      } catch {
        // Try cached data on network error
        const cached = await getCache<Issue[]>(cacheKey)
        if (cached) {
          issues.value = cached
          isOfflineData.value = true
          return cached
        }
        return []
      } finally {
        isLoading.value = false
      }
    })
  }

  /**
   * Get a single issue by ID
   */
  const getIssue = async (id: string): Promise<Issue | null> => {
    if (!member.value) return null

    return deduplicateRequest(`member:issue:${id}`, async () => {
      try {
        const response = await $fetch<{ success: boolean; data: Issue }>(
          `${apiUrl}/api/member/issues/${id}`,
          { headers: getAuthHeader() }
        )

        return response.success ? response.data : null
      } catch {
        return null
      }
    })
  }

  /**
   * Submit a new issue
   */
  const createIssue = async (data: {
    type: IssueType
    title: string
    content: string
    attachments?: Array<{ id: string; filename: string; type?: string }>
  }): Promise<IssueResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<IssueResult>(`${apiUrl}/api/member/issues`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      if (response.success && response.data) {
        issues.value.unshift(response.data)
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '提交問題失敗'),
      }
    }
  }

  /**
   * Update an issue (only when status is SUBMITTED)
   */
  const updateIssue = async (
    id: string,
    data: {
      title?: string
      content?: string
      attachments?: Array<{ id: string; filename: string; type?: string }>
    }
  ): Promise<IssueResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<IssueResult>(`${apiUrl}/api/member/issues/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: data,
      })

      if (response.success && response.data) {
        const index = issues.value.findIndex(i => i.id === id)
        if (index !== -1) {
          issues.value[index] = response.data
        }
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '更新問題失敗'),
      }
    }
  }

  /**
   * Get status label
   */
  const getStatusLabel = (status: IssueStatus): string => {
    const labels: Record<IssueStatus, string> = {
      SUBMITTED: '已提交',
      IN_PROGRESS: '處理中',
      RESOLVED: '已解決',
      CLOSED: '已關閉',
    }
    return labels[status] || status
  }

  /**
   * Get status color
   */
  const getStatusColor = (status: IssueStatus): string => {
    return ISSUE_STATUS_COLORS[status] || 'muted'
  }

  /**
   * Get type label
   */
  const getTypeLabel = (type: IssueType): string => {
    const labels: Record<IssueType, string> = {
      EQUIPMENT: '設備問題',
      SERVICE: '服務問題',
      SUGGESTION: '意見建議',
      COMPLAINT: '客訴反映',
    }
    return labels[type] || type
  }

  /**
   * Get type icon
   */
  const getTypeIcon = (type: IssueType): string => {
    const icons: Record<IssueType, string> = {
      EQUIPMENT: 'tool',
      SERVICE: 'users',
      SUGGESTION: 'lightbulb',
      COMPLAINT: 'alert-triangle',
    }
    return icons[type] || 'help-circle'
  }

  /**
   * Check if issue can be edited
   */
  const canEdit = (issue: Issue): boolean => {
    return issue.status === 'SUBMITTED'
  }

  /**
   * Format date for display
   */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  /**
   * Group issues by status in a single pass
   */
  const groupedIssues = computed(() => {
    const pending: Issue[] = []
    const resolved: Issue[] = []
    for (const i of issues.value) {
      if (i.status === 'SUBMITTED' || i.status === 'IN_PROGRESS') {
        pending.push(i)
      } else if (i.status === 'RESOLVED' || i.status === 'CLOSED') {
        resolved.push(i)
      }
    }
    return { pending, resolved }
  })

  const pendingIssues = computed(() => groupedIssues.value.pending)
  const resolvedIssues = computed(() => groupedIssues.value.resolved)

  return {
    issues,
    isLoading,
    isOfflineData,
    isOnline,
    pendingIssues,
    resolvedIssues,
    fetchIssues,
    getIssue,
    createIssue,
    updateIssue,
    getStatusLabel,
    getStatusColor,
    getTypeLabel,
    getTypeIcon,
    canEdit,
    formatDate,
  }
}
