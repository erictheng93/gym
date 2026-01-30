/**
 * Leave Controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { LeaveApprovalService } from '@gym-nexus/hr-business-logic'
import {
  LeaveRequestRepository,
  LeaveBalanceRepository,
  LeaveApprovalLogRepository,
  EmployeeRepository
} from '../repositories/index.js'
import { NotFoundError, ForbiddenError } from '../middleware/index.js'

// Validation schemas
const applyLeaveSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.enum([
    'ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'PATERNITY',
    'BEREAVEMENT', 'MARRIAGE', 'COMPENSATORY', 'UNPAID', 'OTHER'
  ]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
  isHalfDay: z.boolean().optional(),
  halfDayType: z.enum(['MORNING', 'AFTERNOON']).optional()
})

const reviewLeaveSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional()
})

// Create service instances
const leaveRequestRepo = new LeaveRequestRepository()
const balanceRepo = new LeaveBalanceRepository()
const approvalLogRepo = new LeaveApprovalLogRepository()
const employeeRepo = new EmployeeRepository()

const leaveService = new LeaveApprovalService(
  leaveRequestRepo,
  balanceRepo,
  approvalLogRepo,
  employeeRepo
)

export class LeaveController {
  /**
   * POST /leave/apply
   */
  static async applyLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const data = applyLeaveSchema.parse(req.body)

      const { leaveRequest, validation } = await leaveService.applyLeave({
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        isHalfDay: data.isHalfDay,
        halfDayType: data.halfDayType
      })

      res.status(201).json({
        data: leaveRequest,
        meta: {
          daysRequested: validation.daysRequested,
          warnings: validation.warnings
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /leave/:id/review
   */
  static async reviewLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const data = reviewLeaveSchema.parse(req.body)

      if (!req.user?.employeeId) {
        throw new ForbiddenError('Approver ID is required')
      }

      const { leaveRequest, approvalLog } = await leaveService.reviewLeave({
        leaveRequestId: id,
        approverId: req.user.employeeId,
        action: data.action,
        notes: data.notes
      })

      res.json({
        data: leaveRequest,
        meta: {
          approvalLog
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /leave/:id/cancel
   */
  static async cancelLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      if (!req.user?.employeeId) {
        throw new ForbiddenError('Employee ID is required')
      }

      const leaveRequest = await leaveService.cancelLeave(id, req.user.employeeId)

      res.json({ data: leaveRequest })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /leave/requests
   */
  static async getLeaveRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId, status } = req.query

      if (!employeeId) {
        throw new NotFoundError('employeeId is required')
      }

      const requests = await leaveRequestRepo.findByEmployeeId(
        employeeId as string,
        status as string | undefined
      )

      res.json({
        data: requests,
        meta: {
          total: requests.length
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /leave/requests/:id
   */
  static async getLeaveRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      const request = await leaveRequestRepo.findById(id)

      if (!request) {
        throw new NotFoundError('Leave request not found')
      }

      res.json({ data: request })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /leave/requests/:id/history
   */
  static async getApprovalHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      const history = await approvalLogRepo.findByLeaveRequestId(id)

      res.json({
        data: history,
        meta: {
          total: history.length
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /leave/pending
   */
  static async getPendingApprovals(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.employeeId) {
        throw new ForbiddenError('Employee ID is required')
      }

      const requests = await leaveRequestRepo.findPendingByApprover(
        req.user.employeeId
      )

      res.json({
        data: requests,
        meta: {
          total: requests.length
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /leave/balance/:employeeId
   */
  static async getLeaveBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params
      const year = parseInt(req.query.year as string) || new Date().getFullYear()

      const balances = await balanceRepo.findAllByEmployeeAndYear(employeeId, year)

      res.json({
        data: balances,
        meta: {
          year,
          total: balances.length
        }
      })
    } catch (error) {
      next(error)
    }
  }
}
