import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref, onMounted, defineComponent } from 'vue'
import RecordPage from './[recordId].vue'

// vitest.setup.ts replaces computed/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('ref', ref)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('definePageMeta', vi.fn())
vi.stubGlobal('useRoute', () => ({ params: { recordId: 'rec-1' } }))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)
vi.stubGlobal('useConfirm', () => ({ confirm: vi.fn().mockResolvedValue(true) }))

const record = ref<Record<string, unknown> | null>(null)
const mockApprove = vi.fn()
const mockPaid = vi.fn()
const mockFetchRecord = vi.fn()
const canManage = ref(true)
const canView = ref(true)

vi.mock('~/composables/hr', () => ({
  usePayroll: () => ({
    currentSalaryRecord: record,
    isLoading: ref(false),
    fetchSalaryRecord: mockFetchRecord,
    updateSalaryRecord: vi.fn(),
    approveSalary: mockApprove,
    markAsPaid: mockPaid,
    getStatusLabel: (s: string) => s,
    getStatusVariant: () => 'default',
    formatCurrency: (n: number) => `NT$${n}`
  }),
  useHrAccess: () => ({ canViewHr: canView, canManagePayroll: canManage })
}))

const PageHeader = defineComponent({
  props: { title: { type: String, default: '' } },
  template: '<header><h1>{{ title }}</h1><slot name="actions" /></header>'
})
const stubs = {
  PageContainer: defineComponent({ template: '<div><slot /></div>' }),
  PageHeader,
  EmptyState: defineComponent({ props: { title: String }, template: '<div class="empty-state">{{ title }}</div>' }),
  LoadingState: true,
  AppAvatar: true,
  AppBadge: true,
  FormInput: true,
  FormTextarea: true
}

const makeRecord = (status: string) => ({
  id: 'rec-1',
  employee_id: 'e1',
  employee: { id: 'e1', full_name: '張三', employee_code: 'E00001' },
  period: '2026-01',
  base_salary: 45000,
  overtime_hours: 0,
  overtime_pay: 0,
  commission: 0,
  bonus: 0,
  deductions: 0,
  net_salary: 45000,
  hourly_rate: 187.5,
  notes: null,
  status
})

const mountPage = async () => {
  const wrapper = mount(RecordPage, { global: { stubs } })
  await flushPromises()
  return wrapper
}

const clickButton = async (wrapper: ReturnType<typeof mount>, text: string) => {
  const button = wrapper.findAll('button').find(b => b.text().includes(text))
  expect(button, `button "${text}"`).toBeTruthy()
  await button!.trigger('click')
  await flushPromises()
}

describe('hr/payroll/[recordId].vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canManage.value = true
    canView.value = true
    record.value = makeRecord('PENDING')
    mockFetchRecord.mockResolvedValue(undefined)
    mockApprove.mockResolvedValue(undefined)
    mockPaid.mockResolvedValue(undefined)
  })

  it('approves, toasts success and refetches the record', async () => {
    const wrapper = await mountPage()
    mockFetchRecord.mockClear()
    await clickButton(wrapper, '核准')

    expect(mockApprove).toHaveBeenCalledWith('rec-1')
    expect(toast.success).toHaveBeenCalledWith('薪資已核准')
    expect(mockFetchRecord).toHaveBeenCalledWith('rec-1')
  })

  it('shows the backend error and no success toast when approving fails', async () => {
    mockApprove.mockRejectedValue(new Error('此記錄無法核准'))
    const wrapper = await mountPage()
    await clickButton(wrapper, '核准')

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('此記錄無法核准')
  })

  it('shows the backend error when marking as paid fails', async () => {
    record.value = makeRecord('APPROVED')
    mockPaid.mockRejectedValue(new Error('權限不足'))
    const wrapper = await mountPage()
    await clickButton(wrapper, '標記已發放')

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('權限不足')
  })

  it('hides the approve action for a manager (read-only role)', async () => {
    canManage.value = false
    const wrapper = await mountPage()

    expect(wrapper.findAll('button').some(b => b.text().includes('核准'))).toBe(false)
    expect(wrapper.text()).toContain('張三')
  })

  it('shows a no-permission state and does not fetch for a role without read access', async () => {
    canView.value = false
    const wrapper = await mountPage()

    expect(wrapper.find('.empty-state').text()).toBe('無權限')
    expect(mockFetchRecord).not.toHaveBeenCalled()
  })
})
