import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, watch, onMounted, onBeforeUnmount } from 'vue'
import PaymentsIndex from './index.vue'
import { STATUS } from '~/constants'
import { normalizePayment, type ApiPayment } from '~/composables/usePayments'
import type { Payment } from '~/types/schema'

vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
vi.stubGlobal('definePageMeta', vi.fn())

// One row per record status, in the GET /api/payments wire format
const base: ApiPayment = {
  id: 'p-completed',
  contractId: 'c-1',
  memberId: 'm-1',
  branchId: 'branch-1',
  amount: '12000.00',
  paymentMethod: 'CASH',
  paymentDate: '2026-11-20T03:15:00.000Z',
  type: 'INCOME',
  status: 'COMPLETED',
  receiptNo: null,
  notes: null,
  createdBy: null,
  createdAt: '2026-11-20T03:15:00.000Z',
  tenantId: 't-1',
  member: { id: 'm-1', fullName: '王小明', memberCode: 'M0001' },
  contract: { id: 'c-1', contractNo: 'CT-2026-0001' }
}
const apiRows: ApiPayment[] = [
  base,
  { ...base, id: 'p-pending', status: 'PENDING', amount: '3000.00', paymentMethod: 'CREDIT_CARD' },
  { ...base, id: 'p-failed', status: 'FAILED', amount: '800.00', paymentMethod: 'LINE_PAY' }
]
const rows: Payment[] = apiRows.map(normalizePayment)

const mockFetchPayments = vi.fn()
const mockGetPaymentStats = vi.fn()
const mockExport = vi.fn()
const payments = ref<Payment[]>([])
const totalCount = ref(0)

vi.stubGlobal('usePayments', () => ({
  payments,
  totalCount,
  isLoading: ref(false),
  fetchPayments: mockFetchPayments,
  getPaymentStats: mockGetPaymentStats,
  exportPayments: mockExport
}))
vi.stubGlobal('useBranches', () => ({
  branches: ref([{ id: 'branch-1', name: '總店' }]),
  fetchBranches: vi.fn().mockResolvedValue(undefined)
}))

// Minimal DataTable: renders each column's #cell-<key> slot for every row
const DataTableStub = defineComponent({
  props: { columns: { type: Array, required: true }, data: { type: Array, required: true } },
  setup(props, { slots }) {
    return () => h('table', (props.data as Payment[]).map(row =>
      h('tr', { 'data-row': row.id }, (props.columns as Array<{ key: string }>).map(col =>
        h('td', slots[`cell-${col.key}`]?.({ row }))
      ))
    ))
  }
})
const AppBadgeStub = defineComponent({
  props: { label: String, variant: String },
  setup: props => () => h('span', { class: ['badge', `badge-${props.variant}`] }, props.label)
})
const passthrough = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })

async function mountPage() {
  const wrapper = mount(PaymentsIndex, {
    global: {
      // Nuxt auto-imports formatCurrency into templates
      mocks: { formatCurrency: (n: number) => `NT$${n}` },
      stubs: {
        PageContainer: passthrough,
        PageHeader: true,
        StatsBar: true,
        LoadingState: true,
        EmptyState: true,
        DataPagination: true,
        AppAvatar: true,
        NuxtLink: passthrough,
        DataTable: DataTableStub,
        AppBadge: AppBadgeStub
      }
    }
  })
  await flushPromises()
  return wrapper
}

describe('payments/index.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    payments.value = rows
    totalCount.value = 3
    mockFetchPayments.mockResolvedValue(undefined)
    mockGetPaymentStats.mockResolvedValue({ totalIncome: 52000, totalRefund: 2000, netIncome: 50000, paymentCount: 7 })
  })

  it('shows the backend summary (completed payments only) in the stat cards', async () => {
    const wrapper = await mountPage()

    expect(mockGetPaymentStats).toHaveBeenCalledWith(undefined, undefined, undefined)
    expect(wrapper.find('[data-testid="stat-income"]').text()).toBe('NT$52000')
    expect(wrapper.find('[data-testid="stat-refund"]').text()).toBe('NT$2000')
    expect(wrapper.find('[data-testid="stat-net"]').text()).toBe('NT$50000')
    expect(wrapper.text()).toContain('7')
  })

  it('shows each payment status with its design-system color', async () => {
    const wrapper = await mountPage()
    const badge = (id: string) => wrapper.find(`[data-row="${id}"] [data-testid="payment-status"]`)

    expect(badge('p-completed').text()).toBe(STATUS.PAYMENT_RECORD.COMPLETED)
    expect(badge('p-completed').classes()).toContain('badge-success')
    expect(badge('p-pending').text()).toBe(STATUS.PAYMENT_RECORD.PENDING)
    expect(badge('p-pending').classes()).toContain('badge-warning')
    expect(badge('p-failed').text()).toBe(STATUS.PAYMENT_RECORD.FAILED)
    expect(badge('p-failed').classes()).toContain('badge-error')
  })

  it('does not present pending or failed payments as received money', async () => {
    const wrapper = await mountPage()
    const amount = (id: string) => wrapper.find(`[data-row="${id}"] [data-testid="payment-amount"]`)

    expect(amount('p-completed').classes()).toContain('amount-income')
    expect(amount('p-pending').classes()).toContain('amount-muted')
    expect(amount('p-pending').classes()).not.toContain('amount-income')
    expect(amount('p-failed').classes()).toContain('amount-muted')
  })

  it('renders the camelCase member, contract and method fields', async () => {
    const wrapper = await mountPage()
    const row = wrapper.find('[data-row="p-completed"]').text()

    expect(row).toContain('王小明')
    expect(row).toContain('M0001')
    expect(row).toContain('CT-2026-0001')
    expect(row).toContain('現金')
    expect(row).toContain('總店')
  })

  it('sends the status filter to the list query', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="filter-status"]').setValue('PENDING')
    await flushPromises()

    expect(mockFetchPayments).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'PENDING', page: 1 }))
  })

  it('exports with the current branch and date filters', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="export-payments"]').trigger('click')

    expect(mockExport).toHaveBeenCalledWith({ branchId: undefined, startDate: undefined, endDate: undefined })
  })
})
