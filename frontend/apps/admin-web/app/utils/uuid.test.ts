// -nocheck
import { describe, it, expect, vi } from 'vitest'
import {
  generateUUIDv7,
  extractTimestampFromUUIDv7,
  isUUIDv7,
  compareUUIDv7,
  ENTITY_PREFIXES,
  generateDevId
} from './uuid'

describe('UUID v7 工具函數', () => {
  describe('generateUUIDv7', () => {
    it('應該生成有效的 UUID 格式', () => {
      const uuid = generateUUIDv7()
      // 標準 UUID 格式：8-4-4-4-12
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('應該生成版本 7 的 UUID', () => {
      const uuid = generateUUIDv7()
      // 第三段的第一個字符應該是 7
      expect(uuid.charAt(14)).toBe('7')
    })

    it('應該生成正確變體的 UUID', () => {
      const uuid = generateUUIDv7()
      // 第四段的第一個字符應該是 8, 9, a, 或 b
      const variant = uuid.charAt(19).toLowerCase()
      expect(['8', '9', 'a', 'b']).toContain(variant)
    })

    it('應該生成時間有序的 UUID', async () => {
      const uuid1 = generateUUIDv7()
      await new Promise(resolve => setTimeout(resolve, 10)) // 等待 10ms
      const uuid2 = generateUUIDv7()

      // UUID v7 應該按時間排序
      expect(uuid1 < uuid2).toBe(true)
    })

    it('應該生成唯一的 UUID', () => {
      const uuids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        uuids.add(generateUUIDv7())
      }
      expect(uuids.size).toBe(1000)
    })

    it('應該在相同毫秒內生成不同的 UUID', () => {
      // 快速連續生成多個 UUID
      const uuids: string[] = []
      for (let i = 0; i < 100; i++) {
        uuids.push(generateUUIDv7())
      }

      const uniqueUuids = new Set(uuids)
      expect(uniqueUuids.size).toBe(100)
    })
  })

  describe('extractTimestampFromUUIDv7', () => {
    it('應該從 UUID v7 正確提取時間戳', () => {
      const beforeGenerate = Date.now()
      const uuid = generateUUIDv7()
      const afterGenerate = Date.now()

      const extracted = extractTimestampFromUUIDv7(uuid)

      expect(extracted).not.toBeNull()
      expect(extracted!.getTime()).toBeGreaterThanOrEqual(beforeGenerate)
      expect(extracted!.getTime()).toBeLessThanOrEqual(afterGenerate)
    })

    it('應該對非 v7 UUID 返回 null', () => {
      // UUID v4
      const uuidV4 = '550e8400-e29b-41d4-a716-446655440000'
      expect(extractTimestampFromUUIDv7(uuidV4)).toBeNull()

      // UUID v1
      const uuidV1 = '550e8400-e29b-11d4-a716-446655440000'
      expect(extractTimestampFromUUIDv7(uuidV1)).toBeNull()
    })

    it('應該正確處理特定時間戳', () => {
      // 使用固定時間測試
      const fixedTime = new Date('2024-01-15T12:30:00.000Z').getTime()

      vi.useFakeTimers()
      vi.setSystemTime(fixedTime)

      const uuid = generateUUIDv7()
      const extracted = extractTimestampFromUUIDv7(uuid)

      expect(extracted).not.toBeNull()
      expect(extracted!.getTime()).toBe(fixedTime)

      vi.useRealTimers()
    })
  })

  describe('isUUIDv7', () => {
    it('應該驗證有效的 UUID v7', () => {
      const uuid = generateUUIDv7()
      expect(isUUIDv7(uuid)).toBe(true)
    })

    it('應該拒絕 UUID v4', () => {
      const uuidV4 = '550e8400-e29b-41d4-a716-446655440000'
      expect(isUUIDv7(uuidV4)).toBe(false)
    })

    it('應該拒絕無效的 UUID 格式', () => {
      expect(isUUIDv7('not-a-uuid')).toBe(false)
      expect(isUUIDv7('')).toBe(false)
      expect(isUUIDv7('550e8400-e29b-71d4-0716-446655440000')).toBe(false) // 無效變體
    })

    it('應該不區分大小寫', () => {
      const uuid = generateUUIDv7()
      expect(isUUIDv7(uuid.toUpperCase())).toBe(true)
      expect(isUUIDv7(uuid.toLowerCase())).toBe(true)
    })
  })

  describe('compareUUIDv7', () => {
    it('應該正確比較時間順序', async () => {
      const uuid1 = generateUUIDv7()
      await new Promise(resolve => setTimeout(resolve, 10))
      const uuid2 = generateUUIDv7()

      expect(compareUUIDv7(uuid1, uuid2)).toBe(-1)
      expect(compareUUIDv7(uuid2, uuid1)).toBe(1)
      expect(compareUUIDv7(uuid1, uuid1)).toBe(0)
    })
  })

  describe('ENTITY_PREFIXES', () => {
    it('應該包含所有實體類型', () => {
      expect(ENTITY_PREFIXES.MEMBER).toBe('MEM')
      expect(ENTITY_PREFIXES.EMPLOYEE).toBe('EMP')
      expect(ENTITY_PREFIXES.CONTRACT).toBe('CON')
      expect(ENTITY_PREFIXES.BRANCH).toBe('BRN')
      expect(ENTITY_PREFIXES.PAYMENT).toBe('PAY')
    })
  })

  describe('generateDevId', () => {
    it('應該生成帶前綴的開發用 ID', () => {
      const memberId = generateDevId('MEMBER')
      expect(memberId).toMatch(/^MEM-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

      const employeeId = generateDevId('EMPLOYEE')
      expect(employeeId).toMatch(/^EMP-/)

      const contractId = generateDevId('CONTRACT')
      expect(contractId).toMatch(/^CON-/)
    })
  })
})
