import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import PlansNew from './new.vue'
import { MESSAGES, PAGES, VALIDATION } from '~/constants'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const mockPush = vi.fn()
const mockBack = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: mockBack }))
vi.stubGlobal('definePageMeta', vi.fn())

const mockCreatePlan = vi.fn()
vi.stubGlobal('usePlans', () => ({ createPlan: mockCreatePlan }))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

// Real Zod validation (useZodFormValidation + createPlanSchema), the real form -> API mapping
// (planFormToInput) and real useFormSubmit are used.

const nameInput = (w: VueWrapper) => w.find(`input[placeholder="${PAGES.PLANS.PLAN_NAME_PLACEHOLDER}"]`)
const codeInput = (w: VueWrapper) => w.find(`input[placeholder="${PAGES.PLANS.PLAN_CODE_PLACEHOLDER}"]`)
const numberInputs = (w: VueWrapper) => w.findAll('input[type="number"]')
const errorTexts = (w: VueWrapper) => w.findAll('.error-text').map(e => e.text())

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('plans/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreatePlan.mockResolvedValue({ id: 'plan-1' })
  })

  it('creates a TIME_BASED plan in the POST /membership-plans body shape, then navigates to /plans', async () => {
    const wrapper = mount(PlansNew)
    await nameInput(wrapper).setValue('  半年方案  ')
    await codeInput(wrapper).setValue(' HALF-6 ')
    const [price, duration] = numberInputs(wrapper)
    await price!.setValue(12000)
    await duration!.setValue(6)
    await wrapper.find('textarea').setValue('   ')
    await submit(wrapper)

    // exactly the backend zod schema: camelCase, required code + planType, isActive flag,
    // and no classCounts at all (the backend field is optional, not nullable)
    expect(mockCreatePlan).toHaveBeenCalledWith({
      name: '半年方案',
      code: 'HALF-6',
      planType: 'TIME_BASED',
      price: 12000,
      durationMonths: 6,
      description: '',
      allowTransfer: false,
      allowPause: true,
      isActive: true
    })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.PLAN_CREATED)
    expect(mockPush).toHaveBeenCalledWith('/plans')
  })

  it('creates a COUNT_BASED plan with class count and no duration', async () => {
    const wrapper = mount(PlansNew)
    await wrapper.find('input[type="radio"][value="COUNT_BASED"]').setValue(true)
    expect(wrapper.text()).toContain(PAGES.PLANS.CLASS_COUNTS)
    expect(wrapper.text()).not.toContain(PAGES.PLANS.DURATION_MONTHS)

    await nameInput(wrapper).setValue('十堂課')
    await codeInput(wrapper).setValue('PT-10')
    const [price, counts] = numberInputs(wrapper)
    await price!.setValue(5000)
    await counts!.setValue(20)
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(true) // allow transfer
    await submit(wrapper)

    const body = mockCreatePlan.mock.calls[0]![0]
    expect(body).toMatchObject({ planType: 'COUNT_BASED', classCounts: 20, allowTransfer: true })
    expect(body).not.toHaveProperty('durationMonths')
    expect(Object.keys(body).some(k => k.includes('_'))).toBe(false)
  })

  it('sends isActive=false for a plan created as disabled', async () => {
    const wrapper = mount(PlansNew)
    await nameInput(wrapper).setValue('舊方案')
    await codeInput(wrapper).setValue('OLD')
    await numberInputs(wrapper)[0]!.setValue(1000)
    await wrapper.find('input[type="radio"][value="archived"]').setValue(true)
    await submit(wrapper)

    expect(mockCreatePlan).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
  })

  it('requires a plan code (the backend rejects a plan without one)', async () => {
    const wrapper = mount(PlansNew)
    await nameInput(wrapper).setValue('月卡')
    await numberInputs(wrapper)[0]!.setValue(1000)
    await submit(wrapper)

    expect(mockCreatePlan).not.toHaveBeenCalled()
    expect(errorTexts(wrapper)).toContain(PAGES.PLANS.ERROR_CODE_REQUIRED)
  })

  it('shows Zod validation errors and does not submit an invalid form', async () => {
    const wrapper = mount(PlansNew)
    await nameInput(wrapper).setValue('A')
    await submit(wrapper)

    expect(mockCreatePlan).not.toHaveBeenCalled()
    expect(errorTexts(wrapper)).toEqual(expect.arrayContaining([
      VALIDATION.NAME_MIN,
      VALIDATION.AMOUNT_POSITIVE
    ]))
  })

  it('rejects a TIME_BASED plan without a positive duration', async () => {
    const wrapper = mount(PlansNew)
    await nameInput(wrapper).setValue('月卡')
    await codeInput(wrapper).setValue('M1')
    const [price, duration] = numberInputs(wrapper)
    await price!.setValue(1000)
    await duration!.setValue(0)
    await submit(wrapper)

    expect(mockCreatePlan).not.toHaveBeenCalled()
    expect(errorTexts(wrapper).length).toBeGreaterThan(0)
  })

  it('stays on the page without a success toast when createPlan fails', async () => {
    // createPlan resolves null after it has already shown the backend's reason
    mockCreatePlan.mockResolvedValue(null)
    const wrapper = mount(PlansNew)
    await nameInput(wrapper).setValue('月卡')
    await codeInput(wrapper).setValue('M1')
    await numberInputs(wrapper)[0]!.setValue(1000)
    await submit(wrapper)

    expect(wrapper.find('.submit-error').text()).toBe(PAGES.PLANS.ERROR_CREATE_FAILED)
    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('updates the live preview from the form', async () => {
    const wrapper = mount(PlansNew)
    expect(wrapper.find('.preview-name').text()).toBe('方案名稱')

    await nameInput(wrapper).setValue('年卡')
    await numberInputs(wrapper)[0]!.setValue(30000)
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(false) // allow pause

    expect(wrapper.find('.preview-name').text()).toBe('年卡')
    expect(wrapper.find('.preview-price').text()).toBe('NT$ 30,000')
    expect(wrapper.find('.preview-details').text()).toContain('不可暫停')
  })

  it('goes back on cancel', async () => {
    const wrapper = mount(PlansNew)
    await wrapper.find('button.btn-ghost').trigger('click')
    expect(mockBack).toHaveBeenCalled()
  })
})
