/**
 * 驗證工具函數
 */

// UUID 正則表達式
// 通用 UUID 格式 (v1-v5 皆可) - PostgreSQL uuid 類型接受任何有效 UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// 嚴格的 UUID v4 格式
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 驗證是否為有效的 UUID 格式（接受任何版本）
 * PostgreSQL 的 uuid 類型接受任何有效的 UUID 格式
 * @param value - 要驗證的字串
 * @returns boolean
 */
export const isValidUUID = (value: string): boolean => {
  if (!value || typeof value !== 'string') return false
  return UUID_REGEX.test(value)
}

/**
 * 驗證是否為有效的 UUID v4 格式（嚴格模式）
 * @param value - 要驗證的字串
 * @returns boolean
 */
export const isValidUUIDv4 = (value: string): boolean => {
  if (!value || typeof value !== 'string') return false
  return UUID_V4_REGEX.test(value)
}

/**
 * Nuxt 路由驗證函數 - 驗證 UUID 參數
 * @param paramName - 路由參數名稱
 * @param strict - 是否使用嚴格的 UUID v4 驗證（預設 false）
 * @returns validate 函數
 */
export const validateUUIDParam = (paramName: string, strict = false) => {
  return (route: { params: Record<string, string | string[]> }) => {
    const param = route.params[paramName]
    if (typeof param !== 'string') return false
    return strict ? isValidUUIDv4(param) : isValidUUID(param)
  }
}
