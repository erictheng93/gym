import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted, reactive } from 'vue'
import LeadsNew from './new.vue'
import FormField from '../../../../../packages/ui/components/form/FormField.vue'
import FormInput from '../../../../../packages/ui/components/form/FormInput.vue'
import FormSelect from '../../../../../packages/ui/components/form/FormSelect.vue'
import FormTextarea from '../../../../../packages/ui/components/form/FormTextarea.vue'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('reactive', reactive)

const mockPush = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: vi.fn() }))
vi.stubGlobal('definePageMeta', vi.fn())

const BRANCH_ID = 'b0000000-0000-4000-8000-000000000001'
const EMPLOYEE_ID = 'e0000000-0000-4000-8000-000000000001'

const mockCreateLead = vi.fn()
vi.stubGlobal('useLeads', () => ({ createLead: mockCreateLead }))
vi.stubGlobal('useBranches', () => ({
  branches: ref([{ id: BRANCH_ID, name: '信義店' }]),
  fetchBranches: vi.fn().mockResolvedValue(undefined)
}))
// GET /api/employees answers in camelCase (fullName)
vi.stubGlobal('useEmployees', () => ({
  employees: ref([{ id: EMPLOYEE_ID, fullName: '王教練' }]),
  fetchEmployees: vi.fn().mockResolvedValue(undefined)
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

async function mountPage() {
  const wrapper = mount(LeadsNew, {
    global: { components: { FormField, FormInput, FormSelect, FormTextarea } }
  })
  await flushPromises()
  return wrapper
}

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

const fillRequired = async (w: VueWrapper) => {
  const [name, phone] = w.findAll('input')
  await name!.setValue('  陳小華 ')
  await phone!.setValue('0912345678')
}

describe('leads/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateLead.mockResolvedValue({ id: 'l-1' })
  })

  it('posts the backend createLeadSchema field names (camelCase), then toasts and redirects', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(mockCreateLead).toHaveBeenCalledWith({
      fullName: '陳小華',
      phone: '0912345678',
      email: undefined,
      source: 'WALK_IN',
      sourceDetail: undefined,
      branchId: BRANCH_ID,
      assignedToId: undefined,
      notes: undefined
    })
    expect(toast.success).toHaveBeenCalledWith('已成功建立潛在客戶')
    expect(mockPush).toHaveBeenCalledWith('/leads')
  })

  it('does not send snake_case, nulls or UTM fields the backend has no column for', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    const body = mockCreateLead.mock.calls[0]![0] as Record<string, unknown>
    for (const key of ['name', 'branch_id', 'assigned_to', 'utm_source', 'utm_medium', 'utm_campaign']) {
      expect(body).not.toHaveProperty(key)
    }
    expect(Object.values(body)).not.toContain(null)
  })

  it('lists employees by fullName in the assignee picker', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('王教練')
  })

  it('shows no success toast and does not redirect when the create fails (createLead resolves null)', async () => {
    mockCreateLead.mockResolvedValue(null)
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(wrapper.find('.submit-error').exists()).toBe(true)
  })
})
