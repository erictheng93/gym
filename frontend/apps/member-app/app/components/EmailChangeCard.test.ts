import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, onUnmounted, ref } from 'vue'
import EmailChangeCard from './EmailChangeCard.vue'

// vitest.setup.ts replaces computed with an inert fake for composable tests;
// a component test needs Vue's real reactivity and lifecycle.
vi.stubGlobal('computed', computed)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('ref', ref)

const mockSendEmailVerification = vi.fn()
const mockChangeEmail = vi.fn()
vi.stubGlobal('useMemberAuth', () => ({
  sendEmailVerification: mockSendEmailVerification,
  changeEmail: mockChangeEmail,
}))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

const mountCard = () => mount(EmailChangeCard, { props: { currentEmail: 'old@example.com' } })

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

async function reachVerifyStep(w: VueWrapper, email = ' New@Example.com ') {
  await w.find('input[type="email"]').setValue(email)
  await submit(w)
}

describe('EmailChangeCard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmailVerification.mockResolvedValue({ success: true, message: '驗證碼已發送' })
    mockChangeEmail.mockResolvedValue({ success: true, message: 'Email 已更新' })
  })

  it('sends a code to the new address, then changes the email with that code', async () => {
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)

    expect(mockSendEmailVerification).toHaveBeenCalledWith('new@example.com')
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456')
    await submit(wrapper)

    expect(mockChangeEmail).toHaveBeenCalledWith('new@example.com', '123456')
    expect(wrapper.emitted('changed')).toEqual([['new@example.com']])
  })

  it('rejects an invalid or unchanged address without calling the API', async () => {
    const wrapper = mountCard()
    await reachVerifyStep(wrapper, 'not-an-email')
    expect(wrapper.text()).toContain('請輸入有效的 Email')

    await reachVerifyStep(wrapper, 'OLD@example.com')
    expect(wrapper.text()).toContain('這是您目前的 Email')
    expect(mockSendEmailVerification).not.toHaveBeenCalled()
  })

  it('shows remaining attempts on a wrong code and stays on the code step', async () => {
    mockChangeEmail.mockResolvedValue({ success: false, message: '驗證碼錯誤', code: 'WRONG_CODE', attemptsRemaining: 2 })
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('000000')
    await submit(wrapper)

    expect(wrapper.text()).toContain('還可再試 2 次')
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('returns to the email step with the message when the address is taken', async () => {
    mockChangeEmail.mockResolvedValue({ success: false, message: '此 Email 已被其他會員使用', code: 'EMAIL_TAKEN' })
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456')
    await submit(wrapper)

    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('此 Email 已被其他會員使用')
  })

  it('shows the send error (e.g. mail unavailable) on the email step', async () => {
    mockSendEmailVerification.mockResolvedValue({ success: false, message: '郵件服務暫時無法使用', code: 'EMAIL_UNAVAILABLE' })
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)

    expect(wrapper.text()).toContain('郵件服務暫時無法使用')
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false)
  })
})
