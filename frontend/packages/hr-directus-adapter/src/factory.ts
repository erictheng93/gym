/**
 * HR 適配器工廠
 * 提供便捷的適配器初始化方法
 */

import type {
  IAttendanceAdapter,
  ILeaveAdapter,
  IShiftAdapter,
  IMakeupAdapter,
  ITenantContext
} from '@gym-nexus/hr-core'

import {
  DirectusTenantContext,
  DirectusAttendanceAdapter,
  DirectusLeaveAdapter,
  DirectusShiftAdapter,
  DirectusMakeupAdapter,
  type AuthData
} from './adapters'

/**
 * Directus 客戶端類型
 */
type DirectusClient = {
  request: <T>(query: unknown) => Promise<T>
}

/**
 * HR 適配器集合
 */
export interface HRAdapters {
  /** 租戶上下文 */
  tenant: ITenantContext & DirectusTenantContext
  /** 考勤適配器 */
  attendance: IAttendanceAdapter
  /** 休假適配器 */
  leave: ILeaveAdapter
  /** 班表適配器 */
  shift: IShiftAdapter
  /** 補打卡適配器 */
  makeup: IMakeupAdapter
}

/**
 * 創建 HR 適配器
 *
 * @example
 * ```ts
 * const directus = useDirectus()
 * const authData = {
 *   userId: 'xxx',
 *   employeeId: 'yyy',
 *   branchId: 'zzz',
 *   branchType: 'BRANCH',
 *   accessibleBranchIds: ['zzz']
 * }
 *
 * const adapters = createHRAdapters(directus, authData)
 *
 * // 使用適配器
 * const todayAttendance = await adapters.attendance.getTodayAttendance(employeeId)
 * const leaveBalances = await adapters.leave.getBalances(employeeId)
 * ```
 */
export function createHRAdapters(
  directus: DirectusClient,
  authData: AuthData
): HRAdapters {
  const tenant = new DirectusTenantContext(authData)

  return {
    tenant,
    attendance: new DirectusAttendanceAdapter(directus, tenant),
    leave: new DirectusLeaveAdapter(directus, tenant),
    shift: new DirectusShiftAdapter(directus, tenant),
    makeup: new DirectusMakeupAdapter(directus, tenant)
  }
}

/**
 * 創建延遲初始化的 HR 適配器
 * 適用於 Vue composables 中 directus 和 authData 需要響應式獲取的情況
 *
 * @example
 * ```ts
 * const getDirectus = () => useDirectus()
 * const getAuthData = () => ({ ... })
 *
 * const adapters = createLazyHRAdapters(getDirectus, getAuthData)
 *
 * // 每次調用都會獲取最新的 directus 和 authData
 * const todayAttendance = await adapters.attendance.getTodayAttendance(employeeId)
 * ```
 */
export function createLazyHRAdapters(
  getDirectus: () => DirectusClient,
  getAuthData: () => AuthData
): HRAdapters {
  // 使用 Proxy 實現延遲初始化
  let cachedAdapters: HRAdapters | null = null
  let cachedAuthData: AuthData | null = null

  const ensureAdapters = (): HRAdapters => {
    const currentAuthData = getAuthData()

    // 如果 authData 沒變，使用緩存
    if (cachedAdapters && cachedAuthData === currentAuthData) {
      return cachedAdapters
    }

    // 重新創建適配器
    cachedAuthData = currentAuthData
    cachedAdapters = createHRAdapters(getDirectus(), currentAuthData)
    return cachedAdapters
  }

  // 返回 Proxy，每次訪問屬性時確保適配器已初始化
  return new Proxy({} as HRAdapters, {
    get(_target, prop: keyof HRAdapters) {
      return ensureAdapters()[prop]
    }
  })
}
