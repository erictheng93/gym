/**
 * Attendance Controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { AttendanceService } from '@gym-nexus/hr-business-logic'
import { AttendanceRepository, ShiftRepository } from '../repositories/index.js'
import { NotFoundError, ValidationError } from '../middleware/index.js'

// Validation schemas
const checkInSchema = z.object({
  employeeId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  checkType: z.enum(['NORMAL', 'OVERTIME', 'MAKEUP', 'MANUAL']).optional(),
  notes: z.string().optional()
})

const checkOutSchema = z.object({
  notes: z.string().optional()
})

// Create service instances
const attendanceRepo = new AttendanceRepository()
const shiftRepo = new ShiftRepository()
const attendanceService = new AttendanceService(attendanceRepo, shiftRepo)

export class AttendanceController {
  /**
   * POST /attendance/check-in
   */
  static async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const data = checkInSchema.parse(req.body)

      const { attendance, lateResult } = await attendanceService.processCheckIn({
        employeeId: data.employeeId,
        branchId: data.branchId,
        checkType: data.checkType,
        notes: data.notes
      })

      res.status(201).json({
        data: attendance,
        meta: {
          isLate: lateResult.isLate,
          lateMinutes: lateResult.lateMinutes
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /attendance/:id/check-out
   */
  static async checkOut(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const data = checkOutSchema.parse(req.body)

      const { attendance, workResult } = await attendanceService.processCheckOut({
        attendanceId: id,
        notes: data.notes
      })

      res.json({
        data: attendance,
        meta: {
          workHours: workResult.workHours,
          overtimeHours: workResult.overtimeHours
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /attendance/today
   */
  static async getTodayAttendances(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query

      const attendances = await attendanceRepo.findTodayByBranch(
        branchId as string | undefined
      )

      res.json({
        data: attendances,
        meta: {
          total: attendances.length,
          date: new Date().toISOString().split('T')[0]
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /attendance/employee/:employeeId/today
   */
  static async getEmployeeTodayAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params

      const attendance = await attendanceService.getTodayAttendance(employeeId)

      if (!attendance) {
        throw new NotFoundError('No attendance record found for today')
      }

      res.json({ data: attendance })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /attendance/employee/:employeeId
   */
  static async getEmployeeAttendances(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params
      const { startDate, endDate } = req.query

      if (!startDate || !endDate) {
        throw new ValidationError('startDate and endDate are required')
      }

      const attendances = await attendanceRepo.findByDateRange(
        employeeId,
        startDate as string,
        endDate as string
      )

      res.json({
        data: attendances,
        meta: {
          total: attendances.length,
          startDate,
          endDate
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /attendance/:id
   */
  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      const attendance = await attendanceRepo.findById(id)

      if (!attendance) {
        throw new NotFoundError('Attendance record not found')
      }

      res.json({ data: attendance })
    } catch (error) {
      next(error)
    }
  }
}
