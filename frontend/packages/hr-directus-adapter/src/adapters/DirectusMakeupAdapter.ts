/**
 * @deprecated This adapter is deprecated. Use backend-v2 APIs instead.
 * The application has migrated away from Directus SDK.
 */

import type {
  IMakeupAdapter,
  IMakeupQueryOptions,
  IMakeupRequest,
  IMakeupRequestWithRelations,
  IMakeupApprovalLog,
  IApplyMakeupParams,
  IReviewMakeupParams
} from '@gym-nexus/hr-core'

const DEPRECATION_ERROR = 'DirectusMakeupAdapter is deprecated. Use backend-v2 APIs instead.'

/**
 * @deprecated Use backend-v2 APIs instead
 */
export class DirectusMakeupAdapter implements IMakeupAdapter {
  constructor() {
    console.warn('[DEPRECATED] DirectusMakeupAdapter is deprecated. Use backend-v2 APIs instead.')
  }

  async getMakeupRequests(_options: IMakeupQueryOptions): Promise<IMakeupRequest[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getMakeupRequestsWithRelations(_options: IMakeupQueryOptions): Promise<IMakeupRequestWithRelations[]> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getMakeupRequest(_id: string): Promise<IMakeupRequestWithRelations | null> {
    throw new Error(DEPRECATION_ERROR)
  }

  async applyMakeup(_params: IApplyMakeupParams): Promise<IMakeupRequest> {
    throw new Error(DEPRECATION_ERROR)
  }

  async reviewMakeup(_params: IReviewMakeupParams): Promise<IMakeupRequest> {
    throw new Error(DEPRECATION_ERROR)
  }

  async cancelMakeup(_id: string): Promise<void> {
    throw new Error(DEPRECATION_ERROR)
  }

  async getMakeupApprovalLogs(_makeupRequestId: string): Promise<IMakeupApprovalLog[]> {
    throw new Error(DEPRECATION_ERROR)
  }
}
