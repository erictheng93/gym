/**
 * @deprecated This adapter is deprecated. Use backend-v2 APIs instead.
 * The application has migrated away from Directus SDK.
 */

import type {
  IAttendanceAdapter,
  IAttendanceQueryOptions,
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  ITodayAttendanceSummary,
  IMonthlyAttendanceStats,
  ICheckInOptions,
  ICheckOutOptions
} from '@gym-nexus/hr-core'

const DEPRECATION_ERROR = 'DirectusAttendanceAdapter is deprecated. Use backend-v2 APIs instead.'

/**
 * @deprecated Use backend-v2 APIs instead
 */
export class DirectusAttendanceAdapter implements IAttendanceAdapter {
  constructor() {
    console.warn('[DEPRECATED] DirectusAttendanceAdapter is deprecated. Use backend-v2 APIs instead.')
  }

  async getAttendanceRecords(_options: IAttendanceQueryOptions): Promise<IAttendanceRecord[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getAttendanceRecordsWithEmployee(_options: IAttendanceQueryOptions): Promise<IAttendanceRecordWithEmployee[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getTodayAttendance(_employeeId: string): Promise<IAttendanceRecord | null> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getTodayAttendanceSummary(): Promise<ITodayAttendanceSummary> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getMonthlyStats(_employeeId: string, _year: number, _month: number): Promise<IMonthlyAttendanceStats> {
    throw new Error(DEPRECATION_ERROR)
  }

  async checkIn(_options: ICheckInOptions): Promise<IAttendanceRecord> {
    throw new Error(DEPRECATION_ERROR)
  }

  async checkOut(_options: ICheckOutOptions): Promise<IAttendanceRecord> {
    throw new Error(DEPRECATION_ERROR)
  }
}
