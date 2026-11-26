import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, defineComponent, h, onMounted, watch } from 'vue'
import ContractNew from './new.vue'
import { MESSAGES, PAGES } from '~/constants'
import type { Member, MembershipPlan, Branch } from '~/types/schema'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const mockPush = vi.fn()
const mockBack = vi.fn()
const mockRoute: { query: Record<string, string> } = { query: {} }
vi.stubGlobal('useRoute', () => mockRoute)
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: mockBack }))
vi.stubGlobal('definePageMeta', vi.fn())

const mockCreateContract = vi.fn()
const mockFetchMembers = vi.fn()
const mockFetchPlans = vi.fn()
const mockFetchBranches = vi.fn()
const mockMembers = ref<Partial<Member>[]>([])
const mockPlans = ref<Partial<MembershipPlan>[]>([])
const mockBranches = ref<Partial<Branch>[]>([])
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }

vi.stubGlobal('useContracts', () => ({ createContract: mockCreateContract }))
vi.stubGlobal('useMembers', () => ({ members: mockMembers, fetchMembers: mockFetchMembers }))
vi.stubGlobal('usePlans', () => ({ plans: mockPlans, fetchPlans: mockFetchPlans }))
vi.stubGlobal('useBranches', () => ({ branches: mockBranches, fetchBranches: mockFetchBranches }))
vi.stubGlobal('useToast', () => toast)

const SIGNATURE = 'data:image/png;base64,signed'

// The page lazy-loads SignaturePad; the stub only has to forward v-model.
const SignaturePadStub = defineComponent({
  name: 'SignaturePadStub',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: () => () => h('div', { class: 'signature-pad-stub' })
})

const dateFormatter = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
const fmt = (iso: string) => dateFormatter.format(new Date(iso))

async function mountPage() {
  const wrapper = mount(ContractNew, {
    global: { stubs: { LazySignaturePad: SignaturePadStub } }
  })
  await flushPromises()
  return wrapper
}

const selects = (w: VueWrapper) => {
  const [member, plan, branch] = w.findAll('select')
  return { member: member!, plan: plan!, branch: branch! }
}
const nextButton = (w: VueWrapper) => w.find('button.btn-primary[type="button"]')
const errorTexts = (w: VueWrapper) => w.findAll('.error-text').map(e => e.text())

async function fillStep1(w: VueWrapper, planId = 'plan-year') {
  const s = selects(w)
  await s.member.setValue('member-1')
  await s.plan.setValue(planId)
}

async function goToStep3(w: VueWrapper, planId?: string) {
  await fillStep1(w, planId)
  await nextButton(w).trigger('click')
  await nextButton(w).trigger('click')
}

describe('contracts/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Only fake Date so flushPromises/timers keep working; "today" is fixed.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-11-15T10:00:00Z'))
    mockRoute.query = {}
    mockMembers.value = [
      { id: 'member-1', full_name: '張三', member_code: 'M001' },
      { id: 'member-2', full_name: '李四', member_code: 'M002' }
    ]
    mockPlans.value = [
      { id: 'plan-year', name: '年卡方案', price: 30000, plan_type: 'TIME_BASED', duration_months: 12, allow_pause: true, allow_transfer: true },
      { id: 'plan-month', name: '月卡方案', price: 3000, plan_type: 'TIME_BASED', duration_months: 1, allow_pause: false, allow_transfer: false },
      { id: 'plan-count', name: '計次方案', price: 5000, plan_type: 'COUNT_BASED', class_counts: 10, allow_pause: false, allow_transfer: false }
    ]
    mockBranches.value = [
      { id: 'branch-1', name: '總店' },
      { id: 'branch-2', name: '分店A' }
    ]
    mockFetchMembers.mockResolvedValue(undefined)
    mockFetchPlans.mockResolvedValue(undefined)
    mockFetchBranches.mockResolvedValue(undefined)
    mockCreateContract.mockResolvedValue({ id: 'contract-1' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial load', () => {
    it('shows a loading state, fetches members/plans/branches, then shows the form', async () => {
      const wrapper = mount(ContractNew, { global: { stubs: { LazySignaturePad: SignaturePadStub } } })
      expect(wrapper.find('.loading-container').exists()).toBe(true)

      await flushPromises()

      expect(mockFetchMembers).toHaveBeenCalledWith({ limit: 100 })
      expect(mockFetchPlans).toHaveBeenCalled()
      expect(mockFetchBranches).toHaveBeenCalled()
      expect(wrapper.find('.loading-container').exists()).toBe(false)
      expect(wrapper.text()).toContain(PAGES.CONTRACTS.SELECT_MEMBER_PLAN)
    })

    it('defaults branch to the first branch and start date to today', async () => {
      const wrapper = await mountPage()
      expect((selects(wrapper).branch.element as HTMLSelectElement).value).toBe('branch-1')
      expect((wrapper.find('input[type="date"]').element as HTMLInputElement).value).toBe('2024-11-15')
    })

    it('pre-selects the member from the ?member= query', async () => {
      mockRoute.query = { member: 'member-2' }
      const wrapper = await mountPage()
      expect((selects(wrapper).member.element as HTMLSelectElement).value).toBe('member-2')
    })
  })

  describe('step 1 validation', () => {
    it('blocks advancing and shows errors when member and plan are missing', async () => {
      const wrapper = await mountPage()
      await nextButton(wrapper).trigger('click')

      expect(errorTexts(wrapper)).toEqual(expect.arrayContaining([
        PAGES.CONTRACTS.ERROR_SELECT_MEMBER,
        PAGES.CONTRACTS.ERROR_SELECT_PLAN
      ]))
      expect(wrapper.text()).toContain(PAGES.CONTRACTS.SELECT_MEMBER_PLAN)
      expect(wrapper.text()).not.toContain(PAGES.CONTRACTS.CONFIRM_CONTRACT_INFO)
    })

    it('requires a branch and a start date', async () => {
      const wrapper = await mountPage()
      await fillStep1(wrapper)
      await selects(wrapper).branch.setValue('')
      await wrapper.find('input[type="date"]').setValue('')
      await nextButton(wrapper).trigger('click')

      expect(errorTexts(wrapper)).toEqual([
        PAGES.CONTRACTS.ERROR_SELECT_BRANCH,
        PAGES.CONTRACTS.ERROR_SELECT_START_DATE
      ])
    })

    it('previews the selected plan', async () => {
      const wrapper = await mountPage()
      await selects(wrapper).plan.setValue('plan-count')
      const preview = wrapper.find('.plan-preview')
      expect(preview.text()).toContain('計次方案')
      expect(preview.text()).toContain('10')
    })
  })

  describe('step 2 (confirm)', () => {
    it('shows member, plan and computed contract period, with amount pre-filled from the plan price', async () => {
      const wrapper = await mountPage()
      await fillStep1(wrapper, 'plan-year')
      await nextButton(wrapper).trigger('click')

      const summary = wrapper.find('.contract-summary').text()
      expect(summary).toContain('張三')
      expect(summary).toContain('M001')
      expect(summary).toContain('年卡方案')
      expect(summary).toContain(`${fmt('2024-11-15')} ~ ${fmt('2025-11-15')}`)
      expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('30000')
      expect(wrapper.find('.total-value').text()).toBe('NT$ 30,000')
    })

    it('updates the amount when the plan changes', async () => {
      const wrapper = await mountPage()
      await fillStep1(wrapper, 'plan-year')
      await selects(wrapper).plan.setValue('plan-month')
      await nextButton(wrapper).trigger('click')
      expect(wrapper.find('.total-value').text()).toBe('NT$ 3,000')
    })

    it('rejects a non-positive amount', async () => {
      const wrapper = await mountPage()
      await fillStep1(wrapper)
      await nextButton(wrapper).trigger('click')
      await wrapper.find('input[type="number"]').setValue(0)
      await nextButton(wrapper).trigger('click')

      expect(errorTexts(wrapper)).toContain(PAGES.CONTRACTS.ERROR_AMOUNT_POSITIVE)
      expect(wrapper.text()).toContain(PAGES.CONTRACTS.CONFIRM_CONTRACT_INFO)
    })

    it('can go back to step 1 keeping the selection', async () => {
      const wrapper = await mountPage()
      await fillStep1(wrapper)
      await nextButton(wrapper).trigger('click')
      await wrapper.find('button.btn-ghost').trigger('click')

      expect(wrapper.text()).toContain(PAGES.CONTRACTS.SELECT_MEMBER_PLAN)
      expect((selects(wrapper).plan.element as HTMLSelectElement).value).toBe('plan-year')
    })
  })

  describe('step 3 (sign and submit)', () => {
    it('refuses to submit without a signature', async () => {
      const wrapper = await mountPage()
      await goToStep3(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(errorTexts(wrapper)).toContain(PAGES.CONTRACTS.ERROR_SIGNATURE_REQUIRED)
      expect(mockCreateContract).not.toHaveBeenCalled()
    })

    it('posts the backend schema (camelCase, no derived fields) and opens the new DRAFT contract', async () => {
      const wrapper = await mountPage()
      await goToStep3(wrapper, 'plan-year')
      wrapper.findComponent(SignaturePadStub).vm.$emit('update:modelValue', SIGNATURE)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      // Exactly the keys of createContractSchema in backend/src/routes/contracts.ts;
      // endDate / remainingCounts / status are derived by the backend.
      expect(mockCreateContract).toHaveBeenCalledWith({
        memberId: 'member-1',
        planId: 'plan-year',
        branchId: 'branch-1',
        startDate: '2024-11-15',
        totalAmount: 30000,
        notes: null
      })
      expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_CREATED)
      expect(mockPush).toHaveBeenCalledWith('/contracts/contract-1')
    })

    it('sends the plan price as a number even when the plan API returns a decimal string', async () => {
      mockPlans.value = [{ id: 'plan-count', name: '計次方案', price: '5000.00' as unknown as number, plan_type: 'COUNT_BASED', class_counts: 10 }]
      const wrapper = await mountPage()
      await goToStep3(wrapper, 'plan-count')
      wrapper.findComponent(SignaturePadStub).vm.$emit('update:modelValue', SIGNATURE)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(mockCreateContract).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-count', totalAmount: 5000 }))
      const body = mockCreateContract.mock.calls[0]![0]
      expect(Object.keys(body).some(k => k.includes('_'))).toBe(false)
    })

    it('stays on the page with an error and does not toast success when creation fails', async () => {
      // createContract resolves null after it has already shown the backend's reason
      mockCreateContract.mockResolvedValue(null)
      const wrapper = await mountPage()
      await goToStep3(wrapper)
      wrapper.findComponent(SignaturePadStub).vm.$emit('update:modelValue', SIGNATURE)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('.submit-error').text()).toContain(PAGES.CONTRACTS.ERROR_CREATE_FAILED)
      expect(toast.success).not.toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    })
  })
})
