/**
 * BookSessionPanel: the 「例外預約（體驗/補課）」 path is offered only to manager+ after
 * the backend refused for lack of a valid contract, and needs a reason.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { mockFetchInstance, mockAuthUser } from '@test/setup'
import BookSessionPanel from './BookSessionPanel.vue'
import { useClassBookings } from '~/composables/useClassBookings'
import type { ApiClassSession } from '~/composables/useClasses'

const toast = { success: vi.fn(), error: vi.fn() }
vi.stubGlobal('computed', computed)
vi.stubGlobal('useToast', () => toast)
vi.stubGlobal('useClassBookings', useClassBookings)

const session = { id: 's1', sessionDate: '2026-11-30', startTime: '10:00:00' } as unknown as ApiClassSession
const member = { id: 'm1', fullName: '體驗會員', memberCode: 'M001', phone: '0912' }

const noContract = () => Object.assign(new Error('沒有有效合約，無法預約課程'), { status: 400, code: 'NO_VALID_CONTRACT' })

const setRole = (role: string) => {
  mockAuthUser.value = { id: 'u1', role } as unknown as typeof mockAuthUser.value
}

const mountWithMember = async () => {
  mockFetchInstance.apiFetch.mockImplementation(async (url: string) => {
    if (url === '/members') return { success: true, data: [member] }
    if (url.endsWith('/contracts')) return { success: true, data: [] }
    throw new Error(`unexpected ${url}`)
  })
  const wrapper = mount(BookSessionPanel, { props: { session, className: '瑜珈' } })
  await wrapper.find('input[type="text"]').setValue('體驗')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await wrapper.find('.member-option').trigger('click')
  await flushPromises()
  return wrapper
}

const confirmButton = (wrapper: Awaited<ReturnType<typeof mountWithMember>>) =>
  wrapper.findAll('button').find(b => b.text() === '確認預約')!

describe('BookSessionPanel override', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manager: offers the override after a no-contract refusal and sends the reason', async () => {
    setRole('manager')
    const wrapper = await mountWithMember()
    expect(wrapper.find('[data-testid="booking-override"]').exists()).toBe(false)

    mockFetchInstance.apiFetch.mockRejectedValueOnce(noContract())
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    const box = wrapper.find('[data-testid="booking-override"]')
    expect(box.exists()).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()

    const submit = box.findAll('button').find(b => b.text().includes('例外預約'))!
    expect(submit.attributes('disabled')).toBeDefined()

    await box.find('input').setValue('體驗課')
    expect(submit.attributes('disabled')).toBeUndefined()

    mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { id: 'bk1' }, message: '預約成功！' })
    await submit.trigger('click')
    await flushPromises()

    expect(mockFetchInstance.apiFetch).toHaveBeenLastCalledWith('/bookings', {
      method: 'POST',
      body: { sessionId: 's1', memberId: 'm1', override: { reason: '體驗課' } }
    })
    expect(wrapper.emitted('booked')).toHaveLength(1)
  })

  it('staff: never sees the override, just the error', async () => {
    setRole('staff')
    const wrapper = await mountWithMember()

    mockFetchInstance.apiFetch.mockRejectedValueOnce(noContract())
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="booking-override"]').exists()).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('沒有有效合約，無法預約課程')
  })
})
