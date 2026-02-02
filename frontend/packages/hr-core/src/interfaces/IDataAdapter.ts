/**
 * 通用數據適配器接口
 * 抽象底層數據源（REST API、GraphQL 等）
 */

/**
 * 通用查詢過濾器
 */
export interface IQueryFilter {
  /** 等於 */
  _eq?: unknown
  /** 不等於 */
  _neq?: unknown
  /** 大於 */
  _gt?: unknown
  /** 大於等於 */
  _gte?: unknown
  /** 小於 */
  _lt?: unknown
  /** 小於等於 */
  _lte?: unknown
  /** 包含於列表 */
  _in?: unknown[]
  /** 不包含於列表 */
  _nin?: unknown[]
  /** 為 null */
  _null?: boolean
  /** 模糊匹配 */
  _contains?: string
  /** 開頭匹配 */
  _starts_with?: string
  /** 結尾匹配 */
  _ends_with?: string
  /** AND 條件組 */
  _and?: IQueryFilter[]
  /** OR 條件組 */
  _or?: IQueryFilter[]
}

/**
 * 查詢選項
 */
export interface IQueryOptions<T = unknown> {
  /** 過濾條件 */
  filter?: Record<string, IQueryFilter>
  /** 排序 */
  sort?: string[]
  /** 返回數量限制 */
  limit?: number
  /** 跳過數量 */
  offset?: number
  /** 要返回的字段 */
  fields?: (keyof T | string)[]
}

/**
 * 分頁結果
 */
export interface IPaginatedResult<T> {
  /** 數據列表 */
  data: T[]
  /** 總數量 */
  total: number
  /** 當前頁碼 */
  page: number
  /** 每頁數量 */
  limit: number
  /** 總頁數 */
  totalPages: number
}

/**
 * 聚合選項
 */
export interface IAggregateOptions {
  /** 計數 */
  count?: '*' | string
  /** 合計 */
  sum?: string[]
  /** 平均值 */
  avg?: string[]
  /** 最大值 */
  max?: string[]
  /** 最小值 */
  min?: string[]
}

/**
 * 通用數據適配器接口
 * @template T 實體類型
 */
export interface IDataAdapter<T> {
  /**
   * 根據 ID 查詢單一記錄
   */
  findById(id: string, fields?: string[]): Promise<T | null>

  /**
   * 查詢多筆記錄
   */
  findMany(options?: IQueryOptions<T>): Promise<T[]>

  /**
   * 分頁查詢
   */
  findPaginated(
    page: number,
    limit: number,
    options?: Omit<IQueryOptions<T>, 'limit' | 'offset'>
  ): Promise<IPaginatedResult<T>>

  /**
   * 創建記錄
   */
  create(data: Partial<T>): Promise<T>

  /**
   * 更新記錄
   */
  update(id: string, data: Partial<T>): Promise<T>

  /**
   * 刪除記錄
   */
  delete(id: string): Promise<void>

  /**
   * 聚合查詢
   */
  aggregate(
    aggregate: IAggregateOptions,
    filter?: Record<string, IQueryFilter>
  ): Promise<Record<string, number | null>[]>
}

/**
 * 批量操作適配器擴展
 */
export interface IBatchDataAdapter<T> extends IDataAdapter<T> {
  /**
   * 批量創建
   */
  createMany(data: Partial<T>[]): Promise<T[]>

  /**
   * 批量更新
   */
  updateMany(ids: string[], data: Partial<T>): Promise<T[]>

  /**
   * 批量刪除
   */
  deleteMany(ids: string[]): Promise<void>
}
