import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import PaymentNew from './new.vue'
import { MESSAGES, PAGES } from '~/constants'
import type { PayableContract } from '~/composables/usePayments'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const mockPush = vi.fn()
const mockRoute: { query: Record<string, string> } = { query: {} }
vi.stubGlobal('useRoute', () => mockRoute)
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: vi.fn() }))
vi.stubGlobal('definePageMeta', vi.fn())

const mockCreatePayment = vi.fn()
const mockFetchMemberContracts = vi.fn()
// GET /api/members answers in camelCase (backend MEMBER_RETURNING)
const mockMembers = ref([
  { id: 'member-1', fullName: '王小明', memberCode: 'M0001' },
  { id: 'member-2', fullName: '李小華', memberCode: 'M0002' }
])
const mockBranches = ref([
  { id: 'branch-1', name: '總店' },
  { id: 'branch-2', name: '信義店' }
])
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }

vi.stubGlobal('usePayments', () => ({
  createPayment: mockCreatePayment,
  fetchMemberContracts: mockFetchMemberContracts
}))
vi.stubGlobal('useMembers', () => ({ members: mockMembers, fetchMembers: vi.fn().mockResolvedValue(undefined) }))
vi.stubGlobal('useBranches', () => ({ branches: mockBranches, fetchBranches: vi.fn().mockResolvedValue(undefined) }))
vi.stubGlobal('useToast', () => toast)

const contract: PayableContract = {
  id: 'contract-1',
  contractNo: 'CT-2026-0001',
  status: 'DRAFT',
  branchId: 'branch-2',
  totalAmount: 24000,
  paidAmount: 10000,
  paymentStatus: 'PARTIAL',
  plan: { id: 'plan-1', name: '年約' }
}

async function mountPage() {
  const wrapper = mount(PaymentNew)
  await flushPromises()
  return wrapper
}

const selects = (w: VueWrapper) => {
  const [member, contractSelect, branch] = w.findAll('select')
  return { member: member!, contract: contractSelect!, branch: branch! }
}

describe('payments/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-26T02:00:00Z'))
    mockRoute.query = {}
    mockFetchMemberContracts.mockResolvedValue([contract])
    mockCreatePayment.mockResolvedValue({ id: 'payment-1' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists members by their camelCase API fields', async () => {
    const wrapper = await mountPage()
    expect(selects(wrapper).member.text()).toContain('王小明 (M0001)')
  })

  it('loads the member contracts and pre-fills the unpaid balance and contract branch', async () => {
    const wrapper = await mountPage()
    await selects(wrapper).member.setValue('member-1')
    await flushPromises()

    expect(mockFetchMemberContracts).toHaveBeenCalledWith('member-1')
    expect((selects(wrapper).contract.element as HTMLSelectElement).value).toBe('contract-1')
    expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('14000')
    expect((selects(wrapper).branch.element as HTMLSelectElement).value).toBe('branch-2')
  })

  it('records the payment with exactly the backend createPaymentSchema fields', async () => {
    mockRoute.query = { member: 'member-1', contract: 'contract-1' }
    const wrapper = await mountPage()

    await wrapper.find('input[value="BANK_TRANSFER"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockCreatePayment).toHaveBeenCalledWith({
      contractId: 'contract-1',
      memberId: 'member-1',
      branchId: 'branch-2',
      amount: 14000,
      paymentMethod: 'BANK_TRANSFER',
      paymentType: 'INCOME',
      paymentDate: '2026-11-26',
      notes: null
    })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.PAYMENT_CREATED)
    expect(mockPush).toHaveBeenCalledWith('/payments')
  })

  it('records a refund with paymentType REFUND', async () => {
    mockRoute.query = { member: 'member-1', contract: 'contract-1' }
    const wrapper = await mountPage()

    await wrapper.find('button.type-option.refund').trigger('click')
    await wrapper.find('input[type="number"]').setValue(500)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockCreatePayment).toHaveBeenCalledWith(expect.objectContaining({ paymentType: 'REFUND', amount: 500 }))
  })

  it('requires a contract (the backend rejects payments without one)', async () => {
    mockFetchMemberContracts.mockResolvedValue([])
    mockRoute.query = { member: 'member-1' }
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain(PAGES.PAYMENTS.NO_MEMBER_CONTRACTS)
    await wrapper.find('input[type="number"]').setValue(1000)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockCreatePayment).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain(PAGES.PAYMENTS.ERROR_SELECT_CONTRACT)
  })

  it('stays on the form and does not report success when the backend rejects it', async () => {
    mockCreatePayment.mockResolvedValue(null)
    mockRoute.query = { member: 'member-1', contract: 'contract-1' }
    const wrapper = await mountPage()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(wrapper.find('.submit-error').text()).toContain(PAGES.PAYMENTS.ERROR_CREATE_FAILED)
  })
})
