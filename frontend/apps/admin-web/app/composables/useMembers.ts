import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'
import { useFetch } from '~/composables/core/useFetch'

// =============================================================================
// Wire format of the staff members API (backend/src/routes/members.ts)
// =============================================================================

export type MemberStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BANNED'
export type MemberGender = 'MALE' | 'FEMALE' | 'OTHER'

/** A member row (MEMBER_RETURNING): camelCase */
export interface ApiMember {
  id: string
  memberCode: string
  fullName: string
  phone: string
  email: string | null
  gender: MemberGender | null
  birthday: string | null
  idNumber?: string | null
  address?: string | null
  emergencyContact: string | null
  emergencyPhone: string | null
  branchId: string
  salesPersonId: string | null
  status: MemberStatus
  joinDate: string | null
  tags: string[] | null
  notes?: string | null
  avatar?: string | null
  height: number | null
  createdAt?: string | null
  updatedAt?: string | null
}

/** Body of POST /api/members; field names match the backend zod schema exactly */
export interface MemberInput {
  fullName: string
  phone: string
  branchId: string
  email?: string | null
  status?: MemberStatus
  joinDate?: string
  salesPersonId?: string | null
  gender?: MemberGender | null
  birthday?: string | null
  address?: string | null
  emergencyContact?: string | null
  emergencyPhone?: string | null
  height?: number | null
  tags?: string[]
  notes?: string | null
}

export interface MemberListFilters {
  page?: number
  limit?: number
  /** name, member code, phone or email */
  search?: string
  branchId?: string
  status?: MemberStatus | ''
}

type ListResponse = { data?: ApiMember[]; pagination?: { total?: number } }

/** Backend error text when it is a readable message, otherwise the fallback */
const errorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query[key] = value
  }
  return query
}

const inFlightMembersMap = new Map<string, Promise<void>>()
const inFlightMemberDetailMap = new Map<string, Promise<ApiMember | null>>()

export const useMembers = () => {
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()
  const { apiFetch } = useFetch()

  const members = useState<ApiMember[]>('members', () => [])
  const isLoading = useState('members_loading', () => false)
  const totalCount = useState('members_total', () => 0)

  const listMembers = async (filters: MemberListFilters) => {
    const response = await apiFetch<ApiMember[]>('/members', {
      params: buildQuery({ ...filters, sortBy: 'dateCreated', sortOrder: 'desc' })
    }) as unknown as ListResponse
    return { rows: response.data || [], total: Number(response.pagination?.total) || 0 }
  }

  const fetchMembers = async (filters: MemberListFilters = {}, force = false) => {
    const key = JSON.stringify(filters)
    if (!force && inFlightMembersMap.has(key)) {
      return inFlightMembersMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { page = 1, limit = 20, ...rest } = filters

      try {
        const { rows, total } = await listMembers({ page, limit, ...rest })
        members.value = rows
        totalCount.value = total
      } catch (error) {
        handleError(error, {
          context: 'useMembers.fetchMembers',
          customMessage: MESSAGES.ERRORS.MEMBER_FETCH_FAILED
        })
      } finally {
        isLoading.value = false
        inFlightMembersMap.delete(key)
      }
    })()

    inFlightMembersMap.set(key, promise)
    return promise
  }

  /** Server-side search (name, code, phone, email) that leaves the shared list state alone */
  const searchMembers = async (search: string, limit = 5): Promise<ApiMember[]> => {
    const query = search.trim()
    if (!query) return []
    try {
      const { rows } = await listMembers({ search: query, limit, page: 1 })
      return rows
    } catch (error) {
      handleError(error, {
        context: 'useMembers.searchMembers',
        customMessage: MESSAGES.ERRORS.MEMBER_FETCH_FAILED
      })
      return []
    }
  }

  /** The member whose code is exactly `code` (case-insensitive), or null */
  const findMemberByCode = async (code: string): Promise<ApiMember | null> => {
    const wanted = code.trim().toLowerCase()
    if (!wanted) return null
    const rows = await searchMembers(code, 20)
    return rows.find(m => m.memberCode?.toLowerCase() === wanted) ?? null
  }

  const getMember = async (id: string): Promise<ApiMember | null> => {
    const existing = inFlightMemberDetailMap.get(id)
    if (existing) return existing

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiMember>(`/members/${id}`)
        return data ?? null
      } catch (error) {
        handleError(error, {
          context: 'useMembers.getMember',
          customMessage: errorMessage(error, MESSAGES.ERRORS.MEMBER_FETCH_FAILED)
        })
        return null
      } finally {
        inFlightMemberDetailMap.delete(id)
      }
    })()

    inFlightMemberDetailMap.set(id, promise)
    return promise
  }

  /** Returns the created member, or null after showing the backend's reason */
  const createMember = async (input: MemberInput): Promise<ApiMember | null> => {
    try {
      const { data } = await apiFetch<ApiMember>('/members', { method: 'POST', body: input })
      if (!data) throw new Error(MESSAGES.ERRORS.MEMBER_CREATE_FAILED)
      invalidateCache([CACHE_KEYS.MEMBERS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useMembers.createMember',
        customMessage: errorMessage(error, MESSAGES.ERRORS.MEMBER_CREATE_FAILED)
      })
      return null
    }
  }

  /** Returns the updated member, or null after showing the backend's reason */
  const updateMember = async (
    id: string,
    patch: Partial<MemberInput>,
    options: { showToast?: boolean } = {}
  ): Promise<ApiMember | null> => {
    try {
      const { data } = await apiFetch<ApiMember>(`/members/${id}`, { method: 'PATCH', body: patch })
      if (!data) throw new Error(MESSAGES.ERRORS.MEMBER_UPDATE_FAILED)
      invalidateCache([CACHE_KEYS.MEMBERS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useMembers.updateMember',
        customMessage: errorMessage(error, MESSAGES.ERRORS.MEMBER_UPDATE_FAILED),
        showToast: options.showToast ?? true
      })
      return null
    }
  }

  /**
   * Sets the status of several members (PATCH /members/:id each, there is no bulk route).
   * Returns how many were actually updated; failures are logged, not toasted one by one.
   */
  const updateMembersStatus = async (ids: string[], status: MemberStatus) => {
    const results = await Promise.all(ids.map(id => updateMember(id, { status }, { showToast: false })))
    const updated = results.filter(Boolean).length
    return { updated, failed: ids.length - updated }
  }

  /** DELETE /members/:id archives the member (status SUSPENDED). Returns false after showing why. */
  const deleteMember = async (id: string, options: { showToast?: boolean } = {}): Promise<boolean> => {
    try {
      await apiFetch(`/members/${id}`, { method: 'DELETE' })
      invalidateCache([CACHE_KEYS.MEMBERS, CACHE_KEYS.CONTRACTS])
      return true
    } catch (error) {
      handleError(error, {
        context: 'useMembers.deleteMember',
        customMessage: errorMessage(error, MESSAGES.ERRORS.MEMBER_DELETE_FAILED),
        showToast: options.showToast ?? true
      })
      return false
    }
  }

  return {
    members,
    isLoading,
    totalCount,
    fetchMembers,
    searchMembers,
    findMemberByCode,
    getMember,
    createMember,
    updateMember,
    updateMembersStatus,
    deleteMember
  }
}
