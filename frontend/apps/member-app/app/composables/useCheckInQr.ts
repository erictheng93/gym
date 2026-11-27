/**
 * useCheckInQr composable
 * The entry QR is a short-lived token signed by the backend (GET /api/member/check-in/qr-token,
 * 30 s). It cannot be made offline, so there is no cache: offline shows a message instead.
 * start() fetches now and every QR_REFRESH_MS while the page is visible; stop() ends it.
 */
import { ref, computed } from 'vue'

export const QR_REFRESH_MS = 25_000

export type CheckInQrStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error'

interface QrTokenResponse {
  success: boolean
  data: { token: string; expiresAt: string; ttlSeconds: number }
}

export const useCheckInQr = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useMemberAuth()

  const token = ref('')
  const expiresAt = ref<Date | null>(null)
  const status = ref<CheckInQrStatus>('idle')
  const isOffline = computed(() => status.value === 'offline')

  let timer: ReturnType<typeof setInterval> | null = null
  let started = false
  let inFlight: Promise<void> | null = null

  const clear = (next: CheckInQrStatus) => {
    token.value = ''
    expiresAt.value = null
    status.value = next
  }

  const refresh = (): Promise<void> => {
    if (inFlight) return inFlight
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      clear('offline')
      return Promise.resolve()
    }
    if (!token.value) status.value = 'loading'

    inFlight = (async () => {
      try {
        const response = await $fetch<QrTokenResponse>(`${apiUrl}/api/member/check-in/qr-token`, {
          headers: getAuthHeader()
        })
        token.value = response.data.token
        expiresAt.value = new Date(response.data.expiresAt)
        status.value = 'ready'
      } catch (error) {
        // No HTTP response at all means the network is down; a stale token must not stay on screen
        const hasResponse = Boolean((error as { response?: unknown; statusCode?: number })?.response
          || (error as { statusCode?: number })?.statusCode)
        clear(hasResponse ? 'error' : 'offline')
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  const stopTimer = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const startTimer = () => {
    stopTimer()
    timer = setInterval(() => { void refresh() }, QR_REFRESH_MS)
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      stopTimer()
    } else {
      void refresh()
      startTimer()
    }
  }
  const onOnline = () => { void refresh() }
  const onOffline = () => clear('offline')

  const start = () => {
    if (started) return
    started = true
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      void refresh()
      startTimer()
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
    }
  }

  const stop = () => {
    started = false
    stopTimer()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }

  return { token, expiresAt, status, isOffline, refresh, start, stop }
}
