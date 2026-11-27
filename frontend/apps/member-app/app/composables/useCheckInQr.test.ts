/**
 * Tests for useCheckInQr: signed token fetch, 25 s refresh while visible, offline state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiBaseUrl: 'http://localhost:8056' } }))
vi.stubGlobal('useMemberAuth', () => ({ getAuthHeader: () => ({ 'X-Member-Token': 'member-jwt' }) }))
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

import { useCheckInQr, QR_REFRESH_MS } from './useCheckInQr'

let n = 0
const issued = () => {
  n++
  return { success: true, data: { token: `payload${n}.sig${n}`, expiresAt: new Date(Date.now() + 30_000).toISOString(), ttlSeconds: 30 } }
}

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}
const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

describe('useCheckInQr', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
    mockFetch.mockImplementation(async () => issued())
    n = 0
    setOnline(true)
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches the token from the backend with the member token and exposes it', async () => {
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8056/api/member/check-in/qr-token', {
      headers: { 'X-Member-Token': 'member-jwt' }
    })
    expect(qr.token.value).toBe('payload1.sig1')
    expect(qr.status.value).toBe('ready')
    expect(qr.expiresAt.value!.getTime()).toBeGreaterThan(Date.now())
    qr.stop()
  })

  it('refreshes every 25 seconds while visible', async () => {
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(QR_REFRESH_MS)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(qr.token.value).toBe('payload2.sig2')

    await vi.advanceTimersByTimeAsync(QR_REFRESH_MS)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    qr.stop()
  })

  it('stops refreshing while hidden and refreshes right away when visible again', async () => {
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)

    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(QR_REFRESH_MS * 4)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(QR_REFRESH_MS)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    qr.stop()
  })

  it('does not fetch at all when started while hidden', async () => {
    setVisibility('hidden')
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(QR_REFRESH_MS * 2)
    expect(mockFetch).not.toHaveBeenCalled()
    qr.stop()
  })

  it('stop() ends the refresh timer', async () => {
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)
    qr.stop()

    await vi.advanceTimersByTimeAsync(QR_REFRESH_MS * 3)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('shows the offline state, without calling the backend, when the device is offline', async () => {
    setOnline(false)
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(qr.status.value).toBe('offline')
    expect(qr.token.value).toBe('')
    expect(mockFetch).not.toHaveBeenCalled()
    qr.stop()
  })

  it('drops the QR when the connection is lost and refetches when it comes back', async () => {
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(qr.token.value).not.toBe('')

    setOnline(false)
    window.dispatchEvent(new Event('offline'))
    expect(qr.status.value).toBe('offline')
    expect(qr.token.value).toBe('')

    setOnline(true)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(qr.status.value).toBe('ready')
    expect(qr.token.value).not.toBe('')
    qr.stop()
  })

  it('treats a network failure as offline and never keeps a stale token', async () => {
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(qr.token.value).not.toBe('')

    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await vi.advanceTimersByTimeAsync(QR_REFRESH_MS)

    expect(qr.status.value).toBe('offline')
    expect(qr.token.value).toBe('')
    qr.stop()
  })

  it('reports a server error separately from offline', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }))
    const qr = useCheckInQr()
    qr.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(qr.status.value).toBe('error')
    expect(qr.token.value).toBe('')
    qr.stop()
  })
})
