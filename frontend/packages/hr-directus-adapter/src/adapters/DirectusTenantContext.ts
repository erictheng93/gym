/**
 * Directus 租戶上下文實現
 * 提供當前用戶的分店/權限信息
 */

import type { ITenantContext } from '@gym-nexus/hr-core'

/**
 * 認證數據結構
 */
export interface AuthData {
  /** 當前用戶 ID */
  userId: string | null
  /** 當前員工 ID */
  employeeId: string | null
  /** 當前分店 ID */
  branchId: string | null
  /** 分店類型 */
  branchType: 'HEADQUARTER' | 'BRANCH' | null
  /** 可訪問的分店 ID 列表 */
  accessibleBranchIds: string[]
}

/**
 * Directus 租戶上下文實現
 */
export class DirectusTenantContext implements ITenantContext {
  private authData: AuthData

  constructor(authData: AuthData) {
    this.authData = authData
  }

  /**
   * 更新認證數據
   */
  updateAuthData(authData: Partial<AuthData>): void {
    this.authData = { ...this.authData, ...authData }
  }

  /**
   * 取得當前租戶 ID
   */
  getTenantId(): string | null {
    return this.authData.branchId
  }

  /**
   * 取得當前分店 ID
   */
  getBranchId(): string | null {
    return this.authData.branchId
  }

  /**
   * 取得可訪問的分店 ID 列表
   */
  getBranchIds(): string[] {
    return this.authData.accessibleBranchIds
  }

  /**
   * 取得當前員工 ID
   */
  getCurrentEmployeeId(): string | null {
    return this.authData.employeeId
  }

  /**
   * 是否為總部用戶
   */
  isHeadquarter(): boolean {
    return this.authData.branchType === 'HEADQUARTER'
  }

  /**
   * 是否有權限訪問指定分店
   */
  canAccessBranch(branchId: string): boolean {
    // 總部可以訪問所有分店
    if (this.isHeadquarter()) {
      return true
    }
    // 分店用戶只能訪問自己所屬分店或明確授權的分店
    return this.authData.accessibleBranchIds.includes(branchId)
  }

  /**
   * 構建分店過濾條件
   * 用於 Directus 查詢
   */
  buildBranchFilter(): Record<string, unknown> | null {
    // 總部不需要過濾
    if (this.isHeadquarter()) {
      return null
    }

    // 分店用戶只能看到自己分店的數據
    const branchId = this.getBranchId()
    if (branchId) {
      return { branch_id: { _eq: branchId } }
    }

    return null
  }
}

/**
 * 創建空的租戶上下文（用於初始化）
 */
export function createEmptyTenantContext(): DirectusTenantContext {
  return new DirectusTenantContext({
    userId: null,
    employeeId: null,
    branchId: null,
    branchType: null,
    accessibleBranchIds: []
  })
}
