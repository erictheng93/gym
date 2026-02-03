/**
 * UUID 工具函數
 *
 * 採用 UUID v7 作為主要 ID 生成策略
 * - 時間有序：優化資料庫 B-tree 索引效能
 * - 全球唯一：支援分布式系統
 * - 不可預測：後 74 位隨機，確保安全性
 *
 * @see RFC 9562 - https://www.rfc-editor.org/rfc/rfc9562
 */

/**
 * 生成 UUID v7
 * 結構：TTTTTTTT-TTTT-7RRR-RRRR-RRRRRRRRRRRR
 *       48-bit timestamp | 4-bit version | 12-bit rand | 62-bit rand
 */
export function generateUUIDv7(): string {
  // 取得當前 Unix 毫秒時間戳
  const timestamp = Date.now()

  // 生成隨機位元組
  const randomBytes = new Uint8Array(10)
  crypto.getRandomValues(randomBytes)

  // 構建 UUID bytes (16 bytes total)
  const bytes = new Uint8Array(16)

  // 前 6 bytes: 48-bit timestamp (big-endian)
  bytes[0] = (timestamp / 2 ** 40) & 0xff
  bytes[1] = (timestamp / 2 ** 32) & 0xff
  bytes[2] = (timestamp / 2 ** 24) & 0xff
  bytes[3] = (timestamp / 2 ** 16) & 0xff
  bytes[4] = (timestamp / 2 ** 8) & 0xff
  bytes[5] = timestamp & 0xff

  // bytes[6-7]: 版本 7 + 12-bit 隨機
  bytes[6] = 0x70 | (randomBytes[0]! & 0x0f) // 版本 7
  bytes[7] = randomBytes[1]!

  // bytes[8]: 變體 (10xx xxxx) + 6-bit 隨機
  bytes[8] = 0x80 | (randomBytes[2]! & 0x3f) // 變體 RFC 9562

  // bytes[9-15]: 56-bit 隨機
  bytes[9] = randomBytes[3]!
  bytes[10] = randomBytes[4]!
  bytes[11] = randomBytes[5]!
  bytes[12] = randomBytes[6]!
  bytes[13] = randomBytes[7]!
  bytes[14] = randomBytes[8]!
  bytes[15] = randomBytes[9]!

  // 轉換為 UUID 字串格式
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * 從 UUID v7 提取時間戳
 * @param uuid UUID v7 字串
 * @returns Date 物件，若非 v7 則返回 null
 */
export function extractTimestampFromUUIDv7(uuid: string): Date | null {
  const hex = uuid.replace(/-/g, '')

  // 驗證是否為 UUID v7 (版本位 = 7)
  if (hex.charAt(12) !== '7') {
    return null
  }

  // 提取前 48 位作為時間戳
  const timestampHex = hex.slice(0, 12)
  const timestamp = parseInt(timestampHex, 16)

  return new Date(timestamp)
}

/**
 * 驗證是否為有效的 UUID v7
 */
export function isUUIDv7(uuid: string): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    return false
  }
  return true
}

/**
 * 比較兩個 UUID v7 的時間順序
 * @returns -1 (a < b), 0 (a = b), 1 (a > b)
 */
export function compareUUIDv7(a: string, b: string): number {
  // UUID v7 是字典序可比較的
  return a.localeCompare(b)
}

/**
 * 實體類型前綴（用於開發環境可讀性，生產環境不建議使用）
 */
export const ENTITY_PREFIXES = {
  MEMBER: 'MEM',
  EMPLOYEE: 'EMP',
  CONTRACT: 'CON',
  BRANCH: 'BRN',
  PAYMENT: 'PAY',
} as const

/**
 * 生成帶前綴的開發用 ID（僅用於種子資料和測試）
 * 格式：{PREFIX}-{UUID v7}
 * 注意：這不是標準 UUID，僅用於開發環境的可讀性
 */
export function generateDevId(entityType: keyof typeof ENTITY_PREFIXES): string {
  return `${ENTITY_PREFIXES[entityType]}-${generateUUIDv7()}`
}
