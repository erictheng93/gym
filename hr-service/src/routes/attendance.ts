/**
 * Attendance Routes
 */

import { Router, type IRouter } from 'express'
import { AttendanceController } from '../controllers/index.js'
import { authenticate } from '../middleware/index.js'

const router: IRouter = Router()

// All routes require authentication
router.use(authenticate)

// Check-in/Check-out
router.post('/check-in', AttendanceController.checkIn)
router.post('/:id/check-out', AttendanceController.checkOut)

// Query
router.get('/today', AttendanceController.getTodayAttendances)
router.get('/employee/:employeeId/today', AttendanceController.getEmployeeTodayAttendance)
router.get('/employee/:employeeId', AttendanceController.getEmployeeAttendances)
router.get('/:id', AttendanceController.getById)

export default router
