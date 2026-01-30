/**
 * 多租戶上下文接口
 * 提供當前用戶的租戶（分店）信息
 */

/**
 * 多租戶上下文
 * 用於確定當前用戶的權限範圍
 */
export interface ITenantContext {
  /**
   * 取得當前租戶 ID（總部或分店）
   * 用於 row-level security
   */
  getTenantId(): string | null

  /**
   * 取得當前用戶所屬分店 ID
   */
  getBranchId(): string | null

  /**
   * 取得當前用戶可訪問的所有分店 ID
   * 總部用戶可能可以訪問多個分店
   */
  getBranchIds(): string[]

  /**
   * 取得當前員工 ID
   */
  getCurrentEmployeeId(): string | null

  /**
   * 是否為總部用戶（可訪問所有分店）
   */
  isHeadquarter(): boolean

  /**
   * 是否有權限訪問指定分店
   */
  canAccessBranch(branchId: string): boolean
}

/**
 * 可觀察的租戶上下文
 * 用於 Vue composables 響應式綁定
 */
export interface IReactiveTenantContext extends ITenantContext {
  /**
   * 響應式的當前分店 ID
   */
  readonly branchId: string | null

  /**
   * 響應式的當前員工 ID
   */
  readonly employeeId: string | null

  /**
   * 響應式的可訪問分店列表
   */
  readonly accessibleBranchIds: string[]
}
