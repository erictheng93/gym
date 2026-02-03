/**
 * Integration Tests: HR Workflow
 *
 * Tests the HR operations including attendance, leave management,
 * and employee operations working together.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockFetchInstance } from '@test/setup'

describe('HR Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Attendance Management Flow', () => {
    it('should fetch recent attendance records', async () => {
      const recentRecords = [
        { id: 'att-1', employee_id: 'emp-1', date: '2024-01-15', status: 'present' },
        { id: 'att-2', employee_id: 'emp-1', date: '2024-01-14', status: 'present' },
        { id: 'att-3', employee_id: 'emp-1', date: '2024-01-13', status: 'late' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: recentRecords, total: 3 })

      const { useHR } = await import('~/composables/useHR')
      const { fetchRecentAttendances, recentAttendances } = useHR()

      await fetchRecentAttendances('emp-1')

      expect(recentAttendances.value).toHaveLength(3)
    })

    it('should record check-in for an employee', async () => {
      const checkInRecord = {
        id: 'att-1',
        employee_id: 'emp-1',
        attendance_date: '2024-01-15',
        check_in_time: '09:05:00'
      }

      mockFetchInstance.createItem
        .mockResolvedValueOnce(checkInRecord)

      const { useHR } = await import('~/composables/useHR')
      const { checkIn } = useHR()

      const result = await checkIn({ employeeId: 'emp-1' })
      expect(result).toBeTruthy()
      expect(mockFetchInstance.createItem).toHaveBeenCalled()
    })
  })

  describe('Leave Management Flow', () => {
    it('should fetch leave requests', async () => {
      const leaveRequests = [
        { id: 'leave-1', employee_id: 'emp-1', leave_status: 'PENDING' },
        { id: 'leave-2', employee_id: 'emp-2', leave_status: 'APPROVED' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: leaveRequests, total: 2 })

      const { useHR } = await import('~/composables/useHR')
      const { fetchLeaveRequests, leaveRequests: requests } = useHR()

      await fetchLeaveRequests()

      expect(requests.value).toHaveLength(2)
    })

    it('should submit a leave request', async () => {
      const submittedLeave = {
        id: 'leave-1',
        employee_id: 'emp-1',
        leave_type: 'annual',
        start_date: '2024-02-01',
        end_date: '2024-02-03',
        leave_status: 'PENDING',
        reason: '家庭旅遊'
      }

      mockFetchInstance.createItem
        .mockResolvedValueOnce(submittedLeave)

      const { useHR } = await import('~/composables/useHR')
      const { applyLeave } = useHR()

      const submitted = await applyLeave({
        employeeId: 'emp-1',
        leaveType: 'ANNUAL',
        startDate: '2024-02-01',
        endDate: '2024-02-03',
        reason: '家庭旅遊',
        daysRequested: 3
      })

      expect(submitted?.leave_status).toBe('PENDING')
    })

    it('should fetch leave balances', async () => {
      const leaveBalances = [
        { leave_type: 'annual', total: 14, used: 3, remaining: 11 },
        { leave_type: 'sick', total: 30, used: 2, remaining: 28 }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: leaveBalances, total: 2 })

      const { useHR } = await import('~/composables/useHR')
      const { fetchLeaveBalances, leaveBalances: balances } = useHR()

      await fetchLeaveBalances('emp-1', 2024)

      expect(balances.value).toHaveLength(2)
    })
  })

  describe('Shift Management Flow', () => {
    it('should fetch employee shifts', async () => {
      const weeklyShifts = [
        { id: 'assign-1', employee_id: 'emp-1', shift_id: 'shift-1', date: '2024-01-15' },
        { id: 'assign-2', employee_id: 'emp-1', shift_id: 'shift-1', date: '2024-01-16' },
        { id: 'assign-3', employee_id: 'emp-2', shift_id: 'shift-1', date: '2024-01-15' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: weeklyShifts, total: 3 })

      const { useHR } = await import('~/composables/useHR')
      const { fetchEmployeeShifts, employeeShifts } = useHR()

      await fetchEmployeeShifts({
        employeeId: 'emp-1'
      })

      expect(employeeShifts.value).toHaveLength(3)
    })

    it('should fetch shift schedules', async () => {
      const shifts = [
        { id: 'shift-1', name: '早班', start_time: '09:00', end_time: '18:00' },
        { id: 'shift-2', name: '晚班', start_time: '14:00', end_time: '22:00' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: shifts, total: 2 })

      const { useHR } = await import('~/composables/useHR')
      const { fetchShiftSchedules, shiftSchedules } = useHR()

      await fetchShiftSchedules('branch-1')

      expect(shiftSchedules.value).toHaveLength(2)
    })
  })

  describe('Makeup Requests Flow', () => {
    it('should fetch makeup requests', async () => {
      const makeupRequests = [
        { id: 'makeup-1', employee_id: 'emp-1', request_status: 'PENDING' },
        { id: 'makeup-2', employee_id: 'emp-2', request_status: 'APPROVED' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: makeupRequests, total: 2 })

      const { useHR } = await import('~/composables/useHR')
      const { fetchMakeupRequests, makeupRequests: requests } = useHR()

      await fetchMakeupRequests()

      expect(requests.value).toHaveLength(2)
    })

    it('should submit a makeup request', async () => {
      const makeupRequest = {
        id: 'makeup-1',
        employee_id: 'emp-1',
        target_date: '2024-01-15',
        makeup_type: 'CHECK_IN',
        makeup_time: '09:05:00',
        reason: '忘記打卡',
        request_status: 'PENDING'
      }

      mockFetchInstance.createItem
        .mockResolvedValueOnce(makeupRequest)

      const { useHR } = await import('~/composables/useHR')
      const { applyMakeup } = useHR()

      const result = await applyMakeup({
        employeeId: 'emp-1',
        branchId: 'branch-1',
        targetDate: '2024-01-15',
        makeupType: 'CHECK_IN',
        reason: '忘記打卡'
      })

      expect(result?.request_status).toBe('PENDING')
    })
  })

  describe('Branch-scoped HR Operations', () => {
    it('should filter employees by branch', async () => {
      const branchEmployees = [
        { id: 'emp-1', full_name: '張小花', branch_id: 'branch-1' },
        { id: 'emp-2', full_name: '林小美', branch_id: 'branch-1' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: branchEmployees, total: 2 })

      const { useEmployees } = await import('~/composables/useEmployees')
      const { fetchEmployees, employees } = useEmployees()

      await fetchEmployees()

      expect(employees.value).toHaveLength(2)
    })
  })
})
