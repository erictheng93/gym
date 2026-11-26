import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import EmployeesNew from './new.vue'
import FormField from '../../../../../../packages/ui/components/form/FormField.vue'
import FormInput from '../../../../../../packages/ui/components/form/FormInput.vue'
import FormSelect from '../../../../../../packages/ui/components/form/FormSelect.vue'
import FormRadioGroup from '../../../../../../packages/ui/components/form/FormRadioGroup.vue'
import { MESSAGES } from '~/constants'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const mockPush = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: vi.fn() }))
vi.stubGlobal('definePageMeta', vi.fn())

const BRANCH_ID = 'b0000000-0000-4000-8000-000000000001'
const JOB_TITLE_ID = 'a0000000-0000-4000-8000-000000000001'

const mockCreateEmployee = vi.fn()
vi.stubGlobal('useEmployees', () => ({ createEmployee: mockCreateEmployee }))
// GET /api/branches and GET /api/job-titles answer in camelCase
vi.stubGlobal('useBranches', () => ({
  branches: ref([{ id: BRANCH_ID, name: '信義店' }]),
  fetchBranches: vi.fn().mockResolvedValue(undefined)
}))
vi.stubGlobal('useJobTitles', () => ({
  jobTitles: ref([{ id: JOB_TITLE_ID, name: '教練', code: 'COACH' }]),
  fetchJobTitles: vi.fn().mockResolvedValue(undefined)
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

async function mountPage() {
  const wrapper = mount(EmployeesNew, {
    global: { components: { FormField, FormInput, FormSelect, FormRadioGroup } }
  })
  await flushPromises()
  return wrapper
}

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

const fillRequired = async (w: VueWrapper) => {
  await w.find('input').setValue('  王小明  ') // first input: full name
  const [, jobTitle] = w.findAll('select') // branch is preselected; job title is the second select
  await jobTitle!.setValue(JOB_TITLE_ID)
}

describe('hr/employees/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateEmployee.mockResolvedValue({ id: 'e-1', employeeCode: 'E00002' })
  })

  it('posts the backend createEmployeeSchema field names (camelCase), then toasts and redirects', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(mockCreateEmployee).toHaveBeenCalledWith({
      fullName: '王小明',
      branchId: BRANCH_ID,
      jobTitleId: JOB_TITLE_ID,
      employmentType: 'FULL_TIME',
      status: 'ACTIVE',
      phone: null,
      email: null,
      hireDate: null,
      basicSalary: null
    })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.EMPLOYEE_CREATED)
    expect(mockPush).toHaveBeenCalledWith('/hr/employees')
  })

  it('does not send snake_case or fields the backend has no column for', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    const body = mockCreateEmployee.mock.calls[0]![0] as Record<string, unknown>
    for (const key of ['full_name', 'branch_id', 'job_title_id', 'employment_type', 'supervisor_id', 'employee_code', 'user_id']) {
      expect(body).not.toHaveProperty(key)
    }
  })

  it('requires a job title (the backend rejects a create without one)', async () => {
    const wrapper = await mountPage()
    await wrapper.find('input').setValue('王小明')
    await submit(wrapper)

    expect(mockCreateEmployee).not.toHaveBeenCalled()
  })

  it('shows no success toast and does not redirect when the create fails (createEmployee resolves null)', async () => {
    mockCreateEmployee.mockResolvedValue(null)
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(wrapper.find('.submit-error').exists()).toBe(true)
  })
})
