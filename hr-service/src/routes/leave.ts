/**
 * Leave Routes
 */

import { Router, type IRouter } from 'express'
import { LeaveController } from '../controllers/index.js'
import { authenticate } from '../middleware/index.js'

const router: IRouter = Router()

// All routes require authentication
router.use(authenticate)

// Leave Applications
router.post('/apply', LeaveController.applyLeave)
router.get('/requests', LeaveController.getLeaveRequests)
router.get('/requests/:id', LeaveController.getLeaveRequest)
router.get('/requests/:id/history', LeaveController.getApprovalHistory)

// Leave Approval
router.post('/:id/review', LeaveController.reviewLeave)
router.post('/:id/cancel', LeaveController.cancelLeave)
router.get('/pending', LeaveController.getPendingApprovals)

// Balance
router.get('/balance/:employeeId', LeaveController.getLeaveBalance)

export default router
