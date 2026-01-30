/**
 * Routes Index
 */

import { Router, type IRouter } from 'express'
import attendanceRoutes from './attendance.js'
import leaveRoutes from './leave.js'
import syncRoutes from './sync.js'

const router: IRouter = Router()

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'hr-service',
    version: process.env.npm_package_version || '0.1.0'
  })
})

// API routes
router.use('/attendance', attendanceRoutes)
router.use('/leave', leaveRoutes)
router.use('/sync', syncRoutes)

export default router
