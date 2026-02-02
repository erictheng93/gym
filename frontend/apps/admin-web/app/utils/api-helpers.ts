/**
 * API 工具函數
 *
 * 提供分頁計算、過濾器建構等常用 API 操作的工具函數
 */

import { PAGINATION } from '~/constants'

// ============================================
// Pagination Helpers
// ============================================

/**
 * 計算分頁偏移量
 * @param page 當前頁碼（從 1 開始）
 * @param limit 每頁筆數
 * @returns 偏移量
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit
}

/**
 * 建構分頁參數
 * @param options 分頁選項
 * @returns 包含 limit 和 offset 的物件
 */
export function buildPaginationParams(options?: {
  page?: number
  limit?: number
}): { limit: number; offset: number } {
  const { page = 1, limit = PAGINATION.DEFAULT_PAGE_SIZE } = options || {}
  return {
    limit,
    offset: calculateOffset(page, limit)
  }
}

/**
 * 計算總頁數
 * @param totalCount 總筆數
 * @param limit 每頁筆數
 * @returns 總頁數
 */
export function calculateTotalPages(totalCount: number, limit: number): number {
  return Math.ceil(totalCount / limit)
}

// ============================================
// Filter Helpers
// ============================================

/** 過濾器運算子類型 */
export type FilterOperator =
  | '_eq'      // 等於
  | '_neq'     // 不等於
  | '_lt'      // 小於
  | '_lte'     // 小於等於
  | '_gt'      // 大於
  | '_gte'     // 大於等於
  | '_in'      // 在列表中
  | '_nin'     // 不在列表中
  | '_contains'    // 包含（區分大小寫）
  | '_icontains'   // 包含（不區分大小寫）
  | '_starts_with' // 開頭為
  | '_ends_with'   // 結尾為
  | '_null'        // 是否為 null
  | '_nnull'       // 是否不為 null
  | '_between'     // 介於

/** 過濾器配置 */
export interface FilterConfig {
  /** 欄位名稱 */
  field: string
  /** 值 */
  value: unknown
  /** 運算子（預設 _eq） */
  operator?: FilterOperator
  /** 值轉換函數 */
  transform?: (value: unknown) => unknown
}

/**
 * 建構過濾器物件
 *
 * @param configs 過濾器配置陣列
 * @returns API 過濾器物件
 *
 * @example
 * const filter = buildFilter([
 *   { field: 'branch_id', value: branchId },
 *   { field: 'status', value: 'ACTIVE' },
 *   { field: 'created_at', value: '2024-01-01', operator: '_gte' }
 * ])
 */
export function buildFilter(
  configs: FilterConfig[]
): Record<string, unknown> {
  const filter: Record<string, unknown> = {}

  for (const { field, value, operator = '_eq', transform } of configs) {
    // 跳過空值
    if (value === undefined || value === null || value === '') {
      continue
    }

    // 應用轉換函數
    const finalValue = transform ? transform(value) : value

    // 設定過濾條件
    filter[field] = { [operator]: finalValue }
  }

  return filter
}

/**
 * 建構搜尋過濾器（OR 條件）
 *
 * @param search 搜尋關鍵字
 * @param fields 要搜尋的欄位列表
 * @param operator 運算子（預設 _icontains，不區分大小寫）
 * @returns OR 過濾器物件，如果 search 為空則返回 undefined
 *
 * @example
 * const searchFilter = buildSearchFilter('john', ['full_name', 'email', 'phone'])
 * // 結果: { _or: [{ full_name: { _icontains: 'john' } }, { email: { _icontains: 'john' } }, ...] }
 */
export function buildSearchFilter(
  search: string | undefined,
  fields: string[],
  operator: FilterOperator = '_icontains'
): Record<string, unknown> | undefined {
  if (!search || !search.trim()) {
    return undefined
  }

  const trimmedSearch = search.trim()

  return {
    _or: fields.map((field) => ({
      [field]: { [operator]: trimmedSearch }
    }))
  }
}

/**
 * 合併多個過濾器物件
 *
 * @param filters 過濾器物件陣列
 * @returns 合併後的過濾器物件
 *
 * @example
 * const filter = mergeFilters(
 *   buildFilter([{ field: 'status', value: 'ACTIVE' }]),
 *   buildSearchFilter('john', ['name', 'email'])
 * )
 */
export function mergeFilters(
  ...filters: (Record<string, unknown> | undefined)[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const filter of filters) {
    if (filter) {
      Object.assign(result, filter)
    }
  }

  return result
}

// ============================================
// Date Range Helpers
// ============================================

/**
 * 建構日期範圍過濾器
 *
 * @param field 日期欄位名稱
 * @param startDate 開始日期
 * @param endDate 結束日期
 * @returns 日期範圍過濾器
 */
export function buildDateRangeFilter(
  field: string,
  startDate?: string,
  endDate?: string
): Record<string, unknown> {
  const filter: Record<string, unknown> = {}

  if (startDate) {
    filter[field] = { ...filter[field] as object, _gte: startDate }
  }

  if (endDate) {
    filter[field] = { ...filter[field] as object, _lte: endDate }
  }

  return filter
}

/**
 * 取得今日日期範圍
 * @returns 包含 start 和 end 的日期字串
 */
export function getTodayRange(): { start: string; end: string } {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]
  return { start: dateStr, end: dateStr }
}

/**
 * 取得本週日期範圍
 * @returns 包含 start 和 end 的日期字串
 */
export function getThisWeekRange(): { start: string; end: string } {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - dayOfWeek)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)

  return {
    start: startOfWeek.toISOString().split('T')[0],
    end: endOfWeek.toISOString().split('T')[0]
  }
}

/**
 * 取得本月日期範圍
 * @returns 包含 start 和 end 的日期字串
 */
export function getThisMonthRange(): { start: string; end: string } {
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  return {
    start: startOfMonth.toISOString().split('T')[0],
    end: endOfMonth.toISOString().split('T')[0]
  }
}

// ============================================
// Sort Helpers
// ============================================

/** 排序方向 */
export type SortDirection = 'asc' | 'desc'

/**
 * 建構排序參數
 *
 * @param field 排序欄位
 * @param direction 排序方向
 * @returns 排序字串
 */
export function buildSortParam(
  field: string,
  direction: SortDirection = 'asc'
): string {
  return direction === 'desc' ? `-${field}` : field
}

/**
 * 建構多欄位排序參數
 *
 * @param sorts 排序配置陣列
 * @returns 排序字串陣列
 */
export function buildMultiSortParams(
  sorts: Array<{ field: string; direction?: SortDirection }>
): string[] {
  return sorts.map(({ field, direction = 'asc' }) =>
    buildSortParam(field, direction)
  )
}
