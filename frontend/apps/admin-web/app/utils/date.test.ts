import { describe, it, expect } from 'vitest'
import { toLocalDateString } from './date'

describe('toLocalDateString', () => {
  it('formats local calendar fields as YYYY-MM-DD with zero padding', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
    expect(toLocalDateString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
