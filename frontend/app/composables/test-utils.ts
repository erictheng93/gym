import { vi } from 'vitest'

/**
 * 测试工具 - 用于 composables 单元测试的 mock 辅助函数
 */

// State store for mocking Nuxt's useState
const stateStore = new Map()

// Mock functions
export const mockDirectus = {
  login: vi.fn(),
  logout: vi.fn(),
  request: vi.fn()
}

export const mockNavigateTo = vi.fn()

// Mock useState
export const mockUseState = vi.fn((key: string, init: () => any) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init() })
  }
  return stateStore.get(key)!
})

// Mock computed
export const mockComputed = vi.fn((fn: () => any) => {
  return {
    get value() {
      return fn()
    }
  }
})

// Setup all global mocks
export function setupGlobalMocks() {
  vi.stubGlobal('useState', mockUseState)
  vi.stubGlobal('computed', mockComputed)
  vi.stubGlobal('navigateTo', mockNavigateTo)
}

// Clear all mocks and state
export function clearAllMocks() {
  stateStore.clear()
  vi.clearAllMocks()
}

// Reset state store
export function resetStateStore() {
  stateStore.clear()
}
