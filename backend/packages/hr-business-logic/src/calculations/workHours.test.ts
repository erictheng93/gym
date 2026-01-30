/**
 * Work Hours Calculation Tests
 */

import { describe, it, expect } from 'vitest'
import {
  calculateWorkHours,
  calculateOvertimeHours,
  parseTimeString,
  formatMinutesToTime
} from './workHours'

describe('calculateWorkHours', () => {
  it('should calculate work hours correctly', () => {
    const checkIn = '2025-01-15T09:00:00'
    const checkOut = '2025-01-15T18:00:00'

    // 9 hours - 1 hour break = 8 hours
    const result = calculateWorkHours(checkIn, checkOut, 60)
    expect(result).toBe(8)
  })

  it('should return 0 for invalid inputs', () => {
    expect(calculateWorkHours('', '2025-01-15T18:00:00')).toBe(0)
    expect(calculateWorkHours('2025-01-15T09:00:00', '')).toBe(0)
  })

  it('should handle Date objects', () => {
    const checkIn = new Date('2025-01-15T09:00:00')
    const checkOut = new Date('2025-01-15T18:00:00')

    const result = calculateWorkHours(checkIn, checkOut, 60)
    expect(result).toBe(8)
  })

  it('should handle custom break minutes', () => {
    const checkIn = '2025-01-15T09:00:00'
    const checkOut = '2025-01-15T18:00:00'

    // 9 hours - 0.5 hour break = 8.5 hours
    const result = calculateWorkHours(checkIn, checkOut, 30)
    expect(result).toBe(8.5)
  })

  it('should not return negative values', () => {
    const checkIn = '2025-01-15T09:00:00'
    const checkOut = '2025-01-15T09:30:00'

    // 0.5 hours - 1 hour break = max(0, -0.5) = 0
    const result = calculateWorkHours(checkIn, checkOut, 60)
    expect(result).toBe(0)
  })
})

describe('calculateOvertimeHours', () => {
  it('should calculate overtime correctly', () => {
    expect(calculateOvertimeHours(10, 8)).toBe(2)
    expect(calculateOvertimeHours(8, 8)).toBe(0)
    expect(calculateOvertimeHours(6, 8)).toBe(0)
  })

  it('should use default standard hours', () => {
    expect(calculateOvertimeHours(10)).toBe(2) // Default 8 hours
  })
})

describe('parseTimeString', () => {
  it('should parse HH:mm:ss format', () => {
    const result = parseTimeString('09:30:00')
    expect(result.hours).toBe(9)
    expect(result.minutes).toBe(30)
  })

  it('should parse HH:mm format', () => {
    const result = parseTimeString('14:45')
    expect(result.hours).toBe(14)
    expect(result.minutes).toBe(45)
  })

  it('should handle edge cases', () => {
    const result = parseTimeString('00:00')
    expect(result.hours).toBe(0)
    expect(result.minutes).toBe(0)
  })
})

describe('formatMinutesToTime', () => {
  it('should format minutes to HH:mm', () => {
    expect(formatMinutesToTime(90)).toBe('01:30')
    expect(formatMinutesToTime(60)).toBe('01:00')
    expect(formatMinutesToTime(0)).toBe('00:00')
  })

  it('should handle large values', () => {
    expect(formatMinutesToTime(150)).toBe('02:30')
    expect(formatMinutesToTime(480)).toBe('08:00')
  })
})
