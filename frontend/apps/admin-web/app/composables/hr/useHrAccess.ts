/**
 * useHrAccess - role gates of the HR payroll / performance backend
 * (backend/src/routes/hr-payroll.ts, hr-performance.ts).
 *
 * Reading needs super_admin / admin / manager (HR_READ_ROLES); generating, adjusting,
 * approving and paying salaries, creating promotions, approving / rejecting reviews and
 * deleting KPI templates need super_admin / admin (HR_ADMIN_ROLES).
 */

export const HR_READ_ROLES: readonly string[] = ['super_admin', 'admin', 'manager']
export const HR_ADMIN_ROLES: readonly string[] = ['super_admin', 'admin']

export const useHrAccess = () => {
  const { user } = useAuth()

  /** Can open the payroll / performance pages at all */
  const canViewHr = computed(() => HR_READ_ROLES.includes(user.value?.role ?? ''))
  /** Can run the money / approval actions (hide or disable them otherwise) */
  const canManagePayroll = computed(() => HR_ADMIN_ROLES.includes(user.value?.role ?? ''))

  return { canViewHr, canManagePayroll }
}

export default useHrAccess
