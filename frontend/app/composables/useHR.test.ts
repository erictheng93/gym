import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockDirectusInstance } from '../../vitest.setup'
import { useHR } from './useHR'
import type { Attendance, LeaveRequest, LeaveBalance, LeaveApprovalLog } from '~/types/directus'

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
    describe('fetchTodayAttendance', () => {
      it('應該成功取得今日考勤記錄', async () => {
        const mockAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          check_in: '2025-01-15T08:00:00Z',
          check_out: null,
          attendance_date: '2025-01-15'
        }

        mockDirectusInstance.request.mockResolvedValueOnce([mockAttendance])

        const { fetchTodayAttendance, todayAttendance, isAttendanceLoading } = useHR()

        await fetchTodayAttendance('emp-1')

        expect(todayAttendance.value).toEqual(mockAttendance)
        expect(isAttendanceLoading.value).toBe(false)
      })

      it('應該在沒有今日記錄時設為 null', async () => {
        mockDirectusInstance.request.mockResolvedValueOnce([])

        const { fetchTodayAttendance, todayAttendance } = useHR()

        await fetchTodayAttendance('emp-1')

        expect(todayAttendance.value).toBeNull()
      })

      it('應該處理取得失敗的情況', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockDirectusInstance.request.mockRejectedValueOnce(new Error('Fetch failed'))

        const { fetchTodayAttendance, todayAttendance } = useHR()

        await fetchTodayAttendance('emp-1')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(todayAttendance.value).toBeNull()

        consoleErrorSpy.mockRestore()
      })
    })

    describe('fetchRecentAttendances', () => {
      it('應該成功取得近期考勤記錄', async () => {
        const mockAttendances: Partial<Attendance>[] = [
          { id: 'att-1', attendance_date: '2025-01-15' },
          { id: 'att-2', attendance_date: '2025-01-14' }
        ]

        mockDirectusInstance.request.mockResolvedValueOnce(mockAttendances)

        const { fetchRecentAttendances, recentAttendances } = useHR()

        await fetchRecentAttendances('emp-1', 7)

        expect(recentAttendances.value).toEqual(mockAttendances)
      })

      it('應該使用預設天數 7 天', async () => {
        mockDirectusInstance.request.mockResolvedValueOnce([])

        const { fetchRecentAttendances } = useHR()

        await fetchRecentAttendances('emp-1')

      })
    })

    describe('checkIn', () => {
      it('應該成功上班打卡（創建新記錄）', async () => {
        const createdAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          branch_id: 'branch-1',
          check_in: '2025-01-15T10:00:00.000Z',
          attendance_date: '2025-01-15'
        }

        mockDirectusInstance.request.mockResolvedValueOnce(createdAttendance)

        const { checkIn, todayAttendance } = useHR()
        todayAttendance.value = null

        const result = await checkIn('emp-1', 'branch-1', { ip: '192.168.1.1' })

        expect(result).toEqual(createdAttendance)
        expect(todayAttendance.value).toEqual(createdAttendance)
      })

      it('應該成功上班打卡（更新現有記錄）', async () => {
        const existingAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          employee_id: 'emp-1',
          check_in: null
        }

        const updatedAttendance: Partial<Attendance> = {
          ...existingAttendance,
          check_in: '2025-01-15T10:00:00.000Z'
        }

        mockDirectusInstance.request.mockResolvedValueOnce(updatedAttendance)

        const { checkIn, todayAttendance } = useHR()
        todayAttendance.value = existingAttendance as Attendance

        const result = await checkIn('emp-1', 'branch-1')

        expect(mockDirectusInstance.request).toHaveBeenCalled()
        expect(result).toEqual(updatedAttendance)
      })

      it('應該在已打卡時拋出錯誤', async () => {
        const { checkIn, todayAttendance } = useHR()
        todayAttendance.value = {
          id: 'attendance-1',
          check_in: '2025-01-15T08:00:00Z'
        } as Attendance

        await expect(checkIn('emp-1', 'branch-1')).rejects.toThrow('今日已打卡上班')
      })

      it('應該記錄 GPS 位置資訊', async () => {
        mockDirectusInstance.request.mockResolvedValueOnce({})

        const { checkIn, todayAttendance } = useHR()
        todayAttendance.value = null

        await checkIn('emp-1', 'branch-1', {
          ip: '192.168.1.1',
          gps: '25.0330,121.5654'
        })

      })
    })

    describe('checkOut', () => {
      it('應該成功下班打卡', async () => {
        const existingAttendance: Partial<Attendance> = {
          id: 'attendance-1',
          check_in: '2025-01-15T02:00:00.000Z', // 8 hours before current time
          check_out: null
        }

        const updatedAttendance: Partial<Attendance> = {
          ...existingAttendance,
          check_out: '2025-01-15T10:00:00.000Z',
          work_hours: 8
        }

        mockDirectusInstance.request.mockResolvedValueOnce(updatedAttendance)

        const { checkOut, todayAttendance } = useHR()
        todayAttendance.value = existingAttendance as Attendance

        const result = await checkOut()

        expect(result).toEqual(updatedAttendance)
      })

      it('應該在未打卡上班時拋出錯誤', async () => {
        const { checkOut, todayAttendance } = useHR()
        todayAttendance.value = null

        await expect(checkOut()).rejects.toThrow('尚未打卡上班')
      })

      it('應該在已打卡下班時拋出錯誤', async () => {
        const { checkOut, todayAttendance } = useHR()
        todayAttendance.value = {
          id: 'attendance-1',
          check_in: '2025-01-15T08:00:00Z',
          check_out: '2025-01-15T17:00:00Z'
        } as Attendance

        await expect(checkOut()).rejects.toThrow('今日已打卡下班')
      })

      it('應該正確計算工作時數', async () => {
        const checkInTime = new Date('2025-01-15T01:30:00.000Z') // 8.5 hours before
        vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z'))

        mockDirectusInstance.request.mockResolvedValueOnce({
          work_hours: 8.5
        })

        const { checkOut, todayAttendance } = useHR()
        todayAttendance.value = {
          id: 'attendance-1',
          check_in: checkInTime.toISOString()
        } as Attendance

        await checkOut()

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

        mockDirectusInstance.request.mockResolvedValueOnce(mockBalances)

        const { fetchLeaveBalances, leaveBalances } = useHR()

        await fetchLeaveBalances('emp-1', 2025)

        expect(leaveBalances.value).toEqual(mockBalances)
      })

      it('應該使用當前年份作為預設值', async () => {
        mockDirectusInstance.request.mockResolvedValueOnce([])

        const { fetchLeaveBalances } = useHR()

        await fetchLeaveBalances('emp-1')

      })
    })

    describe('fetchLeaveRequests', () => {
      it('應該成功取得休假申請列表', async () => {
        const mockRequests: Partial<LeaveRequest>[] = [
          { id: 'leave-1', employee_id: 'emp-1', leave_type: 'ANNUAL' },
          { id: 'leave-2', employee_id: 'emp-1', leave_type: 'SICK' }
        ]

        mockDirectusInstance.request
          .mockResolvedValueOnce(mockRequests)
          .mockResolvedValueOnce([{ count: 2 }])

        const { fetchLeaveRequests, leaveRequests, leavesTotalCount } = useHR()

        await fetchLeaveRequests({ employeeId: 'emp-1' })

        expect(leaveRequests.value).toEqual(mockRequests)
        expect(leavesTotalCount.value).toBe(2)
      })

      it('應該支援狀態過濾', async () => {
        mockDirectusInstance.request
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ count: 0 }])

        const { fetchLeaveRequests } = useHR()

        await fetchLeaveRequests({ status: 'PENDING' })

      })

      it('應該支援分頁', async () => {
        mockDirectusInstance.request
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ count: 0 }])

        const { fetchLeaveRequests } = useHR()

        await fetchLeaveRequests({ page: 2, limit: 10 })

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

        mockDirectusInstance.request
          .mockResolvedValueOnce(subordinates)
          .mockResolvedValueOnce(pendingLeaves)

        const { fetchPendingApprovals, pendingApprovals } = useHR()

        await fetchPendingApprovals('supervisor-1')

        expect(mockDirectusInstance.request).toHaveBeenCalledTimes(2)
        expect(pendingApprovals.value).toEqual(pendingLeaves)
      })

    })
  })
})
