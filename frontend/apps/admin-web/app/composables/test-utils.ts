import { vi } from 'vitest'

/**
 * 测试工具 - 用于 composables 单元测试的 mock 辅助函数
 */

// State store for mocking Nuxt's useState
const stateStore = new Map()

// Mock functions
export const mockApi = {
  login: vi.fn(),
  logout: vi.fn(),
  request: vi.fn()
}

export const mockNavigateTo = vi.fn()

// Mock Toast
export const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn()
}

// Mock Error Handler
export const mockHandleError = vi.fn()

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
  vi.stubGlobal('useToast', () => mockToast)
  vi.stubGlobal('useErrorHandler', () => ({ handleError: mockHandleError }))
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
