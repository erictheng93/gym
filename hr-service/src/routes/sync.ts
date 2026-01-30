/**
 * Sync Routes - Employee synchronization from main system
 */

import { Router, type IRouter, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { config } from '../config/index.js'
import { EmployeeRepository } from '../repositories/index.js'
import { ValidationError, UnauthorizedError } from '../middleware/index.js'

const router: IRouter = Router()
const employeeRepo = new EmployeeRepository()

// Validation schema for employee sync
const employeeSyncSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  employeeCode: z.string().optional(),
  branchId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
  employmentStatus: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT'])
})

const batchSyncSchema = z.object({
  employees: z.array(employeeSyncSchema)
})

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-webhook-signature'] as string
  const timestamp = req.headers['x-webhook-timestamp'] as string

  if (!signature || !timestamp) {
    throw new UnauthorizedError('Missing webhook signature')
  }

  // Check timestamp to prevent replay attacks (5 minute window)
  const timestampMs = parseInt(timestamp, 10)
  const now = Date.now()
  if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    throw new UnauthorizedError('Webhook timestamp expired')
  }

  // Verify signature
  const payload = `${timestamp}.${JSON.stringify(req.body)}`
  const expectedSignature = crypto
    .createHmac('sha256', config.sync.webhookSecret)
    .update(payload)
    .digest('hex')

  if (signature !== expectedSignature) {
    throw new UnauthorizedError('Invalid webhook signature')
  }

  next()
}

/**
 * POST /sync/employee - Sync single employee (webhook)
 */
router.post('/employee', verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = employeeSyncSchema.parse(req.body)

    const employee = await employeeRepo.upsertFromMainSystem({
      externalId: data.id,
      fullName: data.fullName,
      employeeCode: data.employeeCode,
      branchId: data.branchId,
      supervisorId: data.supervisorId,
      employmentStatus: data.employmentStatus,
      employmentType: data.employmentType
    })

    res.json({
      success: true,
      data: {
        id: employee.id,
        externalId: employee.external_id,
        syncedAt: employee.synced_at
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /sync/employees - Batch sync employees
 */
router.post('/employees', verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employees } = batchSyncSchema.parse(req.body)

    const results = await Promise.all(
      employees.map(async (data) => {
        try {
          const employee = await employeeRepo.upsertFromMainSystem({
            externalId: data.id,
            fullName: data.fullName,
            employeeCode: data.employeeCode,
            branchId: data.branchId,
            supervisorId: data.supervisorId,
            employmentStatus: data.employmentStatus,
            employmentType: data.employmentType
          })
          return { success: true, externalId: data.id, id: employee.id }
        } catch (error) {
          return {
            success: false,
            externalId: data.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )

    const successCount = results.filter(r => r.success).length

    res.json({
      success: true,
      meta: {
        total: employees.length,
        synced: successCount,
        failed: employees.length - successCount
      },
      data: results
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /sync/status - Get sync status
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await employeeRepo.findAll()

    res.json({
      success: true,
      data: {
        enabled: config.sync.enabled,
        intervalMinutes: config.sync.intervalMinutes,
        totalEmployees: employees.length,
        lastSyncAt: employees.length > 0
          ? employees.reduce((latest, e) =>
              e.synced_at > latest ? e.synced_at : latest,
              employees[0]!.synced_at
            )
          : null
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router
