import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import EmployeeEdit from './[employeeId]/edit.vue'
import EmployeeDetail from './[employeeId]/index.vue'
import { MESSAGES } from '~/constants'
import { PERMISSION_MODULES } from '~/constants/permissions'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const EMPLOYEE_ID = 'e0000000-0000-4000-8000-000000000001'
const JOB_TITLE_ID = 'a0000000-0000-4000-8000-000000000001'
const BRANCH_ID = 'b0000000-0000-4000-8000-000000000001'

const mockPush = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ params: { employeeId: EMPLOYEE_ID } }))
vi.stubGlobal('definePageMeta', vi.fn())

const mod = PERMISSION_MODULES[0]!
const [act0, act1] = [mod.actions[0]!, mod.actions[1]!]

// Backend GET /api/employees/:id row: camelCase, `status`, decimal salary as a string
const employee = {
  id: EMPLOYEE_ID,
  userId: null,
  branchId: BRANCH_ID,
  jobTitleId: JOB_TITLE_ID,
  employeeCode: 'E00001',
  fullName: '張三',
  phone: '0912345678',
  email: 'zhang@example.com',
  status: 'ACTIVE',
  employmentType: 'PART_TIME',
  hireDate: '2026-01-05',
  resignDate: null,
  basicSalary: '45000.00',
  customPermissions: { [mod.key]: { [act0.key]: true } },
  createdAt: '2026-01-05T02:00:00.000Z',
  updatedAt: '2026-01-05T02:00:00.000Z',
  tenantId: 't0000000-0000-4000-8000-000000000001',
  jobTitle: { id: JOB_TITLE_ID, name: '教練' },
  branch: { id: BRANCH_ID, name: '信義店' }
}

const mockGetEmployee = vi.fn()
const mockUpdateEmployee = vi.fn()
const mockDeleteEmployee = vi.fn()
vi.stubGlobal('useEmployees', () => ({
  getEmployee: mockGetEmployee,
  updateEmployee: mockUpdateEmployee,
  deleteEmployee: mockDeleteEmployee
}))
vi.stubGlobal('useBranches', () => ({
  branches: ref([{ id: BRANCH_ID, name: '信義店' }]),
  fetchBranches: vi.fn().mockResolvedValue(undefined)
}))
vi.stubGlobal('useJobTitles', () => ({
  jobTitles: ref([{ id: JOB_TITLE_ID, name: '教練' }]),
  fetchJobTitles: vi.fn().mockResolvedValue(undefined),
  getJobTitle: vi.fn().mockResolvedValue({
    id: JOB_TITLE_ID,
    name: '教練',
    code: 'COACH',
    permissionsConfig: { [mod.key]: { [act0.key]: true, [act1.key]: true } }
  })
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

async function mountPage(component: typeof EmployeeEdit | typeof EmployeeDetail) {
  const wrapper = mount(component, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' }, Teleport: true } } })
  await flushPromises()
  return wrapper
}

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('hr/employees/[employeeId]/edit.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEmployee.mockResolvedValue(employee)
    mockUpdateEmployee.mockResolvedValue(employee)
  })

  it('reads the camelCase employee (fullName, employeeCode, status, string salary) into the form', async () => {
    const wrapper = await mountPage(EmployeeEdit)
    const inputs = wrapper.findAll('input.input').map(i => (i.element as HTMLInputElement).value)

    expect(inputs).toContain('張三')
    expect(inputs).toContain('E00001')
    expect(inputs).toContain('45000')
  })

  it('PATCHes updateEmployeeSchema fields incl. the saved customPermissions, and no supervisor', async () => {
    const wrapper = await mountPage(EmployeeEdit)
    await submit(wrapper)

    expect(mockUpdateEmployee).toHaveBeenCalledTimes(1)
    const [id, body] = mockUpdateEmployee.mock.calls[0]!
    expect(id).toBe(EMPLOYEE_ID)
    expect(body).toMatchObject({
      fullName: '張三',
      phone: '0912345678',
      email: 'zhang@example.com',
      status: 'ACTIVE',
      employmentType: 'PART_TIME',
      branchId: BRANCH_ID,
      jobTitleId: JOB_TITLE_ID,
      hireDate: '2026-01-05',
      basicSalary: 45000
    })
    expect(body.customPermissions[mod.key][act0.key]).toBe(true)
    expect(body.customPermissions[mod.key][act1.key]).toBe(false)
    expect(body).not.toHaveProperty('supervisorId')
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.EMPLOYEE_UPDATED)
    expect(mockPush).toHaveBeenCalledWith(`/hr/employees/${EMPLOYEE_ID}`)
  })

  it('turning custom permissions off sends customPermissions: null so the override is cleared', async () => {
    const wrapper = await mountPage(EmployeeEdit)
    await wrapper.find('.toggle-switch input').setValue(false)
    await submit(wrapper)

    expect(mockUpdateEmployee.mock.calls[0]![1].customPermissions).toBeNull()
  })

  it('shows no success toast and does not redirect when the update fails', async () => {
    mockUpdateEmployee.mockResolvedValue(null)
    const wrapper = await mountPage(EmployeeEdit)
    await submit(wrapper)

    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('更新員工失敗')
  })
})

describe('hr/employees/[employeeId]/index.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEmployee.mockResolvedValue(employee)
  })

  const confirmDelete = async (w: VueWrapper) => {
    await w.find('.header-actions .btn-danger, .btn-ghost.btn-danger').trigger('click')
    await w.find('.modal-overlay .btn.btn-danger').trigger('click')
    await flushPromises()
  }

  it('does not toast success or redirect when the delete is refused (deleteEmployee resolves false)', async () => {
    mockDeleteEmployee.mockResolvedValue(false)
    const wrapper = await mountPage(EmployeeDetail)
    await confirmDelete(wrapper)

    expect(mockDeleteEmployee).toHaveBeenCalledWith(EMPLOYEE_ID)
    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('toasts success and redirects after the backend archived the employee', async () => {
    mockDeleteEmployee.mockResolvedValue(true)
    const wrapper = await mountPage(EmployeeDetail)
    await confirmDelete(wrapper)

    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.EMPLOYEE_DELETED)
    expect(mockPush).toHaveBeenCalledWith('/hr/employees')
  })
})
