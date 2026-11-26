import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockWatch } from '@test/setup'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  let systemPrefersDark = false
  let mediaListener: (() => void) | undefined
  const removeEventListener = vi.fn()
  let setAttributeSpy: ReturnType<typeof vi.spyOn>
  let onUnmountedCallbacks: Array<() => void>

  beforeEach(() => {
    systemPrefersDark = false
    mediaListener = undefined
    removeEventListener.mockClear()
    onUnmountedCallbacks = []

    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({
      get matches() {
        return systemPrefersDark
      },
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        mediaListener = cb
      }),
      removeEventListener
    }) as unknown as MediaQueryList)
    setAttributeSpy = vi.spyOn(document.documentElement, 'setAttribute')
    vi.stubGlobal('onUnmounted', (cb: () => void) => {
      onUnmountedCallbacks.push(cb)
    })

    // useState is a process-wide store in the test setup; reset to the default.
    useTheme().setTheme('dark')
    setAttributeSpy.mockClear()
    mockWatch.mockClear()
    onUnmountedCallbacks = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('isDark / theme', () => {
    it('should follow the system preference when theme is system', () => {
      const { isDark, theme, setTheme } = useTheme()
      setTheme('system')

      systemPrefersDark = true
      expect(isDark.value).toBe(true)
      expect(theme.value).toBe('dark')

      systemPrefersDark = false
      expect(isDark.value).toBe(false)
      expect(theme.value).toBe('light')
    })

    it('should ignore the system preference when theme is explicit', () => {
      const { isDark, theme, setTheme } = useTheme()

      systemPrefersDark = true
      setTheme('light')
      expect(isDark.value).toBe(false)
      expect(theme.value).toBe('light')

      systemPrefersDark = false
      setTheme('dark')
      expect(isDark.value).toBe(true)
      expect(theme.value).toBe('dark')
    })
  })

  describe('setTheme', () => {
    it.each(['light', 'dark', 'system'] as const)('should set theme to %s', (value) => {
      const { userTheme, setTheme } = useTheme()
      setTheme(value)
      expect(userTheme.value).toBe(value)
    })

    it('should share the theme between instances', () => {
      useTheme().setTheme('light')
      expect(useTheme().userTheme.value).toBe('light')
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
      const { userTheme, toggleTheme } = useTheme()
      toggleTheme()
      expect(userTheme.value).toBe('light')
    })

    it('should switch from system to light when system prefers dark', () => {
      systemPrefersDark = true
      const { userTheme, setTheme, toggleTheme } = useTheme()
      setTheme('system')
      toggleTheme()
      expect(userTheme.value).toBe('light')
    })

    it('should switch from system to dark when system prefers light', () => {
      systemPrefersDark = false
      const { userTheme, setTheme, toggleTheme } = useTheme()
      setTheme('system')
      toggleTheme()
      expect(userTheme.value).toBe('dark')
    })
  })

  describe('applying theme to the document', () => {
    it('should set data-theme on mount from the current theme', () => {
      useTheme().setTheme('light')
      setAttributeSpy.mockClear()

      useTheme()

      expect(setAttributeSpy).toHaveBeenCalledWith('data-theme', 'light')
    })

    it('should resolve system theme to the system preference on mount', () => {
      systemPrefersDark = true
      useTheme().setTheme('system')
      setAttributeSpy.mockClear()

      useTheme()

      expect(setAttributeSpy).toHaveBeenCalledWith('data-theme', 'dark')
    })

    it('should re-apply data-theme when the user theme changes', () => {
      const { setTheme } = useTheme()
      const [source, applyTheme] = mockWatch.mock.calls.at(-1)!
      expect(source.value).toBe('dark')

      setTheme('light')
      setAttributeSpy.mockClear()
      applyTheme()

      expect(setAttributeSpy).toHaveBeenCalledWith('data-theme', 'light')
    })

    it('should re-apply data-theme when the system preference changes', () => {
      const { setTheme } = useTheme()
      setTheme('system')
      setAttributeSpy.mockClear()
      expect(mediaListener).toBeDefined()

      systemPrefersDark = true
      mediaListener!()

      expect(setAttributeSpy).toHaveBeenCalledWith('data-theme', 'dark')
    })

    it('should remove the media query listener on unmount', () => {
      useTheme()
      expect(onUnmountedCallbacks).toHaveLength(1)

      onUnmountedCallbacks[0]!()

      expect(removeEventListener).toHaveBeenCalledWith('change', mediaListener)
    })
  })
})
