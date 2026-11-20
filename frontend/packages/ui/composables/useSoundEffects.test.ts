import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSoundEffects } from './useSoundEffects'

describe('useSoundEffects', () => {
  let mockOscillator: any
  let mockGain: any
  let mockAudioContext: any

  beforeEach(() => {
    vi.restoreAllMocks()

    mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }

    mockAudioContext = {
      currentTime: 100,
      state: 'running',
      createOscillator: vi.fn().mockReturnValue(mockOscillator),
      createGain: vi.fn().mockReturnValue(mockGain),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
    }

    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => mockAudioContext))
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
  })

  it('initializes with default enabled state', () => {
    const { isSoundEnabled, setSoundEnabled, toggleSound } = useSoundEffects()
    expect(isSoundEnabled.value).toBe(true)

    toggleSound()
    expect(isSoundEnabled.value).toBe(false)

    setSoundEnabled(true)
    expect(isSoundEnabled.value).toBe(true)
  })

  it('synthesizes tap and success sounds without throwing', () => {
    const { tap, success, select, error } = useSoundEffects()
    expect(() => tap()).not.toThrow()
    expect(() => select()).not.toThrow()
    expect(() => success()).not.toThrow()
    expect(() => error()).not.toThrow()

    expect(mockAudioContext.createOscillator).toHaveBeenCalled()
    expect(mockAudioContext.createGain).toHaveBeenCalled()
  })

  it('does not play sound when disabled', () => {
    const { setSoundEnabled, tap } = useSoundEffects()
    setSoundEnabled(false)
    mockAudioContext.createOscillator.mockClear()

    tap()
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled()
  })
})
