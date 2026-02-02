/**
 * Vitest Test Setup
 * 为 Nuxt composables 测试提供必要的全局 mocks
 */

import { vi, beforeEach } from 'vitest'

// State management mock
const stateStore = new Map<string, { value: any }>()

// Mock Nuxt's useState
global.useState = vi.fn((key: string, init?: () => any) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
}) as any

// Mock Nuxt's computed
global.computed = vi.fn((getter: () => any) => {
  return {
    get value() {
      return getter()
    },
    set value(_val: any) {
      // Computed values are read-only in most cases
    }
  }
}) as any

// Mock navigateTo
global.navigateTo = vi.fn() as any

// Reset state between tests
beforeEach(() => {
  stateStore.clear()
  vi.clearAllMocks()
})
