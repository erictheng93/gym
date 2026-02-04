/**
 * 主題管理 Composable
 * 支援 Light / Dark / System 三種模式
 * 預設為 Dark 模式
 */

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'gym-nexus-theme'
const DEFAULT_THEME: ThemeMode = 'dark'

// Global state (shared across components)
const themeMode = ref<ThemeMode>(DEFAULT_THEME)
const resolvedTheme = ref<'light' | 'dark'>('dark')

export function useTheme() {
  const isClient = import.meta.client

  // Get system preference
  const getSystemTheme = (): 'light' | 'dark' => {
    if (!isClient) return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  // Resolve the actual theme based on mode
  const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
    if (mode === 'system') {
      return getSystemTheme()
    }
    return mode
  }

  // Apply theme to document
  const applyTheme = (theme: 'light' | 'dark') => {
    if (!isClient) return

    const root = document.documentElement

    // Remove existing theme classes
    root.classList.remove('theme-light', 'theme-dark')

    // Add new theme class
    root.classList.add(`theme-${theme}`)

    // Also set color-scheme for native elements
    root.style.colorScheme = theme

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff')
    }
  }

  // Set theme mode
  const setTheme = (mode: ThemeMode) => {
    themeMode.value = mode
    resolvedTheme.value = resolveTheme(mode)

    if (isClient) {
      localStorage.setItem(STORAGE_KEY, mode)
      applyTheme(resolvedTheme.value)
    }
  }

  // Initialize theme from storage or default
  const initTheme = () => {
    if (!isClient) return

    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    const mode = stored || DEFAULT_THEME

    themeMode.value = mode
    resolvedTheme.value = resolveTheme(mode)
    applyTheme(resolvedTheme.value)

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (themeMode.value === 'system') {
        resolvedTheme.value = getSystemTheme()
        applyTheme(resolvedTheme.value)
      }
    })
  }

  // Computed properties
  const isDark = computed(() => resolvedTheme.value === 'dark')
  const isLight = computed(() => resolvedTheme.value === 'light')
  const isSystem = computed(() => themeMode.value === 'system')

  return {
    themeMode: readonly(themeMode),
    resolvedTheme: readonly(resolvedTheme),
    isDark,
    isLight,
    isSystem,
    setTheme,
    initTheme,
  }
}
