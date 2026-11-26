import { describe, it, expect, afterEach } from 'vitest'
import { mockAuthUser } from '@test/setup'
import { useHrAccess } from './useHrAccess'

const setRole = (role: string | null) => {
  mockAuthUser.value = (role ? { id: 'u1', role } : null) as unknown as typeof mockAuthUser.value
}

describe('useHrAccess', () => {
  afterEach(() => setRole('admin'))

  it.each([
    ['super_admin', true, true],
    ['admin', true, true],
    ['manager', true, false],
    ['staff', false, false]
  ])('%s: canViewHr=%s canManagePayroll=%s', (role, canView, canManage) => {
    setRole(role)
    const { canViewHr, canManagePayroll } = useHrAccess()

    expect(canViewHr.value).toBe(canView)
    expect(canManagePayroll.value).toBe(canManage)
  })

  it('未登入時沒有任何權限', () => {
    setRole(null)
    const { canViewHr, canManagePayroll } = useHrAccess()

    expect(canViewHr.value).toBe(false)
    expect(canManagePayroll.value).toBe(false)
  })
})
