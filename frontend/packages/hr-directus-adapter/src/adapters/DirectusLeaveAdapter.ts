/**
 * @deprecated This adapter is deprecated. Use backend-v2 APIs instead.
 * The application has migrated away from Directus SDK.
 */

import type {
  ILeaveAdapter,
  ILeaveQueryOptions,
  ILeaveRequest,
  ILeaveRequestWithRelations,
  ILeaveBalance,
  ILeaveApprovalLog,
  IApplyLeaveParams,
  IReviewLeaveParams
} from '@gym-nexus/hr-core'

const DEPRECATION_ERROR = 'DirectusLeaveAdapter is deprecated. Use backend-v2 APIs instead.'

/**
 * @deprecated Use backend-v2 APIs instead
 */
export class DirectusLeaveAdapter implements ILeaveAdapter {
  constructor() {
    console.warn('[DEPRECATED] DirectusLeaveAdapter is deprecated. Use backend-v2 APIs instead.')
  }

  async getLeaveRequests(_options: ILeaveQueryOptions): Promise<ILeaveRequest[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getLeaveRequestsWithRelations(_options: ILeaveQueryOptions): Promise<ILeaveRequestWithRelations[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getLeaveRequest(_id: string): Promise<ILeaveRequestWithRelations | null> {
    throw new Error(DEPRECATION_ERROR)
  }

  async applyLeave(_params: IApplyLeaveParams): Promise<ILeaveRequest> {
    throw new Error(DEPRECATION_ERROR)
  }

  async reviewLeave(_params: IReviewLeaveParams): Promise<ILeaveRequest> {
    throw new Error(DEPRECATION_ERROR)
  }

  async cancelLeave(_id: string): Promise<void> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getLeaveBalance(_employeeId: string, _year: number): Promise<ILeaveBalance[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getLeaveApprovalLogs(_leaveRequestId: string): Promise<ILeaveApprovalLog[]> {
    throw new Error(DEPRECATION_ERROR)
  }
}
