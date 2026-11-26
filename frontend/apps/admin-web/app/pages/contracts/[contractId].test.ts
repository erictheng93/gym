import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, onMounted, watch, reactive } from 'vue'
import ContractDetailPage from './[contractId].vue'
import { normalizeContractDetail, type ApiContractDetail } from '~/composables/useContracts'
import { MESSAGES, PAGES } from '~/constants'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('reactive', reactive)

const CONTRACT_ID = 'c0a8012e-0000-4000-8000-000000000001'

vi.stubGlobal('useRoute', () => ({ params: { contractId: CONTRACT_ID } }))
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), back: vi.fn() }))
vi.stubGlobal('definePageMeta', vi.fn())

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)
const mockConfirm = vi.fn()
vi.stubGlobal('useConfirm', () => ({ confirm: mockConfirm }))

const contractsApi = {
  getContract: vi.fn(),
  activateContract: vi.fn(),
  pauseContract: vi.fn(),
  resumeContract: vi.fn(),
  extendContract: vi.fn(),
  cancelContract: vi.fn()
}
vi.stubGlobal('useContracts', () => contractsApi)

const paymentsState = ref<unknown[]>([])
const mockFetchPayments = vi.fn()
const mockCreatePayment = vi.fn()
vi.stubGlobal('usePayments', () => ({ fetchPayments: mockFetchPayments, payments: paymentsState, createPayment: mockCreatePayment }))

/** GET /api/contracts/:id exactly as the backend sends it */
const wire = (overrides: { status?: string; allowPause?: boolean; allowTransfer?: boolean; paidAmount?: string } = {}): ApiContractDetail => ({
  contract: {
    id: CONTRACT_ID,
    contractNo: 'C2026000001',
    memberId: 'a1b2c3d4-0000-4000-8000-000000000001',
    planId: 'p0000000-0000-4000-8000-000000000001',
    branchId: 'b0000000-0000-4000-8000-000000000001',
    salesPersonId: null,
    status: (overrides.status ?? 'ACTIVE') as ApiContractDetail['contract']['status'],
    signDate: '2026-11-01',
    startDate: '2026-11-01',
    originalEndDate: '2027-11-01',
    endDate: '2027-11-01',
    remainingCounts: null,
    totalAmount: '30000.00',
    paidAmount: overrides.paidAmount ?? '12000.00',
    paymentStatus: 'PARTIAL',
    digitalSignature: null,
    notes: null
  },
  member: { id: 'a1b2c3d4-0000-4000-8000-000000000001', fullName: '王小明', memberCode: 'M0001', phone: '0912345678', email: null },
  plan: {
    id: 'p0000000-0000-4000-8000-000000000001',
    name: '年卡',
    planType: 'TIME_BASED',
    price: '30000.00',
    durationMonths: 12,
    classCounts: null,
    allowPause: overrides.allowPause ?? true,
    allowTransfer: overrides.allowTransfer ?? true
  },
  branch: { id: 'b0000000-0000-4000-8000-000000000001', name: '信義店' },
  salesPerson: { id: 'e-1', fullName: '林業務' },
  logs: [{
    id: 'l-1',
    contractId: CONTRACT_ID,
    logType: 'EXTEND',
    startDate: '2027-10-25',
    endDate: '2027-11-01',
    daysAffected: 7,
    reason: '設備維修補償',
    dateCreated: '2026-11-20T03:00:00.000Z',
    createdByName: '林業務'
  }]
})

const loadAs = (overrides: Parameters<typeof wire>[0] = {}) =>
  contractsApi.getContract.mockResolvedValue(normalizeContractDetail(wire(overrides)))

async function mountPage() {
  const wrapper = mount(ContractDetailPage, {
    global: { stubs: { NuxtLink: { template: '<a><slot /></a>' }, teleport: true } }
  })
  await flushPromises()
  return wrapper
}

const modalWith = (w: VueWrapper, hint: string) =>
  w.findAll('.modal-content').find(m => m.text().includes(hint))!

const headerButton = (w: VueWrapper, label: string) =>
  w.findAll('.header-actions button').find(b => b.text().includes(label))

describe('contracts/[contractId].vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    paymentsState.value = []
    mockFetchPayments.mockResolvedValue(undefined)
    loadAs()
  })

  it('renders the nested camelCase detail the backend returns', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()

    expect(contractsApi.getContract).toHaveBeenCalledWith(CONTRACT_ID, true)
    expect(text).toContain('C2026000001')
    expect(text).toContain('王小明')
    expect(text).toContain('M0001')
    expect(text).toContain('年卡')
    expect(text).toContain('NT$ 30,000')
    expect(text).toContain('信義店')
    expect(text).toContain('林業務')
    expect(text).toContain('12 ' + PAGES.CONTRACTS.MONTHS)
    expect(text).toContain('設備維修補償')
  })

  it('shows pause / extend / terminate for an ACTIVE contract, and transfer + renew as 「尚未開放」', async () => {
    const wrapper = await mountPage()

    expect(headerButton(wrapper, PAGES.CONTRACTS.PAUSE_CONTRACT)).toBeDefined()
    expect(headerButton(wrapper, PAGES.CONTRACTS.EXTEND_CONTRACT)).toBeDefined()
    expect(headerButton(wrapper, PAGES.CONTRACTS.TERMINATE_CONTRACT)).toBeDefined()
    expect(headerButton(wrapper, PAGES.CONTRACTS.ACTIVATE_CONTRACT)).toBeUndefined()

    for (const id of ['transfer-coming-soon', 'renew-coming-soon']) {
      const button = wrapper.find(`[data-testid="${id}"]`)
      expect(button.exists()).toBe(true)
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.text()).toContain(PAGES.CONTRACTS.NOT_YET_AVAILABLE)
    }
  })

  it('hides pause when the plan does not allow it', async () => {
    loadAs({ allowPause: false })
    const wrapper = await mountPage()
    expect(headerButton(wrapper, PAGES.CONTRACTS.PAUSE_CONTRACT)).toBeUndefined()
  })

  it('keeps 啟用合約 for a DRAFT contract and calls activateContract', async () => {
    loadAs({ status: 'DRAFT' })
    mockConfirm.mockResolvedValue(true)
    contractsApi.activateContract.mockResolvedValue({ id: CONTRACT_ID, status: 'ACTIVE' })
    const wrapper = await mountPage()

    await headerButton(wrapper, PAGES.CONTRACTS.ACTIVATE_CONTRACT)!.trigger('click')
    await flushPromises()

    expect(contractsApi.activateContract).toHaveBeenCalledWith(CONTRACT_ID)
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_ACTIVATED)
    expect(contractsApi.getContract).toHaveBeenCalledTimes(2) // reloaded
  })

  it('resumes a PAUSED contract through resumeContract', async () => {
    loadAs({ status: 'PAUSED' })
    contractsApi.resumeContract.mockResolvedValue({ id: CONTRACT_ID, status: 'ACTIVE' })
    const wrapper = await mountPage()

    await headerButton(wrapper, PAGES.CONTRACTS.RESUME_CONTRACT)!.trigger('click')
    const confirmResume = wrapper.findAll('.modal-actions button').find(b => b.text() === PAGES.CONTRACTS.CONFIRM_RESUME)!
    await confirmResume.trigger('click')
    await flushPromises()

    expect(contractsApi.resumeContract).toHaveBeenCalledWith(CONTRACT_ID)
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_RESUMED)
  })

  describe('terminate', () => {
    async function openTerminate(wrapper: VueWrapper) {
      await headerButton(wrapper, PAGES.CONTRACTS.TERMINATE_CONTRACT)!.trigger('click')
      // re-query on every access: the teleport stub re-renders the modal's elements
      return { find: (selector: string) => modalWith(wrapper, PAGES.CONTRACTS.TERMINATE_HINT).find(selector) }
    }

    it('sends reason + refund to the single cancel endpoint and never records a payment itself', async () => {
      contractsApi.cancelContract.mockResolvedValue({ contract: { status: 'CANCELLED' }, refund: { id: 'p-1' } })
      const wrapper = await mountPage()
      const modal = await openTerminate(wrapper)

      await modal.find('textarea').setValue('會員搬家')
      await modal.find('input[type="number"]').setValue(1200)
      await modal.find('select').setValue('BANK_TRANSFER')
      await modal.find('button.btn-danger').trigger('click')
      await flushPromises()

      expect(contractsApi.cancelContract).toHaveBeenCalledWith(CONTRACT_ID, {
        reason: '會員搬家',
        refund: { amount: 1200, paymentMethod: 'BANK_TRANSFER' }
      })
      expect(mockCreatePayment).not.toHaveBeenCalled()
      expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_TERMINATED)
    })

    it('does not toast success when the backend refuses (composable already showed why)', async () => {
      contractsApi.cancelContract.mockResolvedValue(null)
      const wrapper = await mountPage()
      const modal = await openTerminate(wrapper)

      await modal.find('button.btn-danger').trigger('click')
      await flushPromises()

      expect(contractsApi.cancelContract).toHaveBeenCalledWith(CONTRACT_ID, { reason: undefined, refund: null })
      expect(toast.success).not.toHaveBeenCalled()
      expect(contractsApi.getContract).toHaveBeenCalledTimes(1)
    })

    it('blocks a refund above the money received', async () => {
      const wrapper = await mountPage() // paidAmount 12000
      const modal = await openTerminate(wrapper)

      await modal.find('input[type="number"]').setValue(12001)

      expect(modal.find('[data-testid="refund-error"]').exists()).toBe(true)
      expect(modal.find('button.btn-danger').attributes('disabled')).toBeDefined()
    })
  })

  it('extends through extendContract with the entered days', async () => {
    contractsApi.extendContract.mockResolvedValue({ id: CONTRACT_ID })
    const wrapper = await mountPage()

    await headerButton(wrapper, PAGES.CONTRACTS.EXTEND_CONTRACT)!.trigger('click')
    const modal = () => modalWith(wrapper, PAGES.CONTRACTS.EXTEND_HINT)
    await modal().find('input[type="number"]').setValue(10)
    expect(modal().text()).toContain('2027年11月11日') // preview: 2027-11-01 + 10 days
    await modal().find('button.btn-primary').trigger('click')
    await flushPromises()

    expect(contractsApi.extendContract).toHaveBeenCalledWith(CONTRACT_ID, { days: 10, reason: undefined })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_EXTENDED)
  })

  it('shows no actions for a CANCELLED contract', async () => {
    loadAs({ status: 'CANCELLED' })
    const wrapper = await mountPage()
    expect(wrapper.findAll('.header-actions button')).toHaveLength(0)
    expect(wrapper.text()).toContain('終止')
  })
})
