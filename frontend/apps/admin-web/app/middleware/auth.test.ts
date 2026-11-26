import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import authMiddleware from './auth'

const mockLoadSession = vi.fn()
vi.mock('~/utils/session-storage', () => ({
  loadSession: () => mockLoadSession()
}))

const mockNavigateTo = vi.fn()
vi.stubGlobal('navigateTo', mockNavigateTo)

const auth = {
  user: ref<{ id: string } | null>(null),
  currentEmployee: ref<{ id: string } | null>(null),
  checkAuth: vi.fn()
}
const mockUseAuth = vi.fn(() => auth)
vi.stubGlobal('useAuth', mockUseAuth)

const route = (path: string) => ({
  path,
  fullPath: path,
  name: undefined,
  params: {},
  query: {},
  hash: '',
  matched: [],
  meta: {},
  redirectedFrom: undefined
}) as RouteLocationNormalized

const run = (path: string) => authMiddleware(route(path), route('/'))

/**
 * Scope note: the middleware's real work (hydrating from the cached session, background
 * checkAuth, redirecting to /login) is behind `import.meta.client`. Vitest does not define
 * it (vitest.config.ts has no `define` for it), so only the /login short-circuit and the
 * SSR pass-through are reachable here. The client branch needs `define: { 'import.meta.client': true }`
 * in a test config before it can be covered.
 */
describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.user.value = null
    auth.currentEmployee.value = null
  })

  it('lets /login through without touching auth state', async () => {
    expect(await run('/login')).toBeUndefined()
    expect(mockUseAuth).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('does not verify or redirect during SSR (client hydration does that)', async () => {
    mockLoadSession.mockReturnValue(null)
    auth.checkAuth.mockResolvedValue(false)

    expect(await run('/members/123')).toBeUndefined()
    expect(auth.checkAuth).not.toHaveBeenCalled()
    expect(mockLoadSession).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })
})
