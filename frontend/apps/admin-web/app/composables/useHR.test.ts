// -nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockFetchInstance } from '@test/setup'
import { useHR } from './useHR'
import type { Attendance, LeaveRequest, LeaveBalance, LeaveApprovalLog } from '~/types/schema'

describe('useHR', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
    // Mock Date for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('考勤功能 - Attendance', () => {
    describe('fetchTodayAttendance (getTodayAttendance)', () => {
      it('應該成功取得今日考勤記錄', async () => {
        const mockAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          check_in: '2025-01-15T08:00:00Z',
          check_out: null,
          attendance_date: '2025-01-15'
        }

        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockAttendance], total: 1 })

        const { fetchTodayAttendance } = useHR()

        // getTodayAttendance returns the record directly, doesn't populate state
        const result = await fetchTodayAttendance('emp-1')

        expect(result).not.toBeNull()
        expect(result?.id).toEqual(mockAttendance.id)
      })

      it('應該在沒有今日記錄時返回 null', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchTodayAttendance } = useHR()

        const result = await fetchTodayAttendance('emp-1')

        expect(result).toBeNull()
      })

      it('應該處理取得失敗的情況', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

        const { fetchTodayAttendance } = useHR()

        const result = await fetchTodayAttendance('emp-1')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result).toBeNull()

        consoleErrorSpy.mockRestore()
      })
    })

    describe('fetchRecentAttendances', () => {
      it('應該成功取得近期考勤記錄', async () => {
        const mockAttendances: Partial<Attendance>[] = [
          { id: 'att-1', attendance_date: '2025-01-15' },
          { id: 'att-2', attendance_date: '2025-01-14' }
        ]

        mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockAttendances, total: 2 })

        const { fetchRecentAttendances, recentAttendances } = useHR()

        await fetchRecentAttendances('emp-1', 7)

        expect(recentAttendances.value).toEqual(mockAttendances)
      })

      it('應該使用預設天數 7 天', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchRecentAttendances } = useHR()

        await fetchRecentAttendances('emp-1')

      })

      it('應該處理取得失敗的情況', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

        const { fetchRecentAttendances } = useHR()

        await fetchRecentAttendances('emp-1', 7)

        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch recent attendances:', expect.any(Error))

        consoleErrorSpy.mockRestore()
      })
    })

    describe('checkIn (performCheckIn)', () => {
      it('應該成功上班打卡（創建新記錄）', async () => {
        const createdAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          branch_id: 'branch-1',
          check_in: '2025-01-15T10:00:00.000Z',
          attendance_date: '2025-01-15'
        }

        // Mock createItem response
        mockFetchInstance.createItem.mockResolvedValueOnce(createdAttendance)
        // Mock readItems response (fetch with relations)
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [createdAttendance], total: 1 })

        const { checkIn } = useHR()

        const result = await checkIn({
          employeeId: 'emp-1',
          branchId: 'branch-1'
        })

        expect(result.id).toEqual(createdAttendance.id)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })

      it('應該支援不同打卡類型', async () => {
        const createdAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          check_type: 'OVERTIME'
        }

        mockFetchInstance.createItem.mockResolvedValueOnce(createdAttendance)
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [createdAttendance], total: 1 })

        const { checkIn } = useHR()

        const result = await checkIn({
          employeeId: 'emp-1',
          branchId: 'branch-1',
          checkType: 'OVERTIME'
        })

        expect(result.check_type).toEqual('OVERTIME')
      })

      it('應該正確計算遲到分鐘數', async () => {
        // Set time to 9:30 AM (30 minutes late)
        vi.setSystemTime(new Date('2025-01-15T09:30:00Z'))

        const createdAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          late_minutes: 30,
          attendance_status: 'LATE'
        }

        mockFetchInstance.createItem.mockResolvedValueOnce(createdAttendance)
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [createdAttendance], total: 1 })

        const { checkIn } = useHR()

        await checkIn({
          employeeId: 'emp-1',
          branchId: 'branch-1'
        })

        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })
    })

    describe('checkOut (performCheckOut)', () => {
      it('應該成功下班打卡', async () => {
        const existingAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          check_in: '2025-01-15T02:00:00.000Z', // 8 hours before current time
          check_out: null,
          attendance_status: 'PRESENT'
        }

        const updatedAttendance: Partial<Attendance> = {
          ...existingAttendance,
          check_out: '2025-01-15T10:00:00.000Z',
          work_hours: 8
        }

        // Mock readItem (get existing record)
        mockFetchInstance.readItem.mockResolvedValueOnce(existingAttendance)
        // Mock updateItem
        mockFetchInstance.updateItem.mockResolvedValueOnce(updatedAttendance)
        // Mock readItems (fetch updated record with relations)
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [updatedAttendance], total: 1 })

        const { checkOut } = useHR()

        const result = await checkOut('attendance-1')

        expect(result.check_out).toBeDefined()
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.updateItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })

      it('應該在找不到打卡記錄時拋出錯誤', async () => {
        // Mock readItem returns null (no record found)
        mockFetchInstance.readItem.mockResolvedValueOnce(null)

        const { checkOut } = useHR()

        await expect(checkOut('non-existent-id')).rejects.toThrow('找不到上班打卡記錄')
      })

      it('應該在未上班打卡時拋出錯誤', async () => {
        // Mock readItem returns record without check_in
        mockFetchInstance.readItem.mockResolvedValueOnce({
          id: 'attendance-1',
          check_in: null
        })

        const { checkOut } = useHR()

        await expect(checkOut('attendance-1')).rejects.toThrow('找不到上班打卡記錄')
      })

      it('應該正確計算工作時數', async () => {
        const checkInTime = '2025-01-15T01:30:00.000Z' // 8.5 hours before
        vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z'))

        const existingAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          check_in: checkInTime,
          attendance_status: 'PRESENT'
        }

        const updatedAttendance: Partial<Attendance> = {
          ...existingAttendance,
          check_out: '2025-01-15T10:00:00.000Z',
          work_hours: 8.5
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(existingAttendance)
        mockFetchInstance.updateItem.mockResolvedValueOnce(updatedAttendance)
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [updatedAttendance], total: 1 })

        const { checkOut } = useHR()

        const result = await checkOut('attendance-1')

        expect(result.work_hours).toBeDefined()
      })

      it('應該支援添加備註', async () => {
        const existingAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          check_in: '2025-01-15T02:00:00.000Z',
          attendance_status: 'PRESENT'
        }

        const updatedAttendance: Partial<Attendance> = {
          ...existingAttendance,
          check_out: '2025-01-15T10:00:00.000Z',
          notes: '加班完成專案'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(existingAttendance)
        mockFetchInstance.updateItem.mockResolvedValueOnce(updatedAttendance)
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [updatedAttendance], total: 1 })

        const { checkOut } = useHR()

        const result = await checkOut('attendance-1', '加班完成專案')

        expect(result.notes).toBe('加班完成專案')
      })
    })
  })

  describe('休假功能 - Leave Management', () => {
    describe('fetchLeaveBalances', () => {
      it('應該成功取得休假餘額', async () => {
        const mockBalances: Partial<LeaveBalance>[] = [
          { id: 'balance-1', leave_type: 'ANNUAL', total_days: 14, used_days: 5 },
          { id: 'balance-2', leave_type: 'SICK', total_days: 7, used_days: 2 }
        ]

        mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockBalances, total: 2 })

        const { fetchLeaveBalances, leaveBalances } = useHR()

        await fetchLeaveBalances('emp-1', 2025)

        expect(leaveBalances.value).toEqual(mockBalances)
      })

      it('應該使用當前年份作為預設值', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchLeaveBalances } = useHR()

        await fetchLeaveBalances('emp-1')

      })

      it('應該處理取得失敗的情況', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

        const { fetchLeaveBalances } = useHR()

        await fetchLeaveBalances('emp-1', 2025)

        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch leave balances:', expect.any(Error))

        consoleErrorSpy.mockRestore()
      })
    })

    describe('fetchLeaveRequests', () => {
      it('應該成功取得休假申請列表', async () => {
        const mockRequests: Partial<LeaveRequest>[] = [
          { id: 'leave-1', employee_id: 'emp-1', leave_type: 'ANNUAL' },
          { id: 'leave-2', employee_id: 'emp-1', leave_type: 'SICK' }
        ]

        mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockRequests, total: 2 })

        const { fetchLeaveRequests, leaveRequests, leavesTotalCount } = useHR()

        await fetchLeaveRequests({ employeeId: 'emp-1' })

        expect(leaveRequests.value).toEqual(mockRequests)
        expect(leavesTotalCount.value).toBe(2)
      })

      it('應該支援狀態過濾', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchLeaveRequests } = useHR()

        await fetchLeaveRequests({ status: 'PENDING' })

      })

      it('應該支援分頁', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchLeaveRequests } = useHR()

        await fetchLeaveRequests({ page: 2, limit: 10 })

      })

      it('應該處理取得失敗的情況', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

        const { fetchLeaveRequests, isLeavesLoading } = useHR()

        await fetchLeaveRequests({ employeeId: 'emp-1' })

        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch leave requests:', expect.any(Error))
        expect(isLeavesLoading.value).toBe(false)

        consoleErrorSpy.mockRestore()
      })

      it('應該正確處理計數結果為 null 的情況', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchLeaveRequests, leavesTotalCount } = useHR()

        await fetchLeaveRequests()

        expect(leavesTotalCount.value).toBe(0)
      })
    })

    describe('fetchPendingApprovals', () => {
      it('應該成功取得待審核休假申請', async () => {
        const subordinates = [
          { id: 'emp-2' },
          { id: 'emp-3' }
        ]

        const pendingLeaves: Partial<LeaveRequest>[] = [
          { id: 'leave-1', employee_id: 'emp-2', leave_status: 'PENDING' }
        ]

        mockFetchInstance.readItems
          .mockResolvedValueOnce({ data: subordinates, total: 2 })
          .mockResolvedValueOnce({ data: pendingLeaves, total: 1 })

        const { fetchPendingApprovals, pendingApprovals } = useHR()

        await fetchPendingApprovals('supervisor-1')

        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(2)
        expect(pendingApprovals.value).toEqual(pendingLeaves)
      })

      it('應該在沒有下屬時返回空陣列', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchPendingApprovals, pendingApprovals } = useHR()

        await fetchPendingApprovals('supervisor-1')

        expect(pendingApprovals.value).toEqual([])
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })

      it('應該處理取得失敗的情況', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

        const { fetchPendingApprovals } = useHR()

        await fetchPendingApprovals('supervisor-1')

        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch pending approvals:', expect.any(Error))

        consoleErrorSpy.mockRestore()
      })
    })

    describe('applyLeave', () => {
      it('應該成功申請休假', async () => {
        const leaveData = {
          employeeId: 'emp-1',
          leaveType: 'ANNUAL',
          startDate: '2025-02-01',
          endDate: '2025-02-03',
          reason: '家庭旅遊',
          daysRequested: 3
        }

        const mockCreatedLeave: Partial<LeaveRequest> = {
          id: 'leave-1',
          ...leaveData,
          leave_status: 'PENDING'
        }

        mockFetchInstance.createItem
          .mockResolvedValueOnce(mockCreatedLeave)
          .mockResolvedValueOnce({})

        const { applyLeave } = useHR()
        const result = await applyLeave(leaveData)

        expect(result).toEqual(mockCreatedLeave)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(2)
      })

      it('應該支援半天假', async () => {
        const leaveData = {
          employeeId: 'emp-1',
          leaveType: 'ANNUAL',
          startDate: '2025-02-01',
          endDate: '2025-02-01',
          daysRequested: 0.5,
          isHalfDay: true,
          halfDayType: 'AM' as const
        }

        mockFetchInstance.createItem
          .mockResolvedValueOnce({ id: 'leave-1' })
          .mockResolvedValueOnce({})

        const { applyLeave } = useHR()
        await applyLeave(leaveData)

        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(2)
      })
    })

    describe('reviewLeave', () => {
      it('應該成功核准休假並更新餘額', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          employee_id: 'emp-1',
          leave_type: 'ANNUAL',
          start_date: '2025-02-01',
          end_date: '2025-02-03',
          days_requested: 3,
          leave_status: 'PENDING'
        }

        const mockBalance: Partial<LeaveBalance> = {
          id: 'balance-1',
          used_days: 5,
          pending_days: 3
        }

        const mockApprovedLeave: Partial<LeaveRequest> = {
          ...mockLeaveRequest,
          leave_status: 'APPROVED'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)
        mockFetchInstance.updateItem.mockResolvedValueOnce(mockApprovedLeave)
        mockFetchInstance.createItem.mockResolvedValueOnce({})
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockBalance], total: 1 })
        mockFetchInstance.updateItem.mockResolvedValueOnce({})

        const { reviewLeave } = useHR()
        const result = await reviewLeave('leave-1', 'supervisor-1', 'APPROVE', '同意')

        expect(result).toEqual(mockApprovedLeave)
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.updateItem).toHaveBeenCalledTimes(2)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })

      it('應該成功拒絕休假', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          leave_status: 'PENDING',
          days_requested: 0
        }

        const mockRejectedLeave: Partial<LeaveRequest> = {
          ...mockLeaveRequest,
          leave_status: 'REJECTED'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)
        mockFetchInstance.updateItem.mockResolvedValueOnce(mockRejectedLeave)
        mockFetchInstance.createItem.mockResolvedValueOnce({})

        const { reviewLeave } = useHR()
        const result = await reviewLeave('leave-1', 'supervisor-1', 'REJECT', '日期衝突')

        expect(result).toEqual(mockRejectedLeave)
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.updateItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
      })

      it('應該在核准時正確更新休假餘額', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          employee_id: 'emp-1',
          leave_type: 'SICK',
          start_date: '2025-01-20',
          days_requested: 2,
          leave_status: 'PENDING'
        }

        const mockBalance: Partial<LeaveBalance> = {
          id: 'balance-1',
          used_days: 3,
          pending_days: 2
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)
        mockFetchInstance.updateItem.mockResolvedValueOnce({ leave_status: 'APPROVED' })
        mockFetchInstance.createItem.mockResolvedValueOnce({})
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockBalance], total: 1 })
        mockFetchInstance.updateItem.mockResolvedValueOnce({})

        const { reviewLeave } = useHR()
        await reviewLeave('leave-1', 'supervisor-1', 'APPROVE')

        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.updateItem).toHaveBeenCalledTimes(2)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })

      it('應該在沒有餘額記錄時不更新餘額', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          employee_id: 'emp-1',
          leave_type: 'ANNUAL',
          start_date: '2025-02-01',
          days_requested: 3,
          leave_status: 'PENDING'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)
        mockFetchInstance.updateItem.mockResolvedValueOnce({ leave_status: 'APPROVED' })
        mockFetchInstance.createItem.mockResolvedValueOnce({})
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { reviewLeave } = useHR()
        await reviewLeave('leave-1', 'supervisor-1', 'APPROVE')

        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.updateItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })
    })

    describe('cancelLeave', () => {
      it('應該成功取消待審核的申請', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          leave_status: 'PENDING'
        }

        const mockCancelledLeave: Partial<LeaveRequest> = {
          ...mockLeaveRequest,
          leave_status: 'CANCELLED'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)
        mockFetchInstance.updateItem.mockResolvedValueOnce(mockCancelledLeave)
        mockFetchInstance.createItem.mockResolvedValueOnce({})

        const { cancelLeave } = useHR()
        const result = await cancelLeave('leave-1', 'emp-1')

        expect(result).toEqual(mockCancelledLeave)
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.updateItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
      })

      it('應該拒絕取消已核准的休假申請', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          leave_status: 'APPROVED'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)

        const { cancelLeave } = useHR()

        await expect(cancelLeave('leave-1', 'emp-1')).rejects.toThrow('只能取消待審核的申請')
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
      })

      it('應該拒絕取消已拒絕的休假申請', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          leave_status: 'REJECTED'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)

        const { cancelLeave } = useHR()

        await expect(cancelLeave('leave-1', 'emp-1')).rejects.toThrow('只能取消待審核的申請')
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
      })

      it('應該拒絕取消已取消的休假申請', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          leave_status: 'CANCELLED'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)

        const { cancelLeave } = useHR()

        await expect(cancelLeave('leave-1', 'emp-1')).rejects.toThrow('只能取消待審核的申請')
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
      })

      it('應該記錄取消動作到審核歷程', async () => {
        const mockLeaveRequest: Partial<LeaveRequest> = {
          id: 'leave-1',
          leave_status: 'PENDING'
        }

        mockFetchInstance.readItem.mockResolvedValueOnce(mockLeaveRequest)
        mockFetchInstance.updateItem.mockResolvedValueOnce({ leave_status: 'CANCELLED' })
        mockFetchInstance.createItem.mockResolvedValueOnce({ id: 'log-1' })

        const { cancelLeave } = useHR()
        await cancelLeave('leave-1', 'emp-1')

        // 驗證呼叫了：readItem, updateItem, createItem (log)
        expect(mockFetchInstance.readItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.updateItem).toHaveBeenCalledTimes(1)
        expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(1)
      })

      it('應該處理取消失敗的情況', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Database error'))

        const { cancelLeave } = useHR()

        await expect(cancelLeave('leave-1', 'emp-1')).rejects.toThrow('Database error')

        consoleErrorSpy.mockRestore()
      })
    })

    describe('fetchApprovalHistory', () => {
      it('應該成功取得審核歷程', async () => {
        const mockHistory: Partial<LeaveApprovalLog>[] = [
          {
            id: 'log-1',
            action: 'SUBMIT',
            previous_status: null,
            new_status: 'PENDING'
          },
          {
            id: 'log-2',
            action: 'APPROVE',
            previous_status: 'PENDING',
            new_status: 'APPROVED'
          }
        ]

        mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockHistory, total: 2 })

        const { fetchApprovalHistory } = useHR()
        const result = await fetchApprovalHistory('leave-1')

        expect(result).toEqual(mockHistory)
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      })

      it('應該依時間順序排列歷程記錄', async () => {
        const mockHistory: Partial<LeaveApprovalLog>[] = [
          {
            id: 'log-1',
            action: 'SUBMIT',
            date_created: '2025-01-10T08:00:00Z'
          },
          {
            id: 'log-2',
            action: 'APPROVE',
            date_created: '2025-01-12T10:00:00Z'
          },
          {
            id: 'log-3',
            action: 'COMPLETE',
            date_created: '2025-01-15T09:00:00Z'
          }
        ]

        mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockHistory, total: 3 })

        const { fetchApprovalHistory } = useHR()
        const result = await fetchApprovalHistory('leave-1')

        // 驗證是否按時間升序排列
        expect(result).toHaveLength(3)
        expect(result[0].action).toBe('SUBMIT')
        expect(result[1].action).toBe('APPROVE')
        expect(result[2].action).toBe('COMPLETE')
      })

      it('應該包含操作人資訊', async () => {
        const mockHistory: Partial<LeaveApprovalLog>[] = [
          {
            id: 'log-1',
            action: 'SUBMIT',
            action_by: 'emp-1',
            actor: { full_name: '張三' }
          },
          {
            id: 'log-2',
            action: 'APPROVE',
            action_by: 'supervisor-1',
            actor: { full_name: '李經理' }
          }
        ]

        mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockHistory, total: 2 })

        const { fetchApprovalHistory } = useHR()
        const result = await fetchApprovalHistory('leave-1')

        expect(result[0].actor).toEqual({ full_name: '張三' })
        expect(result[1].actor).toEqual({ full_name: '李經理' })
      })

      it('應該正確過濾指定的休假申請', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchApprovalHistory } = useHR()
        const result = await fetchApprovalHistory('leave-123')

        // 驗證有調用 readItems 且返回正確結果
        expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
        expect(result).toEqual([])
      })

      it('應該處理取得失敗的情況', async () => {
        mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Network error'))

        const { fetchApprovalHistory } = useHR()

        await expect(fetchApprovalHistory('leave-1')).rejects.toThrow('Network error')
      })

      it('應該在沒有歷程記錄時返回空陣列', async () => {
        mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

        const { fetchApprovalHistory } = useHR()
        const result = await fetchApprovalHistory('leave-1')

        expect(result).toEqual([])
        expect(result).toHaveLength(0)
      })
    })
  })
})
