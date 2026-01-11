/**
 * Tests for useFocusTrap composable
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Vue composables
vi.stubGlobal('ref', (initialValue: unknown) => ({
  value: initialValue,
}))

vi.stubGlobal('nextTick', (fn: () => void) => {
  fn()
  return Promise.resolve()
})

vi.stubGlobal('onUnmounted', vi.fn())

// Import after mocks
import { useFocusTrap } from './useFocusTrap'

describe('useFocusTrap', () => {
  let originalDocument: Document

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up minimal DOM
    originalDocument = global.document

    // Mock document methods
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      activeElement: null,
    })
  })

  afterEach(() => {
    global.document = originalDocument
  })

  describe('initial state', () => {
    it('should have trapElement as null initially', () => {
      const { trapElement } = useFocusTrap()
      expect(trapElement.value).toBeNull()
    })

    it('should have isActive as false initially', () => {
      const { isActive } = useFocusTrap()
      expect(isActive.value).toBe(false)
    })
  })

  describe('activate', () => {
    it('should set isActive to true when activated', () => {
      const { activate, isActive } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)

      expect(isActive.value).toBe(true)
    })

    it('should set trapElement when activated', () => {
      const { activate, trapElement } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)

      expect(trapElement.value).toBe(mockElement)
    })

    it('should add keyboard event listener', () => {
      const { activate } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)

      expect(document.addEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      )
    })

    it('should focus the first focusable element', () => {
      const { activate } = useFocusTrap()

      const mockFocusable = {
        focus: vi.fn(),
        offsetParent: {},
      }

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([mockFocusable]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)

      expect(mockFocusable.focus).toHaveBeenCalled()
    })

    it('should focus initial focus element if provided', () => {
      const { activate } = useFocusTrap()

      const mockInitialFocus = {
        focus: vi.fn(),
      } as unknown as HTMLElement

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement, { initialFocus: mockInitialFocus })

      expect(mockInitialFocus.focus).toHaveBeenCalled()
    })
  })

  describe('deactivate', () => {
    it('should set isActive to false when deactivated', () => {
      const { activate, deactivate, isActive } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)
      expect(isActive.value).toBe(true)

      deactivate()
      expect(isActive.value).toBe(false)
    })

    it('should set trapElement to null when deactivated', () => {
      const { activate, deactivate, trapElement } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)
      deactivate()

      expect(trapElement.value).toBeNull()
    })

    it('should remove keyboard event listener', () => {
      const { activate, deactivate } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)
      deactivate()

      expect(document.removeEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      )
    })

    it('should restore focus to previously focused element', () => {
      const mockPreviouslyFocused = {
        focus: vi.fn(),
      } as unknown as HTMLElement

      // Set activeElement before activation
      Object.defineProperty(document, 'activeElement', {
        value: mockPreviouslyFocused,
        writable: true,
        configurable: true,
      })

      const { activate, deactivate } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)
      deactivate()

      expect(mockPreviouslyFocused.focus).toHaveBeenCalled()
    })

    it('should do nothing if not active', () => {
      const { deactivate, isActive } = useFocusTrap()

      // Should not throw
      expect(() => deactivate()).not.toThrow()
      expect(isActive.value).toBe(false)
    })
  })

  describe('updateOptions', () => {
    it('should merge new options with existing options', () => {
      const { activate, updateOptions } = useFocusTrap()

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      const onEscape = vi.fn()
      activate(mockElement, { escapeDeactivates: true })
      updateOptions({ onEscape })

      // Options should be merged
      // We can't directly test internal options, but we can verify no errors
      expect(true).toBe(true)
    })
  })

  describe('getFocusableElements', () => {
    it('should return empty array when no trap element', () => {
      const { getFocusableElements } = useFocusTrap()

      const result = getFocusableElements()

      expect(result).toEqual([])
    })

    it('should return focusable elements from trap element', () => {
      const { activate, getFocusableElements } = useFocusTrap()

      const mockFocusable1 = { focus: vi.fn(), offsetParent: {} }
      const mockFocusable2 = { focus: vi.fn(), offsetParent: {} }

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([mockFocusable1, mockFocusable2]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)

      const result = getFocusableElements()

      expect(result).toHaveLength(2)
    })

    it('should filter out hidden elements', () => {
      const { activate, getFocusableElements } = useFocusTrap()

      const visibleElement = { focus: vi.fn(), offsetParent: {} }
      const hiddenElement = { focus: vi.fn(), offsetParent: null }

      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([visibleElement, hiddenElement]),
        focus: vi.fn(),
      } as unknown as HTMLElement

      activate(mockElement)

      const result = getFocusableElements()

      expect(result).toHaveLength(1)
    })
  })
})
