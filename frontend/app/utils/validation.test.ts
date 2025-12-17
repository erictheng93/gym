import { describe, it, expect } from 'vitest'
import { isValidUUID, validateUUIDParam } from './validation'

describe('validation utils', () => {
  describe('isValidUUID', () => {
    it('應該驗證通過有效的 UUID v4', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'c9bf9e57-1685-4c89-bafb-ff5af830be8a',
        '123e4567-e89b-42d3-a456-426614174000',
      ]

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true)
      })
    })

    it('應該驗證失敗無效的 UUID', () => {
      const invalidUUIDs = [
        '', // 空字串
        'not-a-uuid',
        '550e8400-e29b-11d4-a716-446655440000', // 不是 v4
        '550e8400-e29b-41d4-a716', // 不完整
        '550e8400-e29b-41d4-a716-446655440000-extra', // 多餘字符
        '550e8400e29b41d4a716446655440000', // 缺少連字符
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
