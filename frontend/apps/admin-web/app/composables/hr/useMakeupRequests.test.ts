// -nocheck
/**
 * useMakeupRequests.test.ts
 * Tests for the makeup request management composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockFetchInstance } from '@test/setup'
import { useMakeupRequests } from './useMakeupRequests'
import type { MakeupRequest, MakeupApprovalLog, Attendance, Employee } from '~/types/schema'

describe('useMakeupRequests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('fetchMakeupRequests - 查詢補打卡申請', () => {
    it('應該成功取得補打卡申請列表', async () => {
      const mockRequests: Partial<MakeupRequest>[] = [
        {
          id: 'mr-1',
          employee_id: 'emp-1',
          target_date: '2025-01-10',
          makeup_type: 'CHECK_IN',
          request_status: 'PENDING'
        },
        {
          id: 'mr-2',
          employee_id: 'emp-1',
          target_date: '2025-01-12',
          makeup_type: 'CHECK_OUT',
          request_status: 'APPROVED'
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockRequests,
        total: 2
      })

      const { fetchMakeupRequests, makeupRequests, makeupTotalCount, isMakeupLoading } = useMakeupRequests()

      await fetchMakeupRequests()

      expect(makeupRequests.value).toEqual(mockRequests)
      expect(makeupTotalCount.value).toBe(2)
      expect(isMakeupLoading.value).toBe(false)
    })

    it('應該支援員工 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchMakeupRequests } = useMakeupRequests()

      await fetchMakeupRequests({ employeeId: 'emp-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'makeup_requests',
        expect.objectContaining({
          filter: expect.objectContaining({
            employee_id: 'emp-1'
          })
        })
      )
    })

    it('應該支援狀態過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchMakeupRequests } = useMakeupRequests()

      await fetchMakeupRequests({ status: 'PENDING' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'makeup_requests',
        expect.objectContaining({
          filter: expect.objectContaining({
            request_status: 'PENDING'
          })
        })
      )
    })

    it('應該支援分頁', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchMakeupRequests } = useMakeupRequests()

      await fetchMakeupRequests({ page: 2, limit: 10 })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'makeup_requests',
        expect.objectContaining({
          page: 2,
          limit: 10
        })
      )
    })

    it('應該處理取得失敗的情況', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchMakeupRequests, isMakeupLoading } = useMakeupRequests()

      await fetchMakeupRequests()

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch makeup requests:', expect.any(Error))
      expect(isMakeupLoading.value).toBe(false)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchPendingMakeupApprovals - 取得待審核申請', () => {
    it('應該取得下屬的待審核補打卡申請', async () => {
      const subordinates: Partial<Employee>[] = [
        { id: 'emp-2' },
        { id: 'emp-3' }
      ]

      const pendingRequests: Partial<MakeupRequest>[] = [
        { id: 'mr-1', employee_id: 'emp-2', request_status: 'PENDING' },
        { id: 'mr-2', employee_id: 'emp-4', request_status: 'PENDING' } // 非下屬
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: subordinates, total: 2 })
        .mockResolvedValueOnce({ data: pendingRequests, total: 2 })

      const { fetchPendingMakeupApprovals, pendingMakeupApprovals } = useMakeupRequests()

      await fetchPendingMakeupApprovals('supervisor-1')

      expect(pendingMakeupApprovals.value).toHaveLength(1)
      expect(pendingMakeupApprovals.value[0].id).toBe('mr-1')
    })

    it('應該在沒有下屬時返回空陣列', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchPendingMakeupApprovals, pendingMakeupApprovals } = useMakeupRequests()

      await fetchPendingMakeupApprovals('supervisor-1')

      expect(pendingMakeupApprovals.value).toEqual([])
      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1) // 只呼叫一次（取下屬）
    })

    it('應該處理取得失敗的情況', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchPendingMakeupApprovals } = useMakeupRequests()

      await fetchPendingMakeupApprovals('supervisor-1')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch pending makeup approvals:', expect.any(Error))

      consoleErrorSpy.mockRestore()
    })
  })

  describe('applyMakeup - 申請補打卡', () => {
    it('應該成功申請 CHECK_IN 類型補打卡', async () => {
      const createdRequest: Partial<MakeupRequest> = {
        id: 'mr-new',
        employee_id: 'emp-1',
        target_date: '2025-01-10',
        makeup_type: 'CHECK_IN',
        request_status: 'PENDING'
      }

      mockFetchInstance.createItem
        .mockResolvedValueOnce(createdRequest)
        .mockResolvedValueOnce({}) // approval log

      const { applyMakeup } = useMakeupRequests()

      const result = await applyMakeup({
        employeeId: 'emp-1',
        branchId: 'branch-1',
        targetDate: '2025-01-10',
        makeupType: 'CHECK_IN',
        requestedCheckIn: '09:00:00',
        reason: '忘記打卡'
      })

      expect(result).toEqual(createdRequest)
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'makeup_requests',
        expect.objectContaining({
          employee_id: 'emp-1',
          branch_id: 'branch-1',
          target_date: '2025-01-10',
          makeup_type: 'CHECK_IN',
          requested_check_in: '09:00:00',
          request_status: 'PENDING'
        })
      )
    })

    it('應該成功申請 CHECK_OUT 類型補打卡', async () => {
      const createdRequest: Partial<MakeupRequest> = {
        id: 'mr-new',
        makeup_type: 'CHECK_OUT'
      }

      mockFetchInstance.createItem
        .mockResolvedValueOnce(createdRequest)
        .mockResolvedValueOnce({})

      const { applyMakeup } = useMakeupRequests()

      await applyMakeup({
        employeeId: 'emp-1',
        branchId: 'branch-1',
        targetDate: '2025-01-10',
        makeupType: 'CHECK_OUT',
        requestedCheckOut: '18:00:00',
        reason: '忘記打卡'
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'makeup_requests',
        expect.objectContaining({
          makeup_type: 'CHECK_OUT',
          requested_check_out: '18:00:00'
        })
      )
    })

    it('應該成功申請 BOTH 類型補打卡', async () => {
      const createdRequest: Partial<MakeupRequest> = {
        id: 'mr-new',
        makeup_type: 'BOTH'
      }

      mockFetchInstance.createItem
        .mockResolvedValueOnce(createdRequest)
        .mockResolvedValueOnce({})

      const { applyMakeup } = useMakeupRequests()

      await applyMakeup({
        employeeId: 'emp-1',
        branchId: 'branch-1',
        targetDate: '2025-01-10',
        makeupType: 'BOTH',
        requestedCheckIn: '09:00:00',
        requestedCheckOut: '18:00:00',
        reason: '系統故障'
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'makeup_requests',
        expect.objectContaining({
          makeup_type: 'BOTH',
          requested_check_in: '09:00:00',
          requested_check_out: '18:00:00'
        })
      )
    })

    it('應該建立審核歷程記錄', async () => {
      const createdRequest: Partial<MakeupRequest> = {
        id: 'mr-new'
      }

      mockFetchInstance.createItem
        .mockResolvedValueOnce(createdRequest)
        .mockResolvedValueOnce({})

      const { applyMakeup } = useMakeupRequests()

      await applyMakeup({
        employeeId: 'emp-1',
        branchId: 'branch-1',
        targetDate: '2025-01-10',
        makeupType: 'CHECK_IN',
        reason: '忘記打卡'
      })

      expect(mockFetchInstance.createItem).toHaveBeenNthCalledWith(
        2,
        'makeup_approval_logs',
        expect.objectContaining({
          makeup_request_id: 'mr-new',
          action: 'SUBMIT',
          previous_status: null,
          new_status: 'PENDING'
        })
      )
    })

    it('應該在建立失敗時拋出錯誤', async () => {
      mockFetchInstance.createItem.mockResolvedValueOnce(null)

      const { applyMakeup } = useMakeupRequests()

      await expect(applyMakeup({
        employeeId: 'emp-1',
        branchId: 'branch-1',
        targetDate: '2025-01-10',
        makeupType: 'CHECK_IN',
        reason: '忘記打卡'
      })).rejects.toThrow('Failed to create makeup request')
    })
  })

  describe('reviewMakeup - 審核補打卡', () => {
    it('應該成功核准補打卡', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        employee_id: 'emp-1',
        branch_id: 'branch-1',
        target_date: '2025-01-10',
        makeup_type: 'CHECK_IN',
        requested_check_in: '09:00:00',
        request_status: 'PENDING'
      }

      const approvedRequest: Partial<MakeupRequest> = {
        ...makeupRequest,
        request_status: 'APPROVED'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)
      mockFetchInstance.updateItem.mockResolvedValueOnce(approvedRequest)
      mockFetchInstance.createItem.mockResolvedValueOnce({}) // approval log
      // applyMakeupToAttendance mocks
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })
      mockFetchInstance.createItem.mockResolvedValueOnce({})

      const { reviewMakeup } = useMakeupRequests()

      const result = await reviewMakeup('mr-1', 'approver-1', 'APPROVE', '同意補打卡')

      expect(result).toEqual(approvedRequest)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'makeup_requests',
        'mr-1',
        expect.objectContaining({
          request_status: 'APPROVED',
          approver_id: 'approver-1'
        })
      )
    })

    it('應該成功駁回補打卡', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        request_status: 'PENDING'
      }

      const rejectedRequest: Partial<MakeupRequest> = {
        ...makeupRequest,
        request_status: 'REJECTED'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)
      mockFetchInstance.updateItem.mockResolvedValueOnce(rejectedRequest)
      mockFetchInstance.createItem.mockResolvedValueOnce({})

      const { reviewMakeup } = useMakeupRequests()

      const result = await reviewMakeup('mr-1', 'approver-1', 'REJECT', '資料不足')

      expect(result).toEqual(rejectedRequest)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'makeup_requests',
        'mr-1',
        expect.objectContaining({
          request_status: 'REJECTED'
        })
      )
    })

    it('應該在核准時更新現有考勤紀錄', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        employee_id: 'emp-1',
        branch_id: 'branch-1',
        target_date: '2025-01-10',
        makeup_type: 'CHECK_IN',
        requested_check_in: '09:00:00',
        request_status: 'PENDING',
        reason: '忘記打卡'
      }

      const existingAttendance: Partial<Attendance> = {
        id: 'att-1',
        employee_id: 'emp-1',
        attendance_date: '2025-01-10'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)
      mockFetchInstance.updateItem.mockResolvedValueOnce({ request_status: 'APPROVED' })
      mockFetchInstance.createItem.mockResolvedValueOnce({})
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [existingAttendance], total: 1 })
      mockFetchInstance.updateItem.mockResolvedValueOnce({})

      const { reviewMakeup } = useMakeupRequests()

      await reviewMakeup('mr-1', 'approver-1', 'APPROVE')

      expect(mockFetchInstance.updateItem).toHaveBeenNthCalledWith(
        2,
        'attendances',
        'att-1',
        expect.objectContaining({
          check_in: '2025-01-10T09:00:00',
          check_type: 'MAKEUP'
        })
      )
    })

    it('應該在核准時建立新考勤紀錄（如不存在）', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        employee_id: 'emp-1',
        branch_id: 'branch-1',
        target_date: '2025-01-10',
        makeup_type: 'CHECK_OUT',
        requested_check_out: '18:00:00',
        request_status: 'PENDING',
        reason: '忘記打卡'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)
      mockFetchInstance.updateItem.mockResolvedValueOnce({ request_status: 'APPROVED' })
      mockFetchInstance.createItem.mockResolvedValueOnce({})
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })
      mockFetchInstance.createItem.mockResolvedValueOnce({})

      const { reviewMakeup } = useMakeupRequests()

      await reviewMakeup('mr-1', 'approver-1', 'APPROVE')

      expect(mockFetchInstance.createItem).toHaveBeenNthCalledWith(
        2,
        'attendances',
        expect.objectContaining({
          employee_id: 'emp-1',
          branch_id: 'branch-1',
          attendance_date: '2025-01-10',
          check_out: '2025-01-10T18:00:00',
          check_type: 'MAKEUP'
        })
      )
    })

    it('應該在找不到申請時拋出錯誤', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(null)

      const { reviewMakeup } = useMakeupRequests()

      await expect(reviewMakeup('non-existent', 'approver-1', 'APPROVE'))
        .rejects.toThrow('Makeup request not found')
    })

    it('應該建立審核歷程記錄', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        request_status: 'PENDING'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)
      mockFetchInstance.updateItem.mockResolvedValueOnce({ request_status: 'REJECTED' })
      mockFetchInstance.createItem.mockResolvedValueOnce({})

      const { reviewMakeup } = useMakeupRequests()

      await reviewMakeup('mr-1', 'approver-1', 'REJECT', '駁回原因')

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'makeup_approval_logs',
        expect.objectContaining({
          makeup_request_id: 'mr-1',
          action_by: 'approver-1',
          action: 'REJECT',
          previous_status: 'PENDING',
          new_status: 'REJECTED',
          notes: '駁回原因'
        })
      )
    })
  })

  describe('cancelMakeup - 取消補打卡', () => {
    it('應該成功取消待審核的申請', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        request_status: 'PENDING'
      }

      const cancelledRequest: Partial<MakeupRequest> = {
        ...makeupRequest,
        request_status: 'CANCELLED'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)
      mockFetchInstance.updateItem.mockResolvedValueOnce(cancelledRequest)
      mockFetchInstance.createItem.mockResolvedValueOnce({})

      const { cancelMakeup } = useMakeupRequests()

      const result = await cancelMakeup('mr-1', 'emp-1')

      expect(result).toEqual(cancelledRequest)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'makeup_requests',
        'mr-1',
        { request_status: 'CANCELLED' }
      )
    })

    it('應該拒絕取消已核准的申請', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        request_status: 'APPROVED'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)

      const { cancelMakeup } = useMakeupRequests()

      await expect(cancelMakeup('mr-1', 'emp-1'))
        .rejects.toThrow('只能取消待審核的申請')
    })

    it('應該拒絕取消已駁回的申請', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        request_status: 'REJECTED'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)

      const { cancelMakeup } = useMakeupRequests()

      await expect(cancelMakeup('mr-1', 'emp-1'))
        .rejects.toThrow('只能取消待審核的申請')
    })

    it('應該拒絕取消已取消的申請', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        request_status: 'CANCELLED'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)

      const { cancelMakeup } = useMakeupRequests()

      await expect(cancelMakeup('mr-1', 'emp-1'))
        .rejects.toThrow('只能取消待審核的申請')
    })

    it('應該在找不到申請時拋出錯誤', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(null)

      const { cancelMakeup } = useMakeupRequests()

      await expect(cancelMakeup('non-existent', 'emp-1'))
        .rejects.toThrow('Makeup request not found')
    })

    it('應該建立取消記錄到審核歷程', async () => {
      const makeupRequest: Partial<MakeupRequest> = {
        id: 'mr-1',
        request_status: 'PENDING'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(makeupRequest)
      mockFetchInstance.updateItem.mockResolvedValueOnce({ request_status: 'CANCELLED' })
      mockFetchInstance.createItem.mockResolvedValueOnce({})

      const { cancelMakeup } = useMakeupRequests()

      await cancelMakeup('mr-1', 'emp-1')

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'makeup_approval_logs',
        expect.objectContaining({
          makeup_request_id: 'mr-1',
          action_by: 'emp-1',
          action: 'CANCEL',
          previous_status: 'PENDING',
          new_status: 'CANCELLED',
          notes: '取消申請'
        })
      )
    })
  })

  describe('fetchMakeupApprovalHistory - 取得審核歷程', () => {
    it('應該成功取得審核歷程', async () => {
      const mockHistory: Partial<MakeupApprovalLog>[] = [
        {
          id: 'log-1',
          makeup_request_id: 'mr-1',
          action: 'SUBMIT',
          previous_status: null,
          new_status: 'PENDING'
        },
        {
          id: 'log-2',
          makeup_request_id: 'mr-1',
          action: 'APPROVE',
          previous_status: 'PENDING',
          new_status: 'APPROVED'
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockHistory,
        total: 2
      })

      const { fetchMakeupApprovalHistory } = useMakeupRequests()

      const result = await fetchMakeupApprovalHistory('mr-1')

      expect(result).toEqual(mockHistory)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'makeup_approval_logs',
        expect.objectContaining({
          filter: { makeup_request_id: 'mr-1' }
        })
      )
    })

    it('應該在沒有歷程時返回空陣列', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchMakeupApprovalHistory } = useMakeupRequests()

      const result = await fetchMakeupApprovalHistory('mr-1')

      expect(result).toEqual([])
    })
  })
})
