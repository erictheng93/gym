import { describe, it, expect } from 'vitest'
import { isValidUUID, isValidUUIDv4, validateUUIDParam } from './validation'

describe('validation utils', () => {
  describe('isValidUUID', () => {
    it('應該驗證通過任何有效的 UUID 格式', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000', // v4
        'c9bf9e57-1685-4c89-bafb-ff5af830be8a', // v4
        '123e4567-e89b-42d3-a456-426614174000', // v4
        '550e8400-e29b-11d4-a716-446655440000', // v1 (也是有效 UUID)
        'b1000001-0001-0001-0001-000000000001', // 自訂格式 (有效 UUID 結構)
      ]

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true)
      })
    })

    it('應該驗證失敗無效的 UUID', () => {
      const invalidUUIDs = [
        '', // 空字串
        'not-a-uuid',
        '550e8400-e29b-41d4-a716', // 不完整
        '550e8400-e29b-41d4-a716-446655440000-extra', // 多餘字符
        '550e8400e29b41d4a716446655440000', // 缺少連字符
        'gggggggg-gggg-gggg-gggg-gggggggggggg', // 無效字符
      ]

      invalidUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(false)
      })
    })

    it('應該不區分大小寫', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      expect(isValidUUID(uuid.toUpperCase())).toBe(true)
      expect(isValidUUID(uuid.toLowerCase())).toBe(true)
    })

    it('應該處理 null 和 undefined', () => {
      expect(isValidUUID(null as unknown as string)).toBe(false)
      expect(isValidUUID(undefined as unknown as string)).toBe(false)
    })
  })

  describe('isValidUUIDv4', () => {
    it('應該驗證通過有效的 UUID v4', () => {
      const validUUIDv4s = [
        '550e8400-e29b-41d4-a716-446655440000',
        'c9bf9e57-1685-4c89-bafb-ff5af830be8a',
        '123e4567-e89b-42d3-a456-426614174000',
      ]

      validUUIDv4s.forEach(uuid => {
        expect(isValidUUIDv4(uuid)).toBe(true)
      })
    })

    it('應該驗證失敗非 v4 的 UUID', () => {
      const nonV4UUIDs = [
        '550e8400-e29b-11d4-a716-446655440000', // v1 (第三段以 1 開頭)
        'b1000001-0001-0001-0001-000000000001', // 自訂格式
        '550e8400-e29b-51d4-a716-446655440000', // v5 (第三段以 5 開頭)
      ]

      nonV4UUIDs.forEach(uuid => {
        expect(isValidUUIDv4(uuid)).toBe(false)
      })
    })

    it('應該驗證第四段的變體標識', () => {
      // v4 的第四段必須以 8, 9, a, 或 b 開頭
      expect(isValidUUIDv4('550e8400-e29b-41d4-8716-446655440000')).toBe(true)
      expect(isValidUUIDv4('550e8400-e29b-41d4-9716-446655440000')).toBe(true)
      expect(isValidUUIDv4('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      expect(isValidUUIDv4('550e8400-e29b-41d4-b716-446655440000')).toBe(true)
      // 無效的變體標識
      expect(isValidUUIDv4('550e8400-e29b-41d4-0716-446655440000')).toBe(false)
      expect(isValidUUIDv4('550e8400-e29b-41d4-7716-446655440000')).toBe(false)
    })

    it('應該不區分大小寫', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      expect(isValidUUIDv4(uuid.toUpperCase())).toBe(true)
      expect(isValidUUIDv4(uuid.toLowerCase())).toBe(true)
    })
  })

  describe('validateUUIDParam', () => {
    it('應該驗證通過有效的路由參數', () => {
      const validator = validateUUIDParam('id')
      const route = {
        params: {
          id: '550e8400-e29b-41d4-a716-446655440000'
        }
      }
      expect(validator(route)).toBe(true)
    })

    it('應該驗證通過非 v4 格式的 UUID（寬鬆模式）', () => {
      const validator = validateUUIDParam('id') // 預設寬鬆模式
      const route = {
        params: {
          id: 'b1000001-0001-0001-0001-000000000001'
        }
      }
      expect(validator(route)).toBe(true)
    })

    it('應該在嚴格模式下驗證失敗非 v4 UUID', () => {
      const validator = validateUUIDParam('id', true) // 嚴格模式
      const route = {
        params: {
          id: 'b1000001-0001-0001-0001-000000000001'
        }
      }
      expect(validator(route)).toBe(false)
    })

    it('應該驗證失敗無效的路由參數', () => {
      const validator = validateUUIDParam('id')
      const route = {
        params: {
          id: 'invalid-uuid'
        }
      }
      expect(validator(route)).toBe(false)
    })

    it('應該驗證失敗非字串類型的參數', () => {
      const validator = validateUUIDParam('id')
      const route = {
        params: {
          id: ['550e8400-e29b-41d4-a716-446655440000']
        }
      }
      expect(validator(route)).toBe(false)
    })

    it('應該驗證失敗缺少的參數', () => {
      const validator = validateUUIDParam('id')
      const route = {
        params: {}
      }
      expect(validator(route)).toBe(false)
    })

    it('應該可以驗證不同的參數名稱', () => {
      const validator = validateUUIDParam('userId')
      const route = {
        params: {
          userId: '550e8400-e29b-41d4-a716-446655440000'
        }
      }
      expect(validator(route)).toBe(true)
    })
  })
})
