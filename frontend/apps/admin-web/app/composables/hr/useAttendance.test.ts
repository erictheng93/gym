/**
 * useAttendance.test.ts
 * Tests for the attendance management composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockFetchInstance } from '@test/setup'
import { useAttendance, type AttendanceRecord } from './useAttendance'
import type { Attendance, Employee } from '~/types/schema'

describe('useAttendance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('時間計算 - calculateLateMinutes', () => {
    it('應該在 9:00 AM 之前返回 0', () => {
      const { calculateLateMinutes } = useAttendance()

      const earlyTime = new Date('2025-01-15T08:30:00')
      const result = calculateLateMinutes(earlyTime)

      expect(result).toBe(0)
    })

    it('應該在剛好 9:00 AM 時返回 0', () => {
      const { calculateLateMinutes } = useAttendance()

      const onTime = new Date('2025-01-15T09:00:00')
      const result = calculateLateMinutes(onTime)

      expect(result).toBe(0)
    })

    it('應該在 9:30 AM 時返回 30 分鐘遲到', () => {
      const { calculateLateMinutes } = useAttendance()

      const lateTime = new Date('2025-01-15T09:30:00')
      const result = calculateLateMinutes(lateTime)

      expect(result).toBe(30)
    })

    it('應該在 10:00 AM 時返回 60 分鐘遲到', () => {
      const { calculateLateMinutes } = useAttendance()

      const lateTime = new Date('2025-01-15T10:00:00')
      const result = calculateLateMinutes(lateTime)

      expect(result).toBe(60)
    })

    it('應該在 9:15 AM 時返回 15 分鐘遲到', () => {
      const { calculateLateMinutes } = useAttendance()

      const lateTime = new Date('2025-01-15T09:15:00')
      const result = calculateLateMinutes(lateTime)

      expect(result).toBe(15)
    })
  })

  describe('時間計算 - calculateEarlyLeaveMinutes', () => {
    it('應該在 6:00 PM 之後返回 0', () => {
      const { calculateEarlyLeaveMinutes } = useAttendance()

      const lateTime = new Date('2025-01-15T18:30:00')
      const result = calculateEarlyLeaveMinutes(lateTime)

      expect(result).toBe(0)
    })

    it('應該在剛好 6:00 PM 時返回 0', () => {
      const { calculateEarlyLeaveMinutes } = useAttendance()

      const onTime = new Date('2025-01-15T18:00:00')
      const result = calculateEarlyLeaveMinutes(onTime)

      expect(result).toBe(0)
    })

    it('應該在 5:30 PM 時返回 30 分鐘早退', () => {
      const { calculateEarlyLeaveMinutes } = useAttendance()

      const earlyTime = new Date('2025-01-15T17:30:00')
      const result = calculateEarlyLeaveMinutes(earlyTime)

      expect(result).toBe(30)
    })

    it('應該在 5:00 PM 時返回 60 分鐘早退', () => {
      const { calculateEarlyLeaveMinutes } = useAttendance()

      const earlyTime = new Date('2025-01-15T17:00:00')
      const result = calculateEarlyLeaveMinutes(earlyTime)

      expect(result).toBe(60)
    })

    it('應該在 4:00 PM 時返回 120 分鐘早退', () => {
      const { calculateEarlyLeaveMinutes } = useAttendance()

      const earlyTime = new Date('2025-01-15T16:00:00')
      const result = calculateEarlyLeaveMinutes(earlyTime)

      expect(result).toBe(120)
    })
  })

  describe('時間計算 - calculateOvertimeHours', () => {
    it('應該在沒有設定加班起算時間時返回 0', () => {
      const { calculateOvertimeHours } = useAttendance()

      const result = calculateOvertimeHours('2025-01-15T20:00:00Z', '18:00:00', null)

      expect(result).toBe(0)
    })

    it('應該在下班早於加班起算時間時返回 0', () => {
      const { calculateOvertimeHours } = useAttendance()

      const result = calculateOvertimeHours('17:30:00', '18:00:00', '18:30:00')

      expect(result).toBe(0)
    })

    it('應該正確計算加班時數', () => {
      const { calculateOvertimeHours } = useAttendance()

      // 下班 20:00, 加班起算 18:30 = 1.5 小時加班
      const result = calculateOvertimeHours('20:00:00', '18:00:00', '18:30:00')

      expect(result).toBe(1.5)
    })

    it('應該處理 ISO 格式的下班時間', () => {
      const { calculateOvertimeHours } = useAttendance()

      // Use local time string (without Z) to avoid timezone conversion issues
      const result = calculateOvertimeHours('2025-01-15T19:30:00', '18:00:00', '18:30:00')

      expect(result).toBe(1)
    })
  })

  describe('fetchTodayAttendances', () => {
    it('應該成功取得今日考勤記錄', async () => {
      const mockAttendances: Partial<Attendance>[] = [
        {
          id: 'att-1',
          employee_id: 'emp-1',
          employee: { id: 'emp-1', full_name: 'John' } as Employee,
          check_in: '2025-01-15T08:00:00Z',
          check_out: null,
          attendance_date: '2025-01-15',
          check_type: 'REGULAR',
          attendance_status: 'PRESENT',
          late_minutes: 0,
          early_leave_minutes: 0
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockAttendances,
        total: 1
      })

      const { fetchTodayAttendances, todayAttendances, todayCount, isLoading } = useAttendance()

      await fetchTodayAttendances()

      expect(todayAttendances.value).toHaveLength(1)
      expect(todayAttendances.value[0].id).toBe('att-1')
      expect(todayCount.value).toBe(1)
      expect(isLoading.value).toBe(false)
    })

    it('應該支援分店過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchTodayAttendances } = useAttendance()

      await fetchTodayAttendances('branch-1')

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({
          filter: expect.objectContaining({
            branch_id: 'branch-1'
          })
        })
      )
    })

    it('應該處理取得失敗的情況', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchTodayAttendances, isLoading } = useAttendance()

      await fetchTodayAttendances()

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(isLoading.value).toBe(false)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('getTodayAttendance', () => {
    it('應該返回員工的今日考勤記錄', async () => {
      const mockAttendance: Partial<Attendance> = {
        id: 'att-1',
        employee_id: 'emp-1',
        employee: { id: 'emp-1', full_name: 'John' } as Employee,
        check_in: '2025-01-15T08:00:00Z',
        attendance_date: '2025-01-15',
        check_type: 'REGULAR',
        attendance_status: 'PRESENT'
      }

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [mockAttendance],
        total: 1
      })

      const { getTodayAttendance } = useAttendance()

      const result = await getTodayAttendance('emp-1')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('att-1')
    })

    it('應該在沒有記錄時返回 null', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { getTodayAttendance } = useAttendance()

      const result = await getTodayAttendance('emp-1')

      expect(result).toBeNull()
    })

    it('應該處理錯誤並返回 null', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Error'))

      const { getTodayAttendance } = useAttendance()

      const result = await getTodayAttendance('emp-1')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('performCheckIn', () => {
    it('應該成功執行上班打卡', async () => {
      const createdAttendance: Partial<Attendance> = {
        id: 'att-new',
        employee_id: 'emp-1',
        check_in: '2025-01-15T10:00:00.000Z',
        attendance_date: '2025-01-15'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce(createdAttendance)
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [createdAttendance],
        total: 1
      })

      const { performCheckIn, todayAttendances, todayCount } = useAttendance()

      const result = await performCheckIn({
        employeeId: 'emp-1',
        branchId: 'branch-1'
      })

      expect(result.id).toBe('att-new')
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({
          employee_id: 'emp-1',
          branch_id: 'branch-1',
          attendance_date: '2025-01-15'
        })
      )
    })

    it('應該計算遲到分鐘數', async () => {
      // Use local time (without Z suffix) for correct late calculation
      vi.setSystemTime(new Date('2025-01-15T09:30:00'))

      const createdAttendance: Partial<Attendance> = {
        id: 'att-late',
        employee_id: 'emp-1',
        late_minutes: 30,
        attendance_status: 'LATE'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce(createdAttendance)
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [createdAttendance],
        total: 1
      })

      const { performCheckIn } = useAttendance()

      const result = await performCheckIn({
        employeeId: 'emp-1'
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({
          late_minutes: 30,
          attendance_status: 'LATE'
        })
      )
    })

    it('應該支援不同打卡類型', async () => {
      const createdAttendance: Partial<Attendance> = {
        id: 'att-ot',
        check_type: 'OVERTIME'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce(createdAttendance)
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [createdAttendance],
        total: 1
      })

      const { performCheckIn } = useAttendance()

      await performCheckIn({
        employeeId: 'emp-1',
        checkType: 'OVERTIME'
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({
          check_type: 'OVERTIME'
        })
      )
    })

    it('應該在建立失敗時拋出錯誤', async () => {
      mockFetchInstance.createItem.mockResolvedValueOnce(null)

      const { performCheckIn } = useAttendance()

      await expect(performCheckIn({ employeeId: 'emp-1' })).rejects.toThrow('Failed to create attendance record')
    })

    it('應該將新記錄加入 todayAttendances', async () => {
      const createdAttendance: Partial<Attendance> = {
        id: 'att-new',
        employee_id: 'emp-1'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce(createdAttendance)
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [createdAttendance],
        total: 1
      })

      const { performCheckIn, todayAttendances, todayCount } = useAttendance()

      const initialCount = todayCount.value

      await performCheckIn({ employeeId: 'emp-1' })

      expect(todayCount.value).toBe(initialCount + 1)
    })
  })

  describe('performCheckOut', () => {
    it('應該成功執行下班打卡', async () => {
      const existingAttendance: Partial<Attendance> = {
        id: 'att-1',
        employee_id: 'emp-1',
        check_in: '2025-01-15T02:00:00.000Z',
        check_out: null,
        attendance_status: 'PRESENT'
      }

      const updatedAttendance: Partial<Attendance> = {
        ...existingAttendance,
        check_out: '2025-01-15T10:00:00.000Z',
        work_hours: 8
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(existingAttendance)
      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedAttendance)
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [updatedAttendance],
        total: 1
      })

      const { performCheckOut } = useAttendance()

      const result = await performCheckOut('att-1')

      expect(result.check_out).toBeDefined()
      expect(mockFetchInstance.updateItem).toHaveBeenCalled()
    })

    it('應該在找不到記錄時拋出錯誤', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(null)

      const { performCheckOut } = useAttendance()

      await expect(performCheckOut('non-existent')).rejects.toThrow('找不到上班打卡記錄')
    })

    it('應該在沒有上班打卡時拋出錯誤', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce({
        id: 'att-1',
        check_in: null
      })

      const { performCheckOut } = useAttendance()

      await expect(performCheckOut('att-1')).rejects.toThrow('找不到上班打卡記錄')
    })

    it('應該計算工作時數', async () => {
      const existingAttendance: Partial<Attendance> = {
        id: 'att-1',
        check_in: '2025-01-15T01:30:00.000Z', // 8.5 hours before
        attendance_status: 'PRESENT'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(existingAttendance)
      mockFetchInstance.updateItem.mockResolvedValueOnce({ work_hours: 8.5 })
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [{ ...existingAttendance, work_hours: 8.5 }],
        total: 1
      })

      const { performCheckOut } = useAttendance()

      const result = await performCheckOut('att-1')

      expect(result.work_hours).toBeDefined()
    })

    it('應該在早退時更新狀態', async () => {
      // Use local time (without Z suffix) for correct early leave calculation
      vi.setSystemTime(new Date('2025-01-15T17:30:00')) // 5:30 PM - early leave

      const existingAttendance: Partial<Attendance> = {
        id: 'att-1',
        check_in: '2025-01-15T09:00:00.000',
        attendance_status: 'PRESENT'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(existingAttendance)
      mockFetchInstance.updateItem.mockResolvedValueOnce({})
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [{ ...existingAttendance, attendance_status: 'EARLY_LEAVE' }],
        total: 1
      })

      const { performCheckOut } = useAttendance()

      await performCheckOut('att-1')

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'attendances',
        'att-1',
        expect.objectContaining({
          attendance_status: 'EARLY_LEAVE',
          early_leave_minutes: 30
        })
      )
    })
  })

  describe('fetchTodayAttendanceSummary', () => {
    it('應該返回今日考勤概況', async () => {
      // Mock employees
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [{ id: 'emp-1' }, { id: 'emp-2' }, { id: 'emp-3' }],
        total: 3
      })

      // Mock attendances
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [
          { id: 'att-1', check_in: '09:00', check_out: null, attendance_status: 'PRESENT' },
          { id: 'att-2', check_in: '09:30', check_out: '18:00', attendance_status: 'LATE' }
        ],
        total: 2
      })

      // Mock leave requests
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchTodayAttendanceSummary, todayAttendanceSummary } = useAttendance()

      const result = await fetchTodayAttendanceSummary()

      expect(result.totalEmployees).toBe(3)
      expect(result.checkedIn).toBe(2)
      expect(result.late).toBe(1)
      expect(todayAttendanceSummary.value).toEqual(result)
    })

    it('應該支援分店過濾', async () => {
      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchTodayAttendanceSummary } = useAttendance()

      await fetchTodayAttendanceSummary('branch-1')

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'employees',
        expect.objectContaining({
          filter: expect.objectContaining({
            branch_id: 'branch-1'
          })
        })
      )
    })

    it('應該在錯誤時返回零值', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Error'))

      const { fetchTodayAttendanceSummary } = useAttendance()

      const result = await fetchTodayAttendanceSummary()

      expect(result).toEqual({
        totalEmployees: 0,
        checkedIn: 0,
        notCheckedIn: 0,
        checkedOut: 0,
        late: 0,
        onLeave: 0
      })

      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchMonthlyAttendanceStats', () => {
    it('應該返回月度考勤統計', async () => {
      const mockAttendances: Partial<Attendance>[] = [
        {
          id: 'att-1',
          employee_id: 'emp-1',
          employee: { full_name: 'John', employee_code: 'E001' } as any,
          attendance_status: 'PRESENT',
          work_hours: 8,
          late_minutes: 0
        },
        {
          id: 'att-2',
          employee_id: 'emp-1',
          employee: { full_name: 'John', employee_code: 'E001' } as any,
          attendance_status: 'LATE',
          work_hours: 8,
          late_minutes: 15
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockAttendances,
        total: 2
      })

      const { fetchMonthlyAttendanceStats } = useAttendance()

      const result = await fetchMonthlyAttendanceStats({
        year: 2025,
        month: 1
      })

      expect(result).toHaveLength(1)
      expect(result[0].employeeId).toBe('emp-1')
      expect(result[0].totalDays).toBe(2)
      expect(result[0].presentDays).toBe(2) // PRESENT + LATE both count as present
      expect(result[0].lateDays).toBe(1)
    })

    it('應該支援分店過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchMonthlyAttendanceStats } = useAttendance()

      await fetchMonthlyAttendanceStats({
        year: 2025,
        month: 1,
        branchId: 'branch-1'
      })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({
          filter: expect.objectContaining({
            branch_id: 'branch-1'
          })
        })
      )
    })

    it('應該在錯誤時返回空陣列', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Error'))

      const { fetchMonthlyAttendanceStats } = useAttendance()

      const result = await fetchMonthlyAttendanceStats({
        year: 2025,
        month: 1
      })

      expect(result).toEqual([])

      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchRecentAttendances', () => {
    it('應該取得近期考勤記錄', async () => {
      const mockAttendances: Partial<Attendance>[] = [
        { id: 'att-1', attendance_date: '2025-01-15' },
        { id: 'att-2', attendance_date: '2025-01-14' }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockAttendances,
        total: 2
      })

      const { fetchRecentAttendances, recentAttendances } = useAttendance()

      await fetchRecentAttendances('emp-1', 7)

      expect(recentAttendances.value).toEqual(mockAttendances)
    })

    it('應該處理錯誤', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Error'))

      const { fetchRecentAttendances } = useAttendance()

      await fetchRecentAttendances('emp-1', 7)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch recent attendances:', expect.any(Error))

      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchEmployeeMonthlyAttendance', () => {
    it('應該取得員工月度考勤詳情', async () => {
      const mockAttendances: Partial<Attendance>[] = [
        { id: 'att-1', attendance_date: '2025-01-01' },
        { id: 'att-2', attendance_date: '2025-01-02' }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockAttendances,
        total: 2
      })

      const { fetchEmployeeMonthlyAttendance } = useAttendance()

      const result = await fetchEmployeeMonthlyAttendance('emp-1', 2025, 1)

      expect(result).toHaveLength(2)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({
          filter: expect.objectContaining({
            employee_id: 'emp-1'
          })
        })
      )
    })

    it('應該在錯誤時返回空陣列', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Error'))

      const { fetchEmployeeMonthlyAttendance } = useAttendance()

      const result = await fetchEmployeeMonthlyAttendance('emp-1', 2025, 1)

      expect(result).toEqual([])

      consoleErrorSpy.mockRestore()
    })
  })
})
