import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import CompleteProfile from './complete-profile.vue'

// vitest.setup.ts replaces computed/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity and lifecycle.
vi.stubGlobal('computed', computed)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('definePageMeta', vi.fn())

const mockNavigateTo = vi.fn()
vi.stubGlobal('navigateTo', mockNavigateTo)

const member = ref<{ full_name: string; phone: string | null } | null>(null)
const mockCheckAuth = vi.fn()
const mockSendPhoneVerification = vi.fn()
const mockCompleteProfile = vi.fn()
vi.stubGlobal('useMemberAuth', () => ({
  member,
  checkAuth: mockCheckAuth,
  sendPhoneVerification: mockSendPhoneVerification,
  completeProfile: mockCompleteProfile,
}))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

async function mountPage() {
  const wrapper = mount(CompleteProfile, {
    global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

async function reachVerifyStep(w: VueWrapper, phone = '0933-111-222') {
  await w.find('input[type="tel"]').setValue(phone)
  await submit(w)
}

describe('auth/complete-profile.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    member.value = { full_name: '社群會員', phone: null }
    mockCheckAuth.mockResolvedValue(true)
    mockSendPhoneVerification.mockResolvedValue({ success: true, message: '驗證碼已發送' })
    mockCompleteProfile.mockResolvedValue({ success: true, message: '資料已更新' })
  })

  it('shows the login guidance when there is no member session', async () => {
    mockCheckAuth.mockResolvedValue(false)
    member.value = null
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="no-session"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('尚未綁定會員')
    expect(mockSendPhoneVerification).not.toHaveBeenCalled()
  })

  it('prefills the name and sends the code to the normalized phone', async () => {
    const wrapper = await mountPage()
    expect((wrapper.find('input[autocomplete="name"]').element as HTMLInputElement).value).toBe('社群會員')

    await reachVerifyStep(wrapper)

    expect(mockSendPhoneVerification).toHaveBeenCalledWith('0933111222')
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(true)
  })

  it('rejects an invalid phone without calling the API', async () => {
    const wrapper = await mountPage()
    await reachVerifyStep(wrapper, '12345')

    expect(mockSendPhoneVerification).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain('有效的手機號碼')
  })

  it('surfaces a 409 PHONE_TAKEN from the send step', async () => {
    mockSendPhoneVerification.mockResolvedValue({
      success: false,
      message: '此手機號碼已被其他會員使用，請改用其他號碼或洽櫃台協助',
      code: 'PHONE_TAKEN',
    })
    const wrapper = await mountPage()
    await reachVerifyStep(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toContain('已被其他會員使用')
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false)
  })

  it('submits the camelCase body with the OTP code, then goes home', async () => {
    const wrapper = await mountPage()
    await reachVerifyStep(wrapper)

    await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456')
    await wrapper.find('input[value="FEMALE"]').setValue(true)
    await wrapper.find('input[type="date"]').setValue('1990-01-02')
    await wrapper.find('input[placeholder="聯絡人姓名"]').setValue(' 媽媽 ')
    await wrapper.findAll('input[type="tel"]').at(-1)!.setValue('0911-222-333')
    await submit(wrapper)

    expect(mockCompleteProfile).toHaveBeenCalledWith({
      phone: '0933111222',
      otpCode: '123456',
      fullName: '社群會員',
      gender: 'FEMALE',
      birthday: '1990-01-02',
      emergencyContact: '媽媽',
      emergencyPhone: '0911222333',
    })
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it('shows remaining attempts on a wrong code and stays on the code step', async () => {
    mockCompleteProfile.mockResolvedValue({
      success: false, message: '驗證碼錯誤', code: 'WRONG_CODE', attemptsRemaining: 2,
    })
    const wrapper = await mountPage()
    await reachVerifyStep(wrapper)
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('000000')
    await submit(wrapper)

    expect(wrapper.find('#code-error').text()).toBe('驗證碼錯誤，還可再試 2 次')
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('returns to the phone step when the phone was taken meanwhile', async () => {
    mockCompleteProfile.mockResolvedValue({
      success: false, message: '此手機號碼已被其他會員使用', code: 'PHONE_TAKEN',
    })
    const wrapper = await mountPage()
    await reachVerifyStep(wrapper)
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456')
    await submit(wrapper)

    expect(wrapper.find('#phone-error').text()).toContain('已被其他會員使用')
  })

  it('does not submit a malformed code', async () => {
    const wrapper = await mountPage()
    await reachVerifyStep(wrapper)
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('12')
    await submit(wrapper)

    expect(mockCompleteProfile).not.toHaveBeenCalled()
    expect(wrapper.find('#code-error').text()).toBe('請輸入 6 位數驗證碼')
  })
})
