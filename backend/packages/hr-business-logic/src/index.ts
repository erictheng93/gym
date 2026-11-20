/**
 * @gym-nexus/hr-business-logic
 * HR 模組後端業務邏輯
 *
 * 提供可復用的 HR 業務邏輯，包含：
 * - 服務：AttendanceService, LeaveApprovalService
 * - 計算函數：工時、遲到、休假天數等
 * - 驗證器：休假申請、考勤打卡等
 * - 接口：Repository 模式的抽象定義
 *
 * @example
 * ```ts
 * import {
 *   AttendanceService,
 *   LeaveApprovalService,
 *   calculateWorkHours,
 *   validateLeaveRequest
 * } from '@gym-nexus/hr-business-logic'
 *
 * // 使用服務
 * const attendanceService = new AttendanceService(attendanceRepo, shiftRepo)
 * const result = await attendanceService.processCheckIn({ employeeId: '...' })
 *
 * // 使用計算函數
 * const workHours = calculateWorkHours(checkIn, checkOut, 60)
 *
 * // 使用驗證器
 * const validation = validateLeaveRequest(params, balance)
 * ```
 */

// Types
export * from './types'

// Interfaces
export * from './interfaces'

// Calculations
export * from './calculations'

// Validators
export * from './validators'

// Services
export * from './services'
