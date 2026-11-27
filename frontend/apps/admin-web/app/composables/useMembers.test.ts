import { describe, it, expect, vi, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useMembers, type ApiMember } from './useMembers'
import { MESSAGES } from '~/constants'

const mockInvalidateCache = vi.hoisted(() => vi.fn())

vi.mock('~/composables/core/useApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/core/useApi')>()
  return {
    ...actual,
    useApi: () => ({ invalidateCache: mockInvalidateCache })
  }
})

// =============================================================================
// Fixtures in the exact wire format of backend/src/routes/members.ts (MEMBER_RETURNING):
// camelCase, MALE/FEMALE/OTHER, status ACTIVE/EXPIRED/SUSPENDED/BANNED, list total in `pagination`
// =============================================================================

const apiMember: ApiMember = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  memberCode: 'M000001',
  fullName: '張三',
  phone: '0912345678',
  email: 'zhang@example.com',
  gender: 'MALE',
  birthday: '1990-05-01',
  idNumber: null,
  address: null,
  emergencyContact: null,
  emergencyPhone: null,
  branchId: 'b0000000-0000-4000-8000-000000000001',
  salesPersonId: null,
  status: 'ACTIVE',
  joinDate: '2026-11-01',
  tags: ['VIP'],
  notes: null,
  avatar: null,
  height: 172.5,
  createdAt: '2026-11-01T02:00:00.000Z',
  updatedAt: null
}

const otherMember: ApiMember = { ...apiMember, id: 'a1b2c3d4-0000-4000-8000-000000000002', memberCode: 'M0000010', fullName: '李四', status: 'EXPIRED' }

const listResponse = {
  success: true,
  data: [apiMember, otherMember],
  pagination: { total: 42, page: 1, limit: 20, totalPages: 3 }
}

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useMembers', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
  })

  it('initial state is empty', () => {
    const { members, isLoading, totalCount } = useMembers()

    expect(members.value).toEqual([])
    expect(isLoading.value).toBe(false)
    expect(totalCount.value).toBe(0)
  })

  describe('fetchMembers', () => {
    it('GET /members with the query names the handler reads, storing rows and pagination.total', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(listResponse)
      const { fetchMembers, members, totalCount, isLoading } = useMembers()

      await fetchMembers({ search: '張三', branchId: 'b-9', status: 'ACTIVE', page: 2, limit: 10 }, true)

      expect(lastCall()).toEqual(['/members', {
        params: { page: 2, limit: 10, search: '張三', branchId: 'b-9', status: 'ACTIVE', sortBy: 'dateCreated', sortOrder: 'desc' }
      }])
      expect(members.value).toEqual([apiMember, otherMember])
      expect(totalCount.value).toBe(42)
      expect(isLoading.value).toBe(false)
    })

    it('does not send empty filters', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(listResponse)
      const { fetchMembers } = useMembers()

      await fetchMembers({ search: '', status: '' }, true)

      expect(lastCall()[1].params).toEqual({ page: 1, limit: 20, sortBy: 'dateCreated', sortOrder: 'desc' })
    })

    it('a slower, older search response does not overwrite a newer one (#17)', async () => {
      let resolveOld!: (v: unknown) => void
      mockFetchInstance.apiFetch
        .mockImplementationOnce(() => new Promise((r) => { resolveOld = r })) // search "A", slow
        .mockResolvedValueOnce({ ...listResponse, data: [otherMember], pagination: { ...listResponse.pagination, total: 1 } }) // search "AB"
      const { fetchMembers, members, totalCount, isLoading } = useMembers()

      const oldFetch = fetchMembers({ search: 'A' }, true)
      await fetchMembers({ search: 'AB' }, true)
      resolveOld(listResponse) // the older response arrives last
      await oldFetch

      expect(members.value).toEqual([otherMember])
      expect(totalCount.value).toBe(1)
      expect(isLoading.value).toBe(false)
    })

    it('reports the error and leaves loading off when fetching fails', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Fetch failed'))
      const { fetchMembers, isLoading } = useMembers()

      await fetchMembers({}, true)

      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'useMembers.fetchMembers' }))
    })

    it('deduplicates concurrent identical requests', async () => {
      mockFetchInstance.apiFetch.mockResolvedValue(listResponse)
      const { fetchMembers } = useMembers()

      await Promise.all([fetchMembers({ page: 5 }), fetchMembers({ page: 5 })])

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('searchMembers / findMemberByCode', () => {
    it('searches on the server without touching the shared list', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(listResponse)
      const { searchMembers, members } = useMembers()

      const rows = await searchMembers(' 0912 ')

      expect(lastCall()[1].params).toMatchObject({ search: '0912', limit: 5, page: 1 })
      expect(rows).toHaveLength(2)
      expect(members.value).toEqual([])
    })

    it('returns [] without a request for an empty query', async () => {
      const { searchMembers } = useMembers()
      expect(await searchMembers('  ')).toEqual([])
      expect(mockFetchInstance.apiFetch).not.toHaveBeenCalled()
    })

    it('finds only the exact member code, not a partial match', async () => {
      // the backend search is ILIKE %code%, so "M000001" also returns "M0000010"
      mockFetchInstance.apiFetch.mockResolvedValue({ ...listResponse, data: [otherMember, apiMember] })
      const { findMemberByCode } = useMembers()

      expect(await findMemberByCode('m000001')).toEqual(apiMember)
      expect(await findMemberByCode('M0000')).toBeNull()
    })
  })

  describe('getMember', () => {
    it('GET /members/:id', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...apiMember, contracts: [] } })
      const { getMember } = useMembers()

      const result = await getMember(apiMember.id)

      expect(lastCall()).toEqual([`/members/${apiMember.id}`])
      expect(result).toMatchObject({ fullName: '張三', gender: 'MALE', height: 172.5 })
    })

    it('returns null and shows the backend error on 404', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('會員不存在'))
      const { getMember } = useMembers()

      expect(await getMember('missing')).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ customMessage: '會員不存在' }))
    })
  })

  describe('createMember', () => {
    it('POSTs the camelCase body and returns the created member', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiMember })
      const { createMember } = useMembers()
      const input = { fullName: '張三', phone: '0912345678', branchId: apiMember.branchId, gender: 'MALE' as const, height: 172.5 }

      const result = await createMember(input)

      expect(lastCall()).toEqual(['/members', { method: 'POST', body: input }])
      expect(result).toEqual(apiMember)
      expect(mockInvalidateCache).toHaveBeenCalled()
    })

    it('returns null and surfaces the backend reason on a 400', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('無效的分店'))
      const { createMember } = useMembers()

      const result = await createMember({ fullName: '王五', phone: '0900000000', branchId: 'x' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ customMessage: '無效的分店' }))
    })

    it('falls back to the generic message for a bare HTTP status', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 500'))
      const { createMember } = useMembers()

      await createMember({ fullName: '王五', phone: '0900000000', branchId: 'x' })

      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ customMessage: MESSAGES.ERRORS.MEMBER_CREATE_FAILED }))
    })
  })

  describe('updateMember / updateMembersStatus', () => {
    it('PATCHes /members/:id with the given fields', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...apiMember, phone: '0900000000' } })
      const { updateMember } = useMembers()

      const result = await updateMember(apiMember.id, { phone: '0900000000' })

      expect(lastCall()).toEqual([`/members/${apiMember.id}`, { method: 'PATCH', body: { phone: '0900000000' } }])
      expect(result).toMatchObject({ phone: '0900000000' })
    })

    it('sets the status field the backend reads (not member_status) and counts real successes', async () => {
      mockFetchInstance.apiFetch
        .mockResolvedValueOnce({ success: true, data: { ...apiMember, status: 'SUSPENDED' } })
        .mockRejectedValueOnce(new Error('會員不存在'))
      const { updateMembersStatus } = useMembers()

      const result = await updateMembersStatus(['m-1', 'm-2'], 'SUSPENDED')

      expect(mockFetchInstance.apiFetch).toHaveBeenNthCalledWith(1, '/members/m-1', { method: 'PATCH', body: { status: 'SUSPENDED' } })
      expect(mockFetchInstance.apiFetch).toHaveBeenNthCalledWith(2, '/members/m-2', { method: 'PATCH', body: { status: 'SUSPENDED' } })
      expect(result).toEqual({ updated: 1, failed: 1 })
      // the page reports the batch outcome; individual failures are not toasted
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ showToast: false }))
    })
  })

  describe('deleteMember', () => {
    it('DELETE /members/:id (archives) and returns true', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '會員已封存' })
      const { deleteMember } = useMembers()

      expect(await deleteMember(apiMember.id)).toBe(true)
      expect(lastCall()).toEqual([`/members/${apiMember.id}`, { method: 'DELETE' }])
    })

    it('returns false and reports the error on failure', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('會員不存在'))
      const { deleteMember } = useMembers()

      expect(await deleteMember('missing')).toBe(false)
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })
  })

  it('shares state between useMembers() instances', () => {
    const a = useMembers()
    const b = useMembers()

    a.members.value = [apiMember]
    a.totalCount.value = 100

    expect(b.members.value).toEqual([apiMember])
    expect(b.totalCount.value).toBe(100)
  })
})
