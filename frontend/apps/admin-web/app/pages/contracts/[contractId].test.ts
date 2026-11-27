import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, defineComponent, h, onMounted, watch, reactive } from 'vue'
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
const mockPush = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: vi.fn() }))
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
  cancelContract: vi.fn(),
  transferContract: vi.fn(),
  renewContract: vi.fn(),
  signContract: vi.fn()
}
vi.stubGlobal('useContracts', () => contractsApi)

const authUser = ref<{ role: string }>({ role: 'manager' })
vi.stubGlobal('useAuth', () => ({ user: authUser }))
const mockSearchMembers = vi.fn()
vi.stubGlobal('useMembers', () => ({ searchMembers: mockSearchMembers }))

const SIGNATURE = 'data:image/png;base64,signed'
// The page lazy-loads SignaturePad; the stub only has to forward v-model.
const SignaturePadStub = defineComponent({
  name: 'SignaturePadStub',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: () => () => h('div', { class: 'signature-pad-stub' })
})

const paymentsState = ref<unknown[]>([])
const mockFetchPayments = vi.fn()
const mockCreatePayment = vi.fn()
vi.stubGlobal('usePayments', () => ({ fetchPayments: mockFetchPayments, payments: paymentsState, createPayment: mockCreatePayment }))

/** GET /api/contracts/:id exactly as the backend sends it */
const wire = (overrides: {
  status?: string; allowPause?: boolean; allowTransfer?: boolean; paidAmount?: string
  digitalSignature?: string | null; signatureUrl?: string | null
} = {}): ApiContractDetail => ({
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
    digitalSignature: overrides.digitalSignature ?? null,
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
  signatureUrl: overrides.signatureUrl ?? null,
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
    global: { stubs: { NuxtLink: { template: '<a><slot /></a>' }, teleport: true, LazySignaturePad: SignaturePadStub } }
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
    authUser.value = { role: 'manager' }
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

  it('shows pause / extend / terminate / transfer / renew for an ACTIVE contract (manager)', async () => {
    const wrapper = await mountPage()

    for (const label of [
      PAGES.CONTRACTS.PAUSE_CONTRACT, PAGES.CONTRACTS.EXTEND_CONTRACT, PAGES.CONTRACTS.TERMINATE_CONTRACT,
      PAGES.CONTRACTS.TRANSFER_CONTRACT, PAGES.CONTRACTS.RENEW_CONTRACT
    ]) {
      const button = headerButton(wrapper, label)
      expect(button, label).toBeDefined()
      expect(button!.attributes('disabled'), label).toBeUndefined()
    }
    expect(headerButton(wrapper, PAGES.CONTRACTS.ACTIVATE_CONTRACT)).toBeUndefined()
    expect(wrapper.text()).not.toContain('尚未開放')
  })

  it('hides transfer for staff, for a plan that does not allow it, and for a PAUSED contract', async () => {
    authUser.value = { role: 'staff' }
    let wrapper = await mountPage()
    expect(headerButton(wrapper, PAGES.CONTRACTS.TRANSFER_CONTRACT)).toBeUndefined()
    expect(headerButton(wrapper, PAGES.CONTRACTS.RENEW_CONTRACT)).toBeDefined() // renew is open to staff

    authUser.value = { role: 'manager' }
    loadAs({ allowTransfer: false })
    wrapper = await mountPage()
    expect(headerButton(wrapper, PAGES.CONTRACTS.TRANSFER_CONTRACT)).toBeUndefined()

    loadAs({ status: 'PAUSED' })
    wrapper = await mountPage()
    expect(headerButton(wrapper, PAGES.CONTRACTS.TRANSFER_CONTRACT)).toBeUndefined()
    expect(headerButton(wrapper, PAGES.CONTRACTS.RENEW_CONTRACT)).toBeUndefined()
  })

  it('transfers to the searched member with an optional fee and opens the new contract', async () => {
    mockSearchMembers.mockResolvedValue([
      // the current holder is filtered out of the results
      { id: 'a1b2c3d4-0000-4000-8000-000000000001', fullName: '王小明', memberCode: 'M0001', phone: '0912345678' },
      { id: 'm-2', fullName: '陳小華', memberCode: 'M0002', phone: '0922000000' }
    ])
    contractsApi.transferContract.mockResolvedValue({ original: { id: CONTRACT_ID }, contract: { id: 'new-contract' } })
    const wrapper = await mountPage()

    await headerButton(wrapper, PAGES.CONTRACTS.TRANSFER_CONTRACT)!.trigger('click')
    const modal = () => modalWith(wrapper, PAGES.CONTRACTS.TRANSFER_HINT)
    expect(modal().find('[data-testid="confirm-transfer"]').attributes('disabled')).toBeDefined()

    await modal().find('[data-testid="transfer-search"]').setValue('陳')
    await modal().find('[data-testid="transfer-search"]').trigger('keydown.enter')
    await flushPromises()
    expect(mockSearchMembers).toHaveBeenCalledWith('陳', 8)
    const results = modal().findAll('[data-testid="transfer-result"]')
    expect(results).toHaveLength(1)
    await results[0]!.trigger('click')
    expect(modal().find('[data-testid="transfer-selected"]').text()).toContain('陳小華')

    await modal().find('[data-testid="transfer-fee"]').setValue(300)
    await modal().find('[data-testid="transfer-fee-method"]').setValue('LINE_PAY')
    await modal().find('[data-testid="confirm-transfer"]').trigger('click')
    await flushPromises()

    expect(contractsApi.transferContract).toHaveBeenCalledWith(CONTRACT_ID, {
      toMemberId: 'm-2', fee: 300, paymentMethod: 'LINE_PAY', reason: undefined
    })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_TRANSFERRED)
    expect(mockPush).toHaveBeenCalledWith('/contracts/new-contract')
  })

  it('renews after confirmation and redirects to the new draft', async () => {
    mockConfirm.mockResolvedValue(true)
    contractsApi.renewContract.mockResolvedValue({ id: 'renewal-draft', status: 'DRAFT' })
    const wrapper = await mountPage()

    await headerButton(wrapper, PAGES.CONTRACTS.RENEW_CONTRACT)!.trigger('click')
    await flushPromises()

    // endDate 2027-11-01 is in the future: the renewal starts the next day, at the plan's current price
    const { message } = mockConfirm.mock.calls[0]![0]
    expect(message).toContain('2027年11月2日')
    expect(message).toContain('NT$ 30,000')
    expect(contractsApi.renewContract).toHaveBeenCalledWith(CONTRACT_ID)
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_RENEWED)
    expect(mockPush).toHaveBeenCalledWith('/contracts/renewal-draft')
  })

  it('does not renew when the confirmation is dismissed', async () => {
    mockConfirm.mockResolvedValue(false)
    const wrapper = await mountPage()
    await headerButton(wrapper, PAGES.CONTRACTS.RENEW_CONTRACT)!.trigger('click')
    await flushPromises()
    expect(contractsApi.renewContract).not.toHaveBeenCalled()
  })

  it('blocks activation of an unsigned DRAFT and stores the signature from the sign modal', async () => {
    loadAs({ status: 'DRAFT' })
    contractsApi.signContract.mockResolvedValue({ id: CONTRACT_ID, digitalSignature: 'file-1' })
    const wrapper = await mountPage()

    expect(headerButton(wrapper, PAGES.CONTRACTS.ACTIVATE_CONTRACT)!.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="signature-card"]').text()).toContain(PAGES.CONTRACTS.SIGN_REQUIRED_TO_ACTIVATE)

    await wrapper.find('.signature-action').trigger('click')
    const modal = () => modalWith(wrapper, PAGES.CONTRACTS.SIGN_INSTRUCTION)
    expect(modal().find('[data-testid="save-signature"]').attributes('disabled')).toBeDefined()
    wrapper.findComponent(SignaturePadStub).vm.$emit('update:modelValue', SIGNATURE)
    await flushPromises()
    await modal().find('[data-testid="save-signature"]').trigger('click')
    await flushPromises()

    expect(contractsApi.signContract).toHaveBeenCalledWith(CONTRACT_ID, SIGNATURE)
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.CONTRACT_SIGNED)
    expect(contractsApi.getContract).toHaveBeenCalledTimes(2) // reloaded
  })

  it('shows the stored signature image and offers no re-sign on a signed ACTIVE contract', async () => {
    loadAs({ digitalSignature: 'file-1', signatureUrl: 'https://r2.test/sig.png' })
    const wrapper = await mountPage()
    expect(wrapper.find('.signature-preview img').attributes('src')).toBe('https://r2.test/sig.png')
    expect(wrapper.find('.signature-action').exists()).toBe(false)
  })

  it('hides pause when the plan does not allow it', async () => {
    loadAs({ allowPause: false })
    const wrapper = await mountPage()
    expect(headerButton(wrapper, PAGES.CONTRACTS.PAUSE_CONTRACT)).toBeUndefined()
  })

  it('keeps 啟用合約 for a signed DRAFT contract and calls activateContract', async () => {
    loadAs({ status: 'DRAFT', digitalSignature: 'file-1' })
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
