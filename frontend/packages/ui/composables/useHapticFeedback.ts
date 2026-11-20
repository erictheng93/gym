/**
 * Advanced Haptic Feedback Composable
 * Web Vibration API interface with automatic fallback and accessibility considerations.
 */

export type HapticIntensity = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'

const HAPTIC_PATTERNS: Record<HapticIntensity, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 25,
  heavy: 45,
  success: [15, 60, 25],
  warning: [30, 80, 20],
  error: [40, 60, 40, 60, 40],
}

export function useHapticFeedback() {
  const isSupported = typeof window !== 'undefined' && 'navigator' in window && typeof navigator.vibrate === 'function'

  const trigger = (type: HapticIntensity = 'light'): boolean => {
    if (!isSupported) return false

    // Respect user reduced-motion preference
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false
    }

    try {
      const pattern = HAPTIC_PATTERNS[type]
      return navigator.vibrate(pattern)
    } catch {
      return false
    }
  }

  return {
    isSupported,
    trigger,
    selection: () => trigger('selection'),
    light: () => trigger('light'),
    medium: () => trigger('medium'),
    heavy: () => trigger('heavy'),
    success: () => trigger('success'),
    warning: () => trigger('warning'),
    error: () => trigger('error'),
  }
}
