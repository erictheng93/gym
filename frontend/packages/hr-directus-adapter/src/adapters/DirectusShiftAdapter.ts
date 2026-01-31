/**
 * @deprecated This adapter is deprecated. Use backend-v2 APIs instead.
 * The application has migrated away from Directus SDK.
 */

import type {
  IShiftAdapter,
  IShiftQueryOptions,
  IEmployeeShiftQueryOptions,
  IShiftSchedule,
  IShiftScheduleWithBranch,
  IEmployeeShift,
  IEmployeeShiftWithRelations,
  ICreateShiftScheduleParams,
  IAssignShiftParams,
  IBatchAssignShiftParams,
  IEmployee
} from '@gym-nexus/hr-core'

const DEPRECATION_ERROR = 'DirectusShiftAdapter is deprecated. Use backend-v2 APIs instead.'

/**
 * @deprecated Use backend-v2 APIs instead
 */
export class DirectusShiftAdapter implements IShiftAdapter {
  constructor() {
    console.warn('[DEPRECATED] DirectusShiftAdapter is deprecated. Use backend-v2 APIs instead.')
  }

  async getShiftSchedules(_options: IShiftQueryOptions): Promise<IShiftSchedule[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getShiftSchedulesWithBranch(_options: IShiftQueryOptions): Promise<IShiftScheduleWithBranch[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getShiftSchedule(_id: string): Promise<IShiftScheduleWithBranch | null> {
    throw new Error(DEPRECATION_ERROR)
  }

  async createShiftSchedule(_params: ICreateShiftScheduleParams): Promise<IShiftSchedule> {
    throw new Error(DEPRECATION_ERROR)
  }

  async updateShiftSchedule(_id: string, _params: Partial<ICreateShiftScheduleParams>): Promise<IShiftSchedule> {
    throw new Error(DEPRECATION_ERROR)
  }

  async deleteShiftSchedule(_id: string): Promise<void> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getEmployeeShifts(_options: IEmployeeShiftQueryOptions): Promise<IEmployeeShift[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getEmployeeShiftsWithRelations(_options: IEmployeeShiftQueryOptions): Promise<IEmployeeShiftWithRelations[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async assignShift(_params: IAssignShiftParams): Promise<IEmployeeShift> {
    throw new Error(DEPRECATION_ERROR)
  }

  async batchAssignShifts(_params: IBatchAssignShiftParams): Promise<IEmployeeShift[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async removeShiftAssignment(_id: string): Promise<void> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getAvailableEmployees(_shiftId: string, _date: string): Promise<IEmployee[]> {
    throw new Error(DEPRECATION_ERROR)
  }
}
