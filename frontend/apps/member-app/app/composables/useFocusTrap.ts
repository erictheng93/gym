/**
 * useFocusTrap composable
 * Implements focus trap for modal dialogs and other overlay components
 * Ensures keyboard navigation stays within the trapped element
 */

export interface FocusTrapOptions {
  /** Initial element to focus when trap activates */
  initialFocus?: HTMLElement | null
  /** Element to restore focus to when trap deactivates */
  returnFocus?: HTMLElement | null
  /** Allow escape key to close (triggers onEscape callback) */
  escapeDeactivates?: boolean
  /** Callback when escape is pressed */
  onEscape?: () => void
  /** Callback when clicking outside the trapped element */
  onClickOutside?: () => void
  /** Whether clicking outside should close the trap */
  clickOutsideDeactivates?: boolean
}

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export const useFocusTrap = () => {
  const trapElement = ref<HTMLElement | null>(null)
  const isActive = ref(false)
  const previouslyFocused = ref<HTMLElement | null>(null)
  const options = ref<FocusTrapOptions>({})

  /**
   * Get all focusable elements within the trap
   */
  const getFocusableElements = (): HTMLElement[] => {
    if (!trapElement.value) return []
    return Array.from(
      trapElement.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el) => el.offsetParent !== null) // Filter out hidden elements
  }

  /**
   * Handle keyboard events for focus trap
   */
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isActive.value || !trapElement.value) return

    if (event.key === 'Escape' && options.value.escapeDeactivates !== false) {
      event.preventDefault()
      options.value.onEscape?.()
      return
    }

    if (event.key !== 'Tab') return

    const focusableElements = getFocusableElements()
    if (focusableElements.length === 0) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (!firstElement || !lastElement) return

    // Shift + Tab at first element -> go to last
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
      return
    }

    // Tab at last element -> go to first
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
      return
    }
  }

  /**
   * Handle click events for outside click detection
   */
  const handleClick = (event: MouseEvent) => {
    if (!isActive.value || !trapElement.value) return

    const target = event.target as Node
    if (!trapElement.value.contains(target)) {
      options.value.onClickOutside?.()
    }
  }

  /**
   * Activate the focus trap
   */
  const activate = (element: HTMLElement, trapOptions: FocusTrapOptions = {}) => {
    if (typeof document === 'undefined') return

    trapElement.value = element
    options.value = trapOptions

    // Store the currently focused element to restore later
    previouslyFocused.value = document.activeElement as HTMLElement

    isActive.value = true

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown)
    if (trapOptions.clickOutsideDeactivates) {
      document.addEventListener('click', handleClick, true)
    }

    // Focus the initial element or the first focusable element
    nextTick(() => {
      const initialFocus = trapOptions.initialFocus
      if (initialFocus) {
        initialFocus.focus()
      } else {
        const focusableElements = getFocusableElements()
        const firstFocusable = focusableElements[0]
        if (firstFocusable) {
          firstFocusable.focus()
        } else {
          // If no focusable elements, focus the container itself
          trapElement.value?.focus()
        }
      }
    })
  }

  /**
   * Deactivate the focus trap
   */
  const deactivate = () => {
    if (!isActive.value) return

    isActive.value = false

    // Remove event listeners
    document.removeEventListener('keydown', handleKeyDown)
    document.removeEventListener('click', handleClick, true)

    // Restore focus to the previously focused element
    const returnFocus = options.value.returnFocus ?? previouslyFocused.value
    if (returnFocus && typeof returnFocus.focus === 'function') {
      nextTick(() => {
        returnFocus.focus()
      })
    }

    trapElement.value = null
    options.value = {}
  }

  /**
   * Update focus trap options
   */
  const updateOptions = (newOptions: Partial<FocusTrapOptions>) => {
    options.value = { ...options.value, ...newOptions }
  }

  // Clean up on unmount
  onUnmounted(() => {
    deactivate()
  })

  return {
    trapElement,
    isActive,
    activate,
    deactivate,
    updateOptions,
    getFocusableElements,
  }
}
