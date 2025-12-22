import { STORAGE_KEYS } from '~/constants'

export const useTheme = () => {
  const userTheme = useState<'light' | 'dark' | 'system'>(STORAGE_KEYS.THEME, () => 'light')

  const isDark = computed(() => {
    if (import.meta.server) {
      return false // Default to light on server
    }
    if (userTheme.value === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return userTheme.value === 'dark'
  })

  const theme = computed(() => isDark.value ? 'dark' : 'light')

  const setTheme = (newTheme: 'light' | 'dark' | 'system') => {
    userTheme.value = newTheme
  }

  const toggleTheme = () => {
    if (userTheme.value === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      userTheme.value = prefersDark ? 'light' : 'dark'
    } else {
      userTheme.value = userTheme.value === 'dark' ? 'light' : 'dark'
    }
  }

  // Apply theme to document (client-side only)
  onMounted(() => {
    const applyTheme = () => {
      const dark = userTheme.value === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : userTheme.value === 'dark'
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    }

    applyTheme()

    watch(userTheme, applyTheme)

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', applyTheme)
  })

  return {
    theme,
    isDark,
    userTheme,
    setTheme,
    toggleTheme
  }
}
