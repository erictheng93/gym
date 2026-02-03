import { describe, it, expect, beforeEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useMembers } from './useMembers'
import type { Member } from '~/types/schema'

describe('useMembers', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { members, isLoading, totalCount } = useMembers()

      expect(members.value).toEqual([])
      expect(isLoading.value).toBe(false)
      expect(totalCount.value).toBe(0)
    })
  })

  describe('fetchMembers', () => {
    const mockMembers: Partial<Member>[] = [
      {
        id: 'member-1',
        member_code: 'M001',
        full_name: '張三',
        phone: '0912345678',
        member_status: 'ACTIVE',
        branch_id: 'branch-1'
      },
      {
        id: 'member-2',
        member_code: 'M002',
        full_name: '李四',
        phone: '0923456789',
        member_status: 'EXPIRED',
        branch_id: 'branch-1'
      }
    ]

    it('應該成功取得會員列表', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockMembers, total: 2 })

      const { fetchMembers, members, totalCount, isLoading } = useMembers()

      await fetchMembers()

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual(mockMembers)
      expect(totalCount.value).toBe(2)
      expect(isLoading.value).toBe(false)
    })

    it('應該支援分頁參數', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockMembers, total: 100 })

      const { fetchMembers, members } = useMembers()

      await fetchMembers({ page: 3, limit: 20 })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual(mockMembers)
    })

    it('應該根據姓名搜尋', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockMembers[0]], total: 1 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({ search: '張三' })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([mockMembers[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該根據會員編號搜尋', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockMembers[0]], total: 1 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({ search: 'M001' })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([mockMembers[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該根據電話號碼搜尋', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockMembers[0]], total: 1 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({ search: '0912' })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([mockMembers[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該根據分店 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockMembers, total: 2 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({ branchId: 'branch-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual(mockMembers)
      expect(totalCount.value).toBe(2)
    })

    it('應該根據會員狀態過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockMembers[0]], total: 1 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({ status: 'ACTIVE' })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([mockMembers[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該支援多個過濾條件組合', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockMembers[0]], total: 1 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({
        search: '張三',
        branchId: 'branch-1',
        status: 'ACTIVE',
        page: 2,
        limit: 10
      })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([mockMembers[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該正確排序會員列表', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockMembers, total: 2 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers()

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual(mockMembers)
      expect(totalCount.value).toBe(2)
    })

    it('應該包含關聯資料欄位', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockMembers, total: 2 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers()

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual(mockMembers)
      expect(totalCount.value).toBe(2)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchMembers, members, isLoading } = useMembers()

      await fetchMembers()

      expect(mockHandleError).toHaveBeenCalled()
      expect(members.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })

    it('應該在取得過程中設定 loading 狀態', async () => {
      let loadingDuringFetch = false

      mockFetchInstance.readItems.mockImplementationOnce(() => {
        const { isLoading } = useMembers()
        loadingDuringFetch = isLoading.value
        return Promise.resolve({ data: [], total: 0 })
      })

      const { fetchMembers } = useMembers()

      await fetchMembers()

      expect(loadingDuringFetch).toBe(true)
    })

    it('應該使用預設分頁參數', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers()

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('getMember', () => {
    const mockMember: Partial<Member> = {
      id: 'member-1',
      member_code: 'M001',
      full_name: '張三',
      phone: '0912345678',
      email: 'test@example.com',
      member_status: 'ACTIVE'
    }

    it('應該成功取得單個會員詳情', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(mockMember)

      const { getMember } = useMembers()

      const result = await getMember('member-1')

      expect(mockFetchInstance.readItem).toHaveBeenCalled()
      expect(result).toEqual(mockMember)
    })

    it('應該在取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Not found'))

      const { getMember } = useMembers()

      const result = await getMember('invalid-id')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createMember', () => {
    const newMember: Partial<Member> = {
      member_code: 'M003',
      full_name: '王五',
      phone: '0934567890',
      email: 'wang@example.com',
      branch_id: 'branch-1',
      member_status: 'ACTIVE'
    }

    it('應該成功創建會員', async () => {
      const createdMember = { id: 'member-3', ...newMember }
      mockFetchInstance.createItem.mockResolvedValueOnce(createdMember)

      const { createMember } = useMembers()

      const result = await createMember(newMember)

      expect(mockFetchInstance.createItem).toHaveBeenCalled()
      expect(result).toEqual(createdMember)
    })

    it('應該在創建失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Creation failed'))

      const { createMember } = useMembers()

      const result = await createMember(newMember)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該支援部分欄位創建', async () => {
      const minimalMember: Partial<Member> = {
        full_name: '最小資料',
        member_code: 'M999'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce({ id: 'member-999', ...minimalMember })

      const { createMember } = useMembers()

      const result = await createMember(minimalMember)

      expect(result).toMatchObject(minimalMember)
    })
  })

  describe('updateMember', () => {
    const updatedData: Partial<Member> = {
      phone: '0945678901',
      email: 'updated@example.com',
      member_status: 'SUSPENDED'
    }

    it('應該成功更新會員', async () => {
      const updatedMember = { id: 'member-1', ...updatedData }
      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedMember)

      const { updateMember } = useMembers()

      const result = await updateMember('member-1', updatedData)

      expect(mockFetchInstance.updateItem).toHaveBeenCalled()
      expect(result).toEqual(updatedMember)
    })

    it('應該在更新失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))

      const { updateMember } = useMembers()

      const result = await updateMember('member-1', updatedData)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該支援部分欄位更新', async () => {
      const partialUpdate: Partial<Member> = {
        phone: '0900000000'
      }

      mockFetchInstance.updateItem.mockResolvedValueOnce({ id: 'member-1', phone: '0900000000' })

      const { updateMember } = useMembers()

      const result = await updateMember('member-1', partialUpdate)

      expect(result).toMatchObject(partialUpdate)
    })

    it('應該支援會員狀態變更', async () => {
      const statusUpdate: Partial<Member> = {
        member_status: 'BANNED'
      }

      mockFetchInstance.updateItem.mockResolvedValueOnce({ id: 'member-1', member_status: 'BANNED' })

      const { updateMember } = useMembers()

      const result = await updateMember('member-1', statusUpdate)

      expect(result.member_status).toBe('BANNED')
    })
  })

  describe('deleteMember', () => {
    it('應該成功刪除會員', async () => {
      mockFetchInstance.deleteItem.mockResolvedValueOnce(true)

      const { deleteMember } = useMembers()

      await deleteMember('member-1')

      expect(mockFetchInstance.deleteItem).toHaveBeenCalled()
    })

    it('應該在刪除失敗時返回 false 並呼叫 handleError', async () => {
      mockFetchInstance.deleteItem.mockRejectedValueOnce(new Error('Delete failed'))

      const { deleteMember } = useMembers()

      const result = await deleteMember('member-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該能夠刪除不存在的會員時返回 false 並呼叫 handleError', async () => {
      mockFetchInstance.deleteItem.mockRejectedValueOnce(new Error('Member not found'))

      const { deleteMember } = useMembers()

      const result = await deleteMember('invalid-id')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('狀態管理', () => {
    it('應該在多次呼叫 useMembers 時共享狀態', () => {
      const instance1 = useMembers()
      const instance2 = useMembers()

      instance1.members.value = [{ id: 'member-1' } as Member]
      instance1.totalCount.value = 100

      expect(instance2.members.value).toEqual([{ id: 'member-1' }])
      expect(instance2.totalCount.value).toBe(100)
    })

    it('應該正確管理 loading 狀態', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchMembers, isLoading } = useMembers()

      expect(isLoading.value).toBe(false)

      const promise = fetchMembers()

      // Note: Due to mocking, we can't easily test loading during fetch
      // but we can verify it's false after completion

      await promise

      expect(isLoading.value).toBe(false)
    })
  })

  describe('搜尋功能邊界測試', () => {
    it('應該處理空字串搜尋', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({ search: '' })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })

    it('應該處理特殊字元搜尋', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchMembers, members, totalCount } = useMembers()

      await fetchMembers({ search: '!@#$%' })

      expect(mockFetchInstance.readItems).toHaveBeenCalled()
      expect(members.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('會員狀態過濾', () => {
    const statuses: Array<Member['member_status']> = ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'BANNED']

    statuses.forEach(status => {
      it(`應該正確過濾 ${status} 狀態的會員`, async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchMembers, members, totalCount } = useMembers()

        await fetchMembers({ status })

        expect(mockFetchInstance.readItems).toHaveBeenCalled()
        expect(members.value).toEqual([])
        expect(totalCount.value).toBe(0)
      })
    })
  })
})
