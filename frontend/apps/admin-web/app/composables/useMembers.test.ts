import { describe, it, expect } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useMembers } from './useMembers'
import type { Member } from '~/types/schema'

const mockMembers = [
  { id: 'member-1', member_code: 'M001', full_name: '張三', member_status: 'ACTIVE', branch_id: 'branch-1' },
  { id: 'member-2', member_code: 'M002', full_name: '李四', member_status: 'EXPIRED', branch_id: 'branch-1' }
] as unknown as Member[]

describe('useMembers', () => {
  it('initial state is empty', () => {
    const { members, isLoading, totalCount } = useMembers()

    expect(members.value).toEqual([])
    expect(isLoading.value).toBe(false)
    expect(totalCount.value).toBe(0)
  })

  describe('fetchMembers', () => {
    it('stores data and total from the response', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockMembers, total: 2 })
      const { fetchMembers, members, totalCount, isLoading } = useMembers()

      await fetchMembers()

      expect(members.value).toEqual(mockMembers)
      expect(totalCount.value).toBe(2)
      expect(isLoading.value).toBe(false)
    })

    it('uses default paging and newest-first sorting', async () => {
      const { fetchMembers } = useMembers()

      await fetchMembers()

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('members', expect.objectContaining({
        page: 1,
        limit: 20,
        sort: 'dateCreated',
        sortOrder: 'desc'
      }))
    })

    it('forwards paging, search and filters to readItems', async () => {
      const { fetchMembers } = useMembers()

      await fetchMembers({ search: '張三', branchId: 'branch-9', status: 'ACTIVE', page: 2, limit: 10 })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('members', expect.objectContaining({
        page: 2,
        limit: 10,
        search: '張三',
        filter: { branchId: 'branch-9', status: 'ACTIVE' }
      }))
    })

    it('keeps existing state and reports the error when fetching fails', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))
      const { fetchMembers, members, isLoading } = useMembers()
      members.value = mockMembers

      await fetchMembers({ page: 99 })

      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ context: 'useMembers.fetchMembers' })
      )
      expect(members.value).toEqual(mockMembers)
      expect(isLoading.value).toBe(false)
    })

    it('sets loading while the request is in flight', async () => {
      let loadingDuringFetch = false
      mockFetchInstance.readItems.mockImplementationOnce(() => {
        loadingDuringFetch = useMembers().isLoading.value
        return Promise.resolve({ data: [], total: 0 })
      })
      const { fetchMembers } = useMembers()

      await fetchMembers({ page: 98 })

      expect(loadingDuringFetch).toBe(true)
    })

    it('shares one request between concurrent identical calls', async () => {
      let resolve!: (v: { data: Member[]; total: number }) => void
      mockFetchInstance.readItems.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
      const { fetchMembers } = useMembers()
      const opts = { page: 97 }

      const first = fetchMembers(opts)
      const second = fetchMembers(opts)
      resolve({ data: [], total: 0 })
      await Promise.all([first, second])

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
    })
  })

  describe('getMember', () => {
    it('returns the member', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(mockMembers[0])
      const { getMember } = useMembers()

      const result = await getMember('member-1')

      expect(mockFetchInstance.readItem).toHaveBeenCalledWith('members', 'member-1')
      expect(result).toEqual(mockMembers[0])
    })

    it('returns null and reports the error on failure', async () => {
      mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Not found'))
      const { getMember } = useMembers()

      const result = await getMember('invalid-id')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('createMember', () => {
    it('creates the member and returns the created record', async () => {
      const input = { member_code: 'M003', full_name: '王五' }
      mockFetchInstance.createItem.mockResolvedValueOnce({ id: 'member-3', ...input })
      const { createMember } = useMembers()

      const result = await createMember(input)

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('members', input)
      expect(result).toMatchObject({ id: 'member-3', ...input })
    })

    it('returns null and reports the error on failure', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Creation failed'))
      const { createMember } = useMembers()

      const result = await createMember({ full_name: 'x' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('updateMember', () => {
    it('updates the member by id and returns the updated record', async () => {
      const patch = { phone: '0900000000' }
      mockFetchInstance.updateItem.mockResolvedValueOnce({ id: 'member-1', ...patch })
      const { updateMember } = useMembers()

      const result = await updateMember('member-1', patch)

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('members', 'member-1', patch)
      expect(result).toMatchObject({ id: 'member-1', phone: '0900000000' })
    })

    it('returns null and reports the error on failure', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))
      const { updateMember } = useMembers()

      const result = await updateMember('member-1', { phone: '1' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('deleteMember', () => {
    it('returns true when deleted', async () => {
      mockFetchInstance.deleteItem.mockResolvedValueOnce(true)
      const { deleteMember } = useMembers()

      const result = await deleteMember('member-1')

      expect(mockFetchInstance.deleteItem).toHaveBeenCalledWith('members', 'member-1')
      expect(result).toBe(true)
    })

    it('returns false and reports the error on failure', async () => {
      mockFetchInstance.deleteItem.mockRejectedValueOnce(new Error('Delete failed'))
      const { deleteMember } = useMembers()

      const result = await deleteMember('member-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })
  })

  it('shares state between useMembers() instances', () => {
    const a = useMembers()
    const b = useMembers()

    a.members.value = [{ id: 'member-1' } as Member]
    a.totalCount.value = 100

    expect(b.members.value).toEqual([{ id: 'member-1' }])
    expect(b.totalCount.value).toBe(100)
  })
})
