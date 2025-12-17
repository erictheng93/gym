/**
 * 驗證工具函數
 */

/**
 * 驗證是否為有效的 UUID v4 格式
 * @param value - 要驗證的字串
 * @returns boolean
 */
export const isValidUUID = (value: string): boolean => {
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidV4Regex.test(value)
}

/**
 * Nuxt 路由驗證函數 - 驗證 UUID 參數
 * @param paramName - 路由參數名稱
 * @returns validate 函數
 */
export const validateUUIDParam = (paramName: string) => {
  return (route: { params: Record<string, string | string[]> }) => {
    const param = route.params[paramName]
    if (typeof param !== 'string') return false
    return isValidUUID(param)
  }
}
