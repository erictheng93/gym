/**
 * Leave Balance Calculation Tests
 */

import { describe, it, expect } from 'vitest'
import {
  calculateLeaveDays,
  calculateAvailableDays,
  hasEnoughBalance,
  calculateBalanceUpdate,
  calculateAnnualLeaveDays,
  calculateCarryOverDays,
  getLeaveTypeName,
  getLeaveTypeLimit
} from './leaveBalance'
import type { ILeaveBalance } from '../types'

describe('calculateLeaveDays', () => {
  it('should calculate single day leave', () => {
    const result = calculateLeaveDays('2025-01-15', '2025-01-15')
    expect(result).toBe(1)
  })

  it('should calculate multi-day leave', () => {
    const result = calculateLeaveDays('2025-01-15', '2025-01-17')
    expect(result).toBe(3)
  })

  it('should return 0.5 for half day', () => {
    const result = calculateLeaveDays('2025-01-15', '2025-01-15', true)
    expect(result).toBe(0.5)
  })

  it('should handle Date objects', () => {
    const start = new Date('2025-01-15')
    const end = new Date('2025-01-17')
    const result = calculateLeaveDays(start, end)
    expect(result).toBe(3)
  })
})

describe('calculateAvailableDays', () => {
  const mockBalance: ILeaveBalance = {
    id: '1',
    employeeId: 'emp-1',
    leaveType: 'ANNUAL',
    year: 2025,
    totalDays: 15,
    usedDays: 5,
    pendingDays: 2,
    carryOverDays: 3,
    expiryDate: null
  }

  it('should calculate available days correctly', () => {
    // 15 + 3 - 5 - 2 = 11
    const result = calculateAvailableDays(mockBalance)
    expect(result).toBe(11)
  })

  it('should not return negative values', () => {
    const overusedBalance: ILeaveBalance = {
      ...mockBalance,
      usedDays: 20,
      pendingDays: 5
    }
    const result = calculateAvailableDays(overusedBalance)
    expect(result).toBe(0)
  })
})

describe('hasEnoughBalance', () => {
  const mockBalance: ILeaveBalance = {
    id: '1',
    employeeId: 'emp-1',
    leaveType: 'ANNUAL',
    year: 2025,
    totalDays: 15,
    usedDays: 5,
    pendingDays: 2,
    carryOverDays: 0,
    expiryDate: null
  }

  it('should return true when enough balance', () => {
    // Available: 15 - 5 - 2 = 8
    expect(hasEnoughBalance(mockBalance, 5)).toBe(true)
  })

  it('should return false when not enough balance', () => {
    expect(hasEnoughBalance(mockBalance, 10)).toBe(false)
  })

  it('should return false for null balance', () => {
    expect(hasEnoughBalance(null, 1)).toBe(false)
  })
})

describe('calculateBalanceUpdate', () => {
  const mockBalance: ILeaveBalance = {
    id: '1',
    employeeId: 'emp-1',
    leaveType: 'ANNUAL',
    year: 2025,
    totalDays: 15,
    usedDays: 5,
    pendingDays: 2,
    carryOverDays: 0,
    expiryDate: null
  }

  it('should calculate pending increase', () => {
    const result = calculateBalanceUpdate(mockBalance, 3, 0)
    expect(result.newPendingDays).toBe(5) // 2 + 3
    expect(result.newUsedDays).toBe(5)
  })

  it('should calculate approval (pending decrease, used increase)', () => {
    const result = calculateBalanceUpdate(mockBalance, -2, 2)
    expect(result.newPendingDays).toBe(0) // 2 - 2
    expect(result.newUsedDays).toBe(7) // 5 + 2
  })

  it('should not return negative values', () => {
    const result = calculateBalanceUpdate(mockBalance, -10, -10)
    expect(result.newPendingDays).toBe(0)
    expect(result.newUsedDays).toBe(0)
  })
})

describe('calculateAnnualLeaveDays', () => {
  it('should return 0 for less than 6 months', () => {
    expect(calculateAnnualLeaveDays(0.4)).toBe(0)
  })

  it('should return 3 for 6 months to 1 year', () => {
    expect(calculateAnnualLeaveDays(0.6)).toBe(3)
  })

  it('should return 7 for 1-2 years', () => {
    expect(calculateAnnualLeaveDays(1.5)).toBe(7)
  })

  it('should return 10 for 2-3 years', () => {
    expect(calculateAnnualLeaveDays(2.5)).toBe(10)
  })

  it('should return 14 for 3-5 years', () => {
    expect(calculateAnnualLeaveDays(4)).toBe(14)
  })

  it('should return 15 for 5-10 years', () => {
    expect(calculateAnnualLeaveDays(7)).toBe(15)
  })

  it('should increase after 10 years', () => {
    expect(calculateAnnualLeaveDays(12)).toBe(18) // 15 + (12-10) + 1
  })

  it('should cap at 30 days', () => {
    expect(calculateAnnualLeaveDays(30)).toBe(30)
  })
})

describe('calculateCarryOverDays', () => {
  it('should return remaining days if under max', () => {
    expect(calculateCarryOverDays(5, 7)).toBe(5)
  })

  it('should cap at max carry over', () => {
    expect(calculateCarryOverDays(10, 7)).toBe(7)
  })

  it('should use default max of 7', () => {
    expect(calculateCarryOverDays(10)).toBe(7)
  })
})

describe('getLeaveTypeName', () => {
  it('should return Chinese names', () => {
    expect(getLeaveTypeName('ANNUAL')).toBe('年假')
    expect(getLeaveTypeName('SICK')).toBe('病假')
    expect(getLeaveTypeName('PERSONAL')).toBe('事假')
  })
})

describe('getLeaveTypeLimit', () => {
  it('should return limits for specified types', () => {
    expect(getLeaveTypeLimit('SICK')).toBe(30)
    expect(getLeaveTypeLimit('PERSONAL')).toBe(14)
    expect(getLeaveTypeLimit('MATERNITY')).toBe(56)
  })

  it('should return null for unlimited types', () => {
    expect(getLeaveTypeLimit('ANNUAL')).toBeNull()
    expect(getLeaveTypeLimit('COMPENSATORY')).toBeNull()
  })
})
