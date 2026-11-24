// Ownership checks on per-employee HR reads must fail closed: no user, or a
// non-admin asking for someone else's records, is Forbidden.
import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'

const { autoStub } = vi.hoisted(() => ({
  // Every method resolves to a non-empty result, so only the auth check can stop a request.
  autoStub: () =>
    class {
      constructor() {
        return new Proxy({}, {
          get: (_t, key) => (key === 'then' ? undefined : vi.fn().mockResolvedValue([{ id: 'r1' }])),
        })
      }
    },
}))

vi.mock('../repositories/index.js', () => ({
  LeaveRequestRepository: autoStub(),
  LeaveBalanceRepository: autoStub(),
  LeaveApprovalLogRepository: autoStub(),
  EmployeeRepository: autoStub(),
  AttendanceRepository: autoStub(),
  ShiftRepository: autoStub(),
}))
vi.mock('@gym-nexus/hr-business-logic', () => ({
  AttendanceService: autoStub(),
  LeaveApprovalService: autoStub(),
}))

const { AttendanceController } = await import('./AttendanceController.js')
const { LeaveController } = await import('./LeaveController.js')
const { ForbiddenError } = await import('../middleware/index.js')

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>
const handlers: Array<[string, Handler, (id: string) => Partial<Request>]> = [
  ['attendance today', AttendanceController.getEmployeeTodayAttendance, (id) => ({ params: { employeeId: id }, query: {} })],
  ['attendance list', AttendanceController.getEmployeeAttendances, (id) => ({ params: { employeeId: id }, query: {} })],
  ['leave requests', LeaveController.getLeaveRequests, (id) => ({ params: {}, query: { employeeId: id } })],
  ['leave balance', LeaveController.getLeaveBalance, (id) => ({ params: { employeeId: id }, query: {} })],
]

const run = async (handler: Handler, req: Partial<Request>) => {
  const next = vi.fn()
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response
  await handler(req as Request, res, next)
  return next.mock.calls[0]?.[0]
}

describe.each(handlers)('%s ownership check', (_name, handler, reqFor) => {
  it('rejects when there is no authenticated user', async () => {
    expect(await run(handler, { ...reqFor(OWNER), user: undefined })).toBeInstanceOf(ForbiddenError)
  })

  it("rejects a non-admin reading another employee's records", async () => {
    const user = { employeeId: OTHER, isAdmin: false }
    expect(await run(handler, { ...reqFor(OWNER), user } as Partial<Request>)).toBeInstanceOf(ForbiddenError)
  })

  it('allows the owner and admins', async () => {
    for (const user of [{ employeeId: OWNER, isAdmin: false }, { employeeId: OTHER, isAdmin: true }]) {
      expect(await run(handler, { ...reqFor(OWNER), user } as Partial<Request>)).not.toBeInstanceOf(ForbiddenError)
    }
  })
})
