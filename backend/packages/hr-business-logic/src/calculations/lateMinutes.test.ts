/**
 * Late Minutes Calculation Tests
 */

import { describe, it, expect } from 'vitest'
import {
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  checkLateWithShift,
  buildScheduledStartTime
} from './lateMinutes'
import type { IShiftSchedule } from '../types'

describe('calculateLateMinutes', () => {
  it('should return 0 when on time', () => {
    const checkIn = '2025-01-15T09:05:00'
    const scheduled = '2025-01-15T09:00:00'

    // 5 minutes late, but within 10 minute grace period
    const result = calculateLateMinutes(checkIn, scheduled, 10)
    expect(result).toBe(0)
  })

  it('should calculate late minutes correctly', () => {
    const checkIn = '2025-01-15T09:20:00'
    const scheduled = '2025-01-15T09:00:00'

    // 20 minutes late - 10 minute grace = 10 minutes late
    const result = calculateLateMinutes(checkIn, scheduled, 10)
    expect(result).toBe(10)
  })

  it('should return 0 for early arrival', () => {
    const checkIn = '2025-01-15T08:50:00'
    const scheduled = '2025-01-15T09:00:00'

    const result = calculateLateMinutes(checkIn, scheduled, 10)
    expect(result).toBe(0)
  })

  it('should return 0 for invalid inputs', () => {
    expect(calculateLateMinutes('', '2025-01-15T09:00:00')).toBe(0)
    expect(calculateLateMinutes('2025-01-15T09:20:00', '')).toBe(0)
  })
})

describe('calculateEarlyLeaveMinutes', () => {
  it('should return 0 when leaving on time', () => {
    const checkOut = '2025-01-15T17:55:00'
    const scheduled = '2025-01-15T18:00:00'

    // 5 minutes early, but within 10 minute grace period
    const result = calculateEarlyLeaveMinutes(checkOut, scheduled, 10)
    expect(result).toBe(0)
  })

  it('should calculate early leave minutes correctly', () => {
    const checkOut = '2025-01-15T17:30:00'
    const scheduled = '2025-01-15T18:00:00'

    // 30 minutes early - 10 minute grace = 20 minutes early
    const result = calculateEarlyLeaveMinutes(checkOut, scheduled, 10)
    expect(result).toBe(20)
  })

  it('should return 0 for late departure', () => {
    const checkOut = '2025-01-15T18:30:00'
    const scheduled = '2025-01-15T18:00:00'

    const result = calculateEarlyLeaveMinutes(checkOut, scheduled, 10)
    expect(result).toBe(0)
  })
})

describe('checkLateWithShift', () => {
  const mockShift: IShiftSchedule = {
    id: '1',
    branchId: 'branch-1',
    name: 'Morning Shift',
    startTime: '09:00:00',
    endTime: '18:00:00',
    breakStart: '12:00:00',
    breakEnd: '13:00:00',
    gracePeriodMinutes: 10,
    earlyLeaveMinutes: 10,
    isDefault: true
  }

  it('should return not late when within grace period', () => {
    const checkIn = new Date('2025-01-15T09:05:00')
    const result = checkLateWithShift(checkIn, mockShift)

    expect(result.isLate).toBe(false)
    expect(result.lateMinutes).toBe(0)
    expect(result.attendanceStatus).toBe('PRESENT')
  })

  it('should return late when beyond grace period', () => {
    const checkIn = new Date('2025-01-15T09:15:00')
    const result = checkLateWithShift(checkIn, mockShift)

    expect(result.isLate).toBe(true)
    expect(result.lateMinutes).toBe(5)
    expect(result.attendanceStatus).toBe('LATE')
  })

  it('should handle null shift', () => {
    const checkIn = new Date('2025-01-15T10:00:00')
    const result = checkLateWithShift(checkIn, null)

    expect(result.isLate).toBe(false)
    expect(result.lateMinutes).toBe(0)
    expect(result.attendanceStatus).toBe('PRESENT')
  })
})

describe('buildScheduledStartTime', () => {
  it('should build correct date with time', () => {
    const date = new Date('2025-01-15T10:30:00')
    const result = buildScheduledStartTime(date, '09:00:00')

    expect(result.getHours()).toBe(9)
    expect(result.getMinutes()).toBe(0)
    expect(result.getDate()).toBe(15)
  })
})
