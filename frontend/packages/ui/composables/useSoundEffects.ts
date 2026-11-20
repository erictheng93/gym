/**
 * Advanced Procedural Sound Synthesis Composable
 * Zero-asset, zero-network Web Audio API sound generator.
 * Designed for micro-interactions with Apple-grade subtlety.
 */

export type SoundEffectType = 'tap' | 'select' | 'pop' | 'success' | 'error' | 'toggle'

// Shared AudioContext singleton across the app
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // AudioContext resume might require user interaction
    })
  }

  return audioCtx
}

// Global sound preference state
const isSoundEnabled = ref(true)
const masterVolume = ref(0.6)

export function useSoundEffects() {
  const isSupported = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)

  // Initialize from localStorage if available
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('gym_sound_enabled')
    if (saved !== null) {
      isSoundEnabled.value = saved === 'true'
    }
  }

  const setSoundEnabled = (enabled: boolean) => {
    isSoundEnabled.value = enabled
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gym_sound_enabled', String(enabled))
    }
  }

  const toggleSound = () => {
    setSoundEnabled(!isSoundEnabled.value)
    return isSoundEnabled.value
  }

  const play = (type: SoundEffectType = 'tap') => {
    if (!isSupported || !isSoundEnabled.value) return

    // Respect reduced-motion / sensory preference
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    switch (type) {
      case 'tap': {
        // Subtle crisp tactile click (20ms)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1000, now)
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.02)

        const peakGain = 0.04 * masterVolume.value
        gain.gain.setValueAtTime(peakGain, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.02)
        break
      }

      case 'select': {
        // Bright menu selection tick (25ms)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1400, now)
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.025)

        const peakGain = 0.05 * masterVolume.value
        gain.gain.setValueAtTime(peakGain, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.025)
        break
      }

      case 'pop': {
        // Cheerful bubble pop (35ms)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(450, now)
        osc.frequency.exponentialRampToValueAtTime(950, now + 0.035)

        const peakGain = 0.06 * masterVolume.value
        gain.gain.setValueAtTime(peakGain, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.035)
        break
      }

      case 'toggle': {
        // Two-tone swift flick (40ms)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(600, now)
        osc.frequency.setValueAtTime(900, now + 0.02)

        const peakGain = 0.04 * masterVolume.value
        gain.gain.setValueAtTime(peakGain, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.04)
        break
      }

      case 'success': {
        // Harmonic luxury bell chord (C5 - E5 - C6 staggered)
        const chord = [
          { freq: 523.25, time: 0, duration: 0.35, gain: 0.05 },
          { freq: 659.25, time: 0.07, duration: 0.4, gain: 0.05 },
          { freq: 1046.50, time: 0.14, duration: 0.5, gain: 0.04 },
        ]

        chord.forEach(({ freq, time, duration, gain: noteGain }) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, now + time)

          const peak = noteGain * masterVolume.value
          gain.gain.setValueAtTime(0.0001, now + time)
          gain.gain.exponentialRampToValueAtTime(peak, now + time + 0.015)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + duration)

          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(now + time)
          osc.stop(now + time + duration)
        })
        break
      }

      case 'error': {
        // Damped warm alert buzz (140ms)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(180, now)
        osc.frequency.linearRampToValueAtTime(120, now + 0.14)

        const peakGain = 0.06 * masterVolume.value
        gain.gain.setValueAtTime(peakGain, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.14)
        break
      }
    }
  }

  return {
    isSupported,
    isSoundEnabled: readonly(isSoundEnabled),
    masterVolume,
    setSoundEnabled,
    toggleSound,
    play,
    tap: () => play('tap'),
    select: () => play('select'),
    pop: () => play('pop'),
    toggle: () => play('toggle'),
    success: () => play('success'),
    error: () => play('error'),
  }
}
