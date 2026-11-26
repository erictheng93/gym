import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, onUnmounted, ref } from 'vue'
import PhoneChangeCard from './PhoneChangeCard.vue'

// vitest.setup.ts replaces computed with an inert fake for composable tests;
// a component test needs Vue's real reactivity and lifecycle.
vi.stubGlobal('computed', computed)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('ref', ref)

const mockSendPhoneVerification = vi.fn()
const mockChangePhone = vi.fn()
vi.stubGlobal('useMemberAuth', () => ({
  sendPhoneVerification: mockSendPhoneVerification,
  changePhone: mockChangePhone,
}))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

const mountCard = () => mount(PhoneChangeCard, { props: { currentPhone: '0912345678' } })

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

async function reachVerifyStep(w: VueWrapper, phone = '0933-111-222') {
  await w.find('input[type="tel"]').setValue(phone)
  await submit(w)
}

describe('PhoneChangeCard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPhoneVerification.mockResolvedValue({ success: true, message: '驗證碼已發送' })
    mockChangePhone.mockResolvedValue({ success: true, message: '手機號碼已更新' })
  })

  it('sends a code to the new phone, then changes it with that code', async () => {
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)

    expect(mockSendPhoneVerification).toHaveBeenCalledWith('0933111222')
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456')
    await submit(wrapper)

    expect(mockChangePhone).toHaveBeenCalledWith('0933111222', '123456')
    expect(wrapper.emitted('changed')).toEqual([['0933111222']])
  })

  it('rejects an invalid or unchanged phone without calling the API', async () => {
    const wrapper = mountCard()
    await reachVerifyStep(wrapper, '12345')
    expect(wrapper.text()).toContain('請輸入有效的手機號碼')

    await reachVerifyStep(wrapper, '0912-345-678')
    expect(wrapper.text()).toContain('這是您目前的手機號碼')
    expect(mockSendPhoneVerification).not.toHaveBeenCalled()
  })

  it('shows remaining attempts on a wrong code and stays on the code step', async () => {
    mockChangePhone.mockResolvedValue({ success: false, message: '驗證碼錯誤', code: 'WRONG_CODE', attemptsRemaining: 2 })
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('000000')
    await submit(wrapper)

    expect(wrapper.text()).toContain('還可再試 2 次')
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(true)
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('returns to the phone step with the message when the phone is taken', async () => {
    mockChangePhone.mockResolvedValue({ success: false, message: '此手機號碼已被其他會員使用', code: 'PHONE_TAKEN' })
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456')
    await submit(wrapper)

    expect(wrapper.find('input[type="tel"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('此手機號碼已被其他會員使用')
  })

  it('shows the send error (e.g. SMS unavailable) on the phone step', async () => {
    mockSendPhoneVerification.mockResolvedValue({ success: false, message: '簡訊服務暫時無法使用', code: 'SMS_UNAVAILABLE' })
    const wrapper = mountCard()
    await reachVerifyStep(wrapper)

    expect(wrapper.text()).toContain('簡訊服務暫時無法使用')
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false)
  })
})
