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
      expect(todayAttendances.value[0]).toMatchObject({
        id: 'att-1',
        check_in: '2025-01-15T08:00:00Z',
        check_out: null,
        check_type: 'REGULAR',
        attendance_status: 'PRESENT'
      })
      expect(todayCount.value).toBe(1)
      expect(isLoading.value).toBe(false)
    })

    it('應該以今日日期查詢，並為缺少的欄位補上預設值', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [{ id: 'att-bare', employee_id: 'emp-1' }],
        total: 1
      })

      const { fetchTodayAttendances, todayAttendances } = useAttendance()
      await fetchTodayAttendances()

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({ filter: { attendance_date: '2025-01-15' } })
      )
      expect(todayAttendances.value[0]).toMatchObject({
        id: 'att-bare',
        check_in: null,
        check_out: null,
        attendance_date: '2025-01-15',
        check_type: 'REGULAR',
        attendance_status: 'PRESENT',
        late_minutes: 0,
        early_leave_minutes: 0,
        work_hours: null
      })
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

      const { fetchTodayAttendances, isLoading, todayAttendances } = useAttendance()

      await fetchTodayAttendances()

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(isLoading.value).toBe(false)
      expect(todayAttendances.value).toEqual([])

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

      expect(result).toMatchObject({ id: 'att-1', check_in: '2025-01-15T08:00:00Z', attendance_status: 'PRESENT' })
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('attendances', {
        filter: { employee_id: 'emp-1', attendance_date: '2025-01-15' },
        limit: 1
      })
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

  // Backend-shaped rows: what routes/attendances.ts formatAttendance() answers
  const apiAttendance = (overrides: Partial<Attendance> = {}): Attendance => ({
    id: 'att-1',
    date_created: '',
    employee_id: 'emp-1',
    employee: { id: 'emp-1', full_name: 'Alice', employee_code: 'E00001' } as unknown as Employee,
    check_in: new Date('2025-01-15T09:00:00').toISOString(),
    check_out: null,
    attendance_date: '2025-01-15',
    check_type: 'REGULAR',
    attendance_status: 'PRESENT',
    late_minutes: 0,
    early_leave_minutes: 0,
    work_hours: null,
    overtime_hours: 0,
    branch_id: 'branch-1',
    location_ip: null,
    location_gps: null,
    notes: null,
    ...overrides
  })

  describe('performCheckIn', () => {
    it('POSTs only the fields the backend accepts and keeps the created record', async () => {
      vi.setSystemTime(new Date('2025-01-15T08:55:00')) // on time (local)
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAttendance({ id: 'att-new' }) })

      const { performCheckIn } = useAttendance()
      const result = await performCheckIn({ employeeId: 'emp-1', branchId: 'branch-1' })

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/attendances', {
        method: 'POST',
        body: {
          employee_id: 'emp-1',
          branch_id: 'branch-1',
          check_in: new Date('2025-01-15T08:55:00').toISOString(),
          notes: undefined
        }
      })
      expect(result).toMatchObject({
        id: 'att-new',
        employee: { id: 'emp-1', full_name: 'Alice' },
        check_out: null,
        check_type: 'REGULAR',
        attendance_status: 'PRESENT',
        late_minutes: 0
      })
      // The record comes from the POST answer, not from a list query
      expect(mockFetchInstance.readItems).not.toHaveBeenCalled()
    })

    it('computes late minutes', async () => {
      vi.setSystemTime(new Date('2025-01-15T09:30:00'))
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAttendance({ id: 'att-late' }) })

      const { performCheckIn } = useAttendance()
      const result = await performCheckIn({ employeeId: 'emp-1' })

      expect(result).toMatchObject({ id: 'att-late', attendance_status: 'LATE', late_minutes: 30 })
    })

    it('rethrows the backend error (already checked in)', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('此員工已打卡上班，尚未打卡下班'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { performCheckIn, todayAttendances } = useAttendance()
      todayAttendances.value = []

      await expect(performCheckIn({ employeeId: 'emp-1' })).rejects.toThrow('此員工已打卡上班，尚未打卡下班')
      expect(todayAttendances.value).toEqual([])
      consoleErrorSpy.mockRestore()
    })

    it('throws when the answer carries no record', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { performCheckIn } = useAttendance()

      await expect(performCheckIn({ employeeId: 'emp-1' })).rejects.toThrow('Failed to create attendance record')
      consoleErrorSpy.mockRestore()
    })

    it('puts the new record first in todayAttendances', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAttendance({ id: 'att-new' }) })

      const { performCheckIn, todayCount, todayAttendances } = useAttendance()
      todayAttendances.value = [{ id: 'att-old' } as AttendanceRecord]
      const initialCount = todayCount.value

      await performCheckIn({ employeeId: 'emp-1' })

      expect(todayCount.value).toBe(initialCount + 1)
      expect(todayAttendances.value.map(a => a.id)).toEqual(['att-new', 'att-old'])
    })
  })

  describe('performCheckOut', () => {
    // What the old code got back from readItems({ filter: { id } }): the backend
    // ignored `id` and returned the newest row of the table - another employee's
    const bobsRow = () => apiAttendance({
      id: 'att-bob',
      employee_id: 'emp-2',
      employee: { id: 'emp-2', full_name: 'Bob' } as unknown as Employee
    })

    it('keeps the PATCHed record itself, never the newest row of a list query', async () => {
      vi.setSystemTime(new Date('2025-01-15T18:30:00')) // after 18:00 local: no early leave
      const checkOut = new Date('2025-01-15T18:30:00').toISOString()
      mockFetchInstance.readItem.mockResolvedValueOnce(apiAttendance())
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: apiAttendance({ check_out: checkOut, work_hours: 9.5 })
      })
      mockFetchInstance.readItems.mockResolvedValue({ data: [bobsRow()], total: 1 })

      const { performCheckOut } = useAttendance()
      const result = await performCheckOut('att-1')

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/attendances/att-1', {
        method: 'PATCH',
        body: { check_out: checkOut }
      })
      expect(result).toMatchObject({
        id: 'att-1',
        employee: { id: 'emp-1', full_name: 'Alice' },
        check_out: checkOut,
        work_hours: 9.5,
        early_leave_minutes: 0,
        attendance_status: 'PRESENT'
      })
    })

    it('a second check-out click PATCHes the same record again, not another employee', async () => {
      vi.setSystemTime(new Date('2025-01-15T18:30:00'))
      mockFetchInstance.readItem.mockResolvedValueOnce(apiAttendance()).mockResolvedValueOnce(apiAttendance())
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAttendance({ check_out: new Date().toISOString() }) })
      mockFetchInstance.readItems.mockResolvedValue({ data: [bobsRow()], total: 1 })

      const { performCheckOut } = useAttendance()
      const first = await performCheckOut('att-1')

      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('此筆考勤已打卡下班'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(performCheckOut(first.id)).rejects.toThrow('此筆考勤已打卡下班')
      consoleErrorSpy.mockRestore()

      const patched = mockFetchInstance.apiFetch.mock.calls.map(c => c[0])
      expect(patched).toEqual(['/attendances/att-1', '/attendances/att-1'])
    })

    it('throws when the PATCH answers with no record', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(apiAttendance())
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '考勤記錄已更新' })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { performCheckOut } = useAttendance()

      await expect(performCheckOut('att-1')).rejects.toThrow('下班打卡失敗')
      consoleErrorSpy.mockRestore()
    })

    it('throws when the record does not exist', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(null)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { performCheckOut } = useAttendance()

      await expect(performCheckOut('non-existent')).rejects.toThrow('找不到上班打卡記錄')
      expect(mockFetchInstance.apiFetch).not.toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('throws when there is no check-in', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(apiAttendance({ check_in: null }))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { performCheckOut } = useAttendance()

      await expect(performCheckOut('att-1')).rejects.toThrow('找不到上班打卡記錄')
      consoleErrorSpy.mockRestore()
    })

    it('marks an early leave, and keeps LATE for a late record', async () => {
      vi.setSystemTime(new Date('2025-01-15T17:30:00')) // 5:30 PM - early leave
      mockFetchInstance.readItem.mockResolvedValueOnce(apiAttendance())
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAttendance({ check_out: new Date().toISOString(), work_hours: 8.5 }) })

      const { performCheckOut } = useAttendance()
      const early = await performCheckOut('att-1')
      expect(early).toMatchObject({ attendance_status: 'EARLY_LEAVE', early_leave_minutes: 30, work_hours: 8.5 })

      vi.setSystemTime(new Date('2025-01-15T17:00:00'))
      mockFetchInstance.readItem.mockResolvedValueOnce(apiAttendance({ attendance_status: 'LATE' }))
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAttendance({ check_out: new Date().toISOString() }) })
      const late = await performCheckOut('att-1')
      expect(late).toMatchObject({ attendance_status: 'LATE', early_leave_minutes: 60 })
    })

    it('replaces the matching row of todayAttendances', async () => {
      vi.setSystemTime(new Date('2025-01-15T18:00:00'))
      mockFetchInstance.readItem.mockResolvedValueOnce(apiAttendance())
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAttendance({ check_out: new Date().toISOString(), work_hours: 9 }) })

      const { performCheckOut, todayAttendances } = useAttendance()
      todayAttendances.value = [
        { id: 'att-0', check_out: null } as AttendanceRecord,
        { id: 'att-1', check_out: null } as AttendanceRecord
      ]

      await performCheckOut('att-1')

      expect(todayAttendances.value[0]!.check_out).toBeNull()
      expect(todayAttendances.value[1]).toMatchObject({ id: 'att-1', work_hours: 9 })
      expect(todayAttendances.value[1]!.check_out).not.toBeNull()
    })
  })

  describe('fetchTodayAttendanceSummary', () => {
    it('應該扣除請假人數計算尚未打卡人數，且不會小於 0', async () => {
      const respond = (employees: number, attendances: object[], onLeave: number) => {
        mockFetchInstance.readItems.mockImplementation(async (collection: string) => {
          if (collection === 'employees') return { data: [], total: employees }
          if (collection === 'attendances') return { data: attendances, total: attendances.length }
          return { data: [], total: onLeave }
        })
      }

      const { fetchTodayAttendanceSummary } = useAttendance()

      respond(10, [{ check_in: '09:00' }, { check_in: '09:05', check_out: '18:00' }], 3)
      expect(await fetchTodayAttendanceSummary()).toEqual({
        totalEmployees: 10,
        checkedIn: 2,
        notCheckedIn: 5,
        checkedOut: 1,
        late: 0,
        onLeave: 3
      })

      // More check-ins + leave than employees must clamp to 0
      respond(2, [{ check_in: '09:00' }, { check_in: '09:05' }], 1)
      expect((await fetchTodayAttendanceSummary('branch-x')).notCheckedIn).toBe(0)
    })

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

      expect(result).toEqual({
        totalEmployees: 3,
        checkedIn: 2,
        notCheckedIn: 1,
        checkedOut: 1,
        late: 1,
        onLeave: 0
      })
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
          employee: { full_name: 'John', employee_code: 'E001' } as Employee,
          attendance_status: 'PRESENT',
          work_hours: 8,
          late_minutes: 0
        },
        {
          id: 'att-2',
          employee_id: 'emp-1',
          employee: { full_name: 'John', employee_code: 'E001' } as Employee,
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
      expect(result[0]).toMatchObject({
        employeeId: 'emp-1',
        employeeName: 'John',
        employeeCode: 'E001',
        totalDays: 2,
        presentDays: 2, // PRESENT + LATE both count as present
        lateDays: 1,
        totalWorkHours: 16,
        totalLateMinutes: 15
      })
    })

    it('應該依狀態分別累計各員工的出勤、缺勤、早退、請假與加班時數', async () => {
      const att = (employee_id: string, attendance_status: string, extra: object = {}) =>
        ({ id: `${employee_id}-${attendance_status}`, employee_id, attendance_status, ...extra })

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [
          att('emp-1', 'ABSENT'),
          att('emp-1', 'EARLY_LEAVE', { work_hours: 6.5 }),
          att('emp-1', 'LEAVE'),
          att('emp-1', 'PRESENT', { work_hours: 9, overtime_hours: 1.5 }),
          att('emp-2', 'LATE', { late_minutes: 20, work_hours: 7 })
        ],
        total: 5
      })

      const { fetchMonthlyAttendanceStats } = useAttendance()
      const result = await fetchMonthlyAttendanceStats({ year: 2025, month: 2 })

      expect(result).toHaveLength(2)
      expect(result.find(r => r.employeeId === 'emp-1')).toMatchObject({
        totalDays: 4,
        presentDays: 2, // EARLY_LEAVE + PRESENT
        absentDays: 1,
        earlyLeaveDays: 1,
        leaveDays: 1,
        totalWorkHours: 15.5,
        totalOvertimeHours: 1.5
      })
      expect(result.find(r => r.employeeId === 'emp-2')).toMatchObject({
        totalDays: 1,
        presentDays: 1,
        lateDays: 1,
        totalLateMinutes: 20
      })
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

  describe('local date handling (Asia/Taipei, UTC+8)', () => {
    const originalTZ = process.env.TZ
    beforeEach(() => {
      process.env.TZ = 'Asia/Taipei'
      // 07:30 local on Jan 15 = 23:30 UTC on Jan 14
      vi.setSystemTime(new Date('2026-01-15T07:30:00+08:00'))
    })
    afterEach(() => {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it('queries today using the local date, not the UTC date', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })
      await useAttendance().fetchTodayAttendances()
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'attendances',
        expect.objectContaining({ filter: { attendance_date: '2026-01-15' } })
      )
    })

    it('uses local month boundaries for monthly stats', async () => {
      mockFetchInstance.readItems.mockResolvedValue({ data: [], total: 0 })
      await useAttendance().fetchMonthlyAttendanceStats({ year: 2026, month: 2 })
      const filters = mockFetchInstance.readItems.mock.calls.map(c => c[1]?.filter)
      expect(filters).toContainEqual(expect.objectContaining({
        attendance_date_gte: '2026-02-01',
        attendance_date_lte: '2026-02-28'
      }))
    })
  })
})
