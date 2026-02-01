/**
 * Vitest Global Setup
 * 为所有测试提供 Nuxt 运行时环境的 mocks
 */

import { vi } from 'vitest'
import * as Vue from 'vue'

// Mock useErrorHandler module - MUST be before other imports
export const mockHandleError = vi.fn()
export const mockErrorHandlerInstance = {
  handleError: mockHandleError,
  withErrorHandling: vi.fn(),
  createErrorBoundary: vi.fn(),
  parseError: vi.fn()
}

vi.mock('~/composables/core/useErrorHandler', () => ({
  useErrorHandler: () => mockErrorHandlerInstance
}))

// Mock useFetch module
export const mockFetchInstance = {
  apiFetch: vi.fn(),
  readItems: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  readItem: vi.fn().mockResolvedValue(null),
  createItem: vi.fn().mockResolvedValue(null),
  updateItem: vi.fn().mockResolvedValue(null),
  deleteItem: vi.fn().mockResolvedValue(true)
}

vi.mock('~/composables/core/useFetch', () => ({
  useFetch: () => mockFetchInstance
}))

import {
  useFormValidation,
  required,
  email,
  phone,
  pattern,
  minLength,
  maxLength,
  min,
  max,
  between,
  positive,
  dateNotFuture,
  dateNotPast,
  dateRange,
  phoneLength,
  arrayLength,
  taiwanId,
  taxId
} from './packages/ui/composables/useFormValidation'

// Make Vue composition API globally available (for Nuxt auto-imports)
Object.assign(globalThis, Vue)

// Make form validation composables globally available
Object.assign(globalThis, {
  useFormValidation,
  required,
  email,
  phone,
  pattern,
  minLength,
  maxLength,
  min,
  max,
  between,
  positive,
  dateNotFuture,
  dateNotPast,
  dateRange,
  phoneLength,
  arrayLength,
  taiwanId,
  taxId
})

// 创建全局状态存储
const globalStateStore = new Map<string, any>()

// Mock Nuxt's useState
export const mockUseState = <T>(key: string, init?: () => T): any => {
  if (!globalStateStore.has(key)) {
    const state = {
      _value: init ? init() : undefined,
      get value() {
        return this._value
      },
      set value(newValue: T) {
        this._value = newValue
      }
    }
    globalStateStore.set(key, state)
  }
  return globalStateStore.get(key)
}

// Mock Nuxt's computed
export const mockComputed = <T>(getter: () => T): any => {
  return {
    get value() {
      return getter()
    }
  }
}

// Mock Nuxt's watch
export const mockWatch = vi.fn()

// Mock Nuxt's onMounted
export const mockOnMounted = vi.fn((callback: () => void) => {
  // 在测试中立即执行回调
  if (typeof callback === 'function') {
    callback()
  }
})

// Mock navigateTo
export const mockNavigateTo = vi.fn().mockResolvedValue(undefined)

// Mock useRuntimeConfig
export const mockRuntimeConfig = {
  public: {
    apiBaseUrl: 'http://localhost:8056'
  }
}

// Mock global fetch for useAuthV2
export const mockGlobalFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true, data: null })
})

// Mock defineNuxtRouteMiddleware
export const mockDefineNuxtRouteMiddleware = (middleware: any) => middleware

// Mock Directus instance (global) - DEPRECATED, use mockFetchInstance instead
export const mockDirectusInstance = {
  login: vi.fn(),
  logout: vi.fn(),
  request: vi.fn()
}


// Mock useAuth (global) - for useHR tests
export const mockAuthUser = mockUseState('auth-user', () => ({ id: 'user-1' }))
export const mockAuthInstance = {
  user: mockAuthUser,
  currentEmployee: mockUseState('current-employee', () => null),
  isAuthenticated: mockComputed(() => !!mockAuthUser.value),
  isLoading: mockUseState('auth-loading', () => false),
  login: vi.fn(),
  logout: vi.fn(),
  fetchUser: vi.fn(),
  checkAuth: vi.fn()
}

// Mock useToast (global)
export const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn()
}

// useErrorHandler is mocked via vi.mock() at the top of this file

// 在全局作用域设置 mocks
globalThis.useState = mockUseState as any
globalThis.computed = mockComputed as any
globalThis.watch = mockWatch as any
globalThis.onMounted = mockOnMounted as any
globalThis.navigateTo = mockNavigateTo as any
globalThis.defineNuxtRouteMiddleware = mockDefineNuxtRouteMiddleware as any
globalThis.useRuntimeConfig = vi.fn(() => mockRuntimeConfig) as any
globalThis.useDirectus = vi.fn(() => mockDirectusInstance) as any
globalThis.useAuth = vi.fn(() => mockAuthInstance) as any
globalThis.useToast = vi.fn(() => mockToast) as any
globalThis.useErrorHandler = vi.fn(() => mockErrorHandlerInstance) as any
globalThis.fetch = mockGlobalFetch as any

// 清理函数
export function clearGlobalMocks() {
  globalStateStore.clear()
  mockNavigateTo.mockClear()
  mockWatch.mockClear()
  mockOnMounted.mockClear()
  mockDirectusInstance.login.mockClear()
  mockDirectusInstance.logout.mockClear()
  mockDirectusInstance.request.mockClear()
  // Clear useFetch mocks
  mockFetchInstance.apiFetch.mockClear()
  mockFetchInstance.readItems.mockClear().mockResolvedValue({ data: [], total: 0 })
  mockFetchInstance.readItem.mockClear().mockResolvedValue(null)
  mockFetchInstance.createItem.mockClear().mockResolvedValue(null)
  mockFetchInstance.updateItem.mockClear().mockResolvedValue(null)
  mockFetchInstance.deleteItem.mockClear().mockResolvedValue(true)
  mockAuthInstance.login.mockClear()
  mockAuthInstance.logout.mockClear()
  mockAuthInstance.fetchUser.mockClear()
  mockAuthInstance.checkAuth.mockClear()
  mockToast.success.mockClear()
  mockToast.error.mockClear()
  mockToast.warning.mockClear()
  mockToast.info.mockClear()
  mockHandleError.mockClear()
  // Reset auth user to default
  mockAuthUser.value = { id: 'user-1' }
  // Reset fetch mock
  mockGlobalFetch.mockClear().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: null })
  })
}

// 在每个测试前清理
beforeEach(() => {
  clearGlobalMocks()
  vi.clearAllMocks()
})
