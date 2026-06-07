// -nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  let matchMediaMock: any
  let documentElementMock: any

  beforeEach(() => {
    // Mock window.matchMedia
    matchMediaMock = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    global.window = {
      matchMedia: vi.fn(() => matchMediaMock),
    } as any

    // Mock document.documentElement
    documentElementMock = {
      setAttribute: vi.fn(),
    }
    global.document = {
      documentElement: documentElementMock,
    } as any

    // Mock import.meta.server
    ;(global as any).import = {
      meta: { server: false },
    }
  })

  describe('theme initialization', () => {
    it('should initialize with dark theme by default', () => {
      const { userTheme } = useTheme()
      expect(userTheme.value).toBe('dark')
    })

    it('should return dark theme on server', () => {
      ;(global as any).import = {
        meta: { server: true },
      }

      const { isDark, theme } = useTheme()
      expect(isDark.value).toBe(true)
      expect(theme.value).toBe('dark')
    })
  })

  describe('isDark computed', () => {
    it('should detect dark mode from system preference when theme is system', () => {
      matchMediaMock.matches = true
      const { isDark, setTheme } = useTheme()
      setTheme('system')
      expect(isDark.value).toBe(true)
    })

    it('should detect light mode from system preference when theme is system', () => {
      matchMediaMock.matches = false
      const { isDark, setTheme } = useTheme()
      setTheme('system')
      expect(isDark.value).toBe(false)
    })

    it('should return true when userTheme is dark', () => {
      const { isDark, setTheme } = useTheme()
      setTheme('dark')
      expect(isDark.value).toBe(true)
    })

    it('should return false when userTheme is light', () => {
      const { isDark, setTheme } = useTheme()
      setTheme('light')
      expect(isDark.value).toBe(false)
    })
  })

  describe('theme computed', () => {
    it('should return "dark" when isDark is true', () => {
      matchMediaMock.matches = true
      const { theme, setTheme } = useTheme()
      setTheme('system')
      expect(theme.value).toBe('dark')
    })

    it('should return "light" when isDark is false', () => {
      matchMediaMock.matches = false
      const { theme, setTheme } = useTheme()
      setTheme('system')
      expect(theme.value).toBe('light')
    })
  })

  describe('setTheme', () => {
    it('should set theme to light', () => {
      const { userTheme, setTheme } = useTheme()
      setTheme('light')
      expect(userTheme.value).toBe('light')
    })

    it('should set theme to dark', () => {
      const { userTheme, setTheme } = useTheme()
      setTheme('dark')
      expect(userTheme.value).toBe('dark')
    })

    it('should set theme to system', () => {
      const { userTheme, setTheme } = useTheme()
      setTheme('dark')
      setTheme('system')
      expect(userTheme.value).toBe('system')
    })
  })

  describe('toggleTheme', () => {
    it('should toggle from light to dark', () => {
      const { userTheme, setTheme, toggleTheme } = useTheme()
      setTheme('light')
      toggleTheme()
      expect(userTheme.value).toBe('dark')
    })

    it('should toggle from dark to light', () => {
      const { userTheme, setTheme, toggleTheme } = useTheme()
      setTheme('dark')
      toggleTheme()
      expect(userTheme.value).toBe('light')
    })

    it('should switch from system to light when system prefers dark', () => {
      matchMediaMock.matches = true
      const { userTheme, setTheme, toggleTheme } = useTheme()
      setTheme('system')
      expect(userTheme.value).toBe('system')
      toggleTheme()
      expect(userTheme.value).toBe('light')
    })

    it('should switch from system to dark when system prefers light', () => {
      matchMediaMock.matches = false
      const { userTheme, setTheme, toggleTheme } = useTheme()
      setTheme('system')
      expect(userTheme.value).toBe('system')
      toggleTheme()
      expect(userTheme.value).toBe('dark')
    })
  })
})
