import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useHapticFeedback } from './useHapticFeedback'

describe('useHapticFeedback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('handles environment without navigator.vibrate gracefully', () => {
    const { isSupported, trigger, light } = useHapticFeedback()
    expect(typeof isSupported).toBe('boolean')
    const result = light()
    expect(result).toBe(false)
  })

  it('triggers vibration pattern when supported', () => {
    const vibrateMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', {
      vibrate: vibrateMock,
    })

    const { trigger, light, success, error } = useHapticFeedback()
    
    expect(light()).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith(12)

    expect(success()).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith([15, 60, 25])

    expect(error()).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith([40, 60, 40, 60, 40])
  })

  it('respects prefers-reduced-motion', () => {
    const vibrateMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', {
      vibrate: vibrateMock,
    })
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))

    const { light } = useHapticFeedback()
    expect(light()).toBe(false)
    expect(vibrateMock).not.toHaveBeenCalled()
  })
})
