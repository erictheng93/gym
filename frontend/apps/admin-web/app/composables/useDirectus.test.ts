import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDirectus } from './useDirectus'

describe('useDirectus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('取得 Directus 實例', () => {
    it('應該返回 Directus 實例', () => {
      const mockDirectus = {
        login: vi.fn(),
        logout: vi.fn(),
        request: vi.fn()
      }

      vi.stubGlobal('useNuxtApp', () => ({
        $directus: mockDirectus
      }))

      const directus = useDirectus()

      expect(directus).toBe(mockDirectus)
      expect(directus).toHaveProperty('login')
      expect(directus).toHaveProperty('logout')
      expect(directus).toHaveProperty('request')
    })

    it('應該在多次調用時返回相同的實例', () => {
      const mockDirectus = {
        login: vi.fn(),
        logout: vi.fn(),
        request: vi.fn()
      }

      vi.stubGlobal('useNuxtApp', () => ({
        $directus: mockDirectus
      }))

      const directus1 = useDirectus()
      const directus2 = useDirectus()

      expect(directus1).toBe(directus2)
      expect(directus1).toBe(mockDirectus)
    })
  })
})
