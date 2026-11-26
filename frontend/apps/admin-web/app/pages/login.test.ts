import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, onMounted } from 'vue'
import Login from './login.vue'
import { MESSAGES, STORAGE_KEYS, TIMING } from '~/constants'

// vitest.setup.ts fakes onMounted (runs the callback synchronously during setup); use Vue's real one.
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('definePageMeta', vi.fn())

const mockNavigateTo = vi.fn()
vi.stubGlobal('navigateTo', mockNavigateTo)

const mockLogin = vi.fn()
const isLoading = ref(false)
const isAuthenticated = ref(false)
const mockCheckAuth = vi.fn()
vi.stubGlobal('useAuth', () => ({ login: mockLogin, isLoading, isAuthenticated, checkAuth: mockCheckAuth }))

const mockLoadSession = vi.fn()
vi.mock('~/utils/session-storage', () => ({ loadSession: () => mockLoadSession() }))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

const ClientOnly = defineComponent((_, { slots }) => () => slots.default?.())

const mountLogin = () => mount(Login, { global: { stubs: { ClientOnly } } })
const banner = (w: VueWrapper) => w.find('.error-banner')

async function submitWith(w: VueWrapper, email: string, password: string) {
  await w.find('#email').setValue(email)
  await w.find('#password').setValue(password)
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('login.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isLoading.value = false
    isAuthenticated.value = false
    mockLoadSession.mockReturnValue(null)
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('on mount', () => {
    it('redirects home when already authenticated', async () => {
      isAuthenticated.value = true
      mountLogin()
      await flushPromises()
      expect(mockNavigateTo).toHaveBeenCalledWith('/')
    })

    it('redirects home after a full page load when the cached session is still valid', async () => {
      mockLoadSession.mockReturnValue({ user: { id: 'u1' } })
      mockCheckAuth.mockResolvedValue(true)
      mountLogin()
      await flushPromises()
      expect(mockCheckAuth).toHaveBeenCalled()
      expect(mockNavigateTo).toHaveBeenCalledWith('/')
    })

    it('stays on the login page when the cached session is no longer valid', async () => {
      mockLoadSession.mockReturnValue({ user: { id: 'u1' } })
      mockCheckAuth.mockResolvedValue(false)
      mountLogin()
      await flushPromises()
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('does not call the server when there is no cached session', async () => {
      mountLogin()
      await flushPromises()
      expect(mockCheckAuth).not.toHaveBeenCalled()
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('defaults to the dark theme', async () => {
      mountLogin()
      await flushPromises()
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('applies a saved light theme, and the toggle persists the choice', async () => {
      localStorage.setItem(STORAGE_KEYS.THEME, 'light')
      const wrapper = mountLogin()
      await flushPromises()
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')

      await wrapper.find('.theme-toggle').trigger('click')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe('dark')
    })
  })

  describe('submit', () => {
    it('requires both fields, shakes the card, and does not call login', async () => {
      vi.useFakeTimers()
      const wrapper = mountLogin()
      await submitWith(wrapper, 'test@example.com', '')

      expect(mockLogin).not.toHaveBeenCalled()
      expect(banner(wrapper).text()).toContain(MESSAGES.AUTH.REQUIRED_FIELDS)
      expect(wrapper.find('.login-card').classes()).toContain('shake')

      await vi.advanceTimersByTimeAsync(TIMING.SHAKE_DURATION)
      expect(wrapper.find('.login-card').classes()).not.toContain('shake')
    })

    it('logs in with the trimmed email and navigates home', async () => {
      mockLogin.mockResolvedValue({ success: true })
      const wrapper = mountLogin()
      await submitWith(wrapper, '  test@example.com  ', 'password123')

      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123')
      expect(mockNavigateTo).toHaveBeenCalledWith('/', { replace: true })
      expect(banner(wrapper).exists()).toBe(false)
    })

    it('shows the error returned by login', async () => {
      mockLogin.mockResolvedValue({ success: false, error: '帳號或密碼錯誤' })
      const wrapper = mountLogin()
      await submitWith(wrapper, 'test@example.com', 'wrong')

      expect(banner(wrapper).text()).toContain('帳號或密碼錯誤')
      expect(wrapper.find('.login-card').classes()).toContain('shake')
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('falls back to the generic error when login gives no message', async () => {
      mockLogin.mockResolvedValue({ success: false })
      const wrapper = mountLogin()
      await submitWith(wrapper, 'test@example.com', 'wrong')
      expect(banner(wrapper).text()).toContain(MESSAGES.AUTH.LOGIN_ERROR)
    })

    it('shows a toast and the generic error when login throws', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockLogin.mockRejectedValue(new Error('network'))
      const wrapper = mountLogin()
      await submitWith(wrapper, 'test@example.com', 'password123')

      expect(toast.error).toHaveBeenCalledWith(MESSAGES.AUTH.LOGIN_ERROR)
      expect(banner(wrapper).text()).toContain(MESSAGES.AUTH.LOGIN_ERROR)
    })

    it('clears a previous error on a successful retry', async () => {
      const wrapper = mountLogin()
      await submitWith(wrapper, '', '')
      expect(banner(wrapper).exists()).toBe(true)

      mockLogin.mockResolvedValue({ success: true })
      await submitWith(wrapper, 'test@example.com', 'password123')
      expect(banner(wrapper).exists()).toBe(false)
    })
  })

  it('disables the submit button while logging in', () => {
    isLoading.value = true
    const button = mountLogin().find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.text()).toContain(MESSAGES.AUTH.LOGGING_IN)
  })
})
