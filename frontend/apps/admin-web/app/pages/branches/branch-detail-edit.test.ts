import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import BranchDetail from './[branchId].vue'
import BranchEdit from './[branchId]/edit.vue'
import { isBranchActive } from '~/composables/useBranches'
import { MESSAGES, PAGES } from '~/constants'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const BRANCH_ID = 'b0000000-0000-4000-8000-000000000002'

const mockPush = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ params: { branchId: BRANCH_ID } }))
vi.stubGlobal('definePageMeta', vi.fn())
vi.stubGlobal('isBranchActive', isBranchActive)

// Backend GET /api/branches/:id row: camelCase `taxId`, status 'published' | 'archived'
const branch = {
  id: BRANCH_ID,
  status: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: '信義店',
  code: 'XINYI-AB12',
  type: 'BRANCH',
  address: '台北市信義區',
  phone: '02-12345678',
  taxId: '12345678',
  settings: null,
  tenantId: 't0000000-0000-4000-8000-000000000001',
  stats: { employeeCount: 1, memberCount: 10 }
}
const branchEmployee = {
  id: 'e0000000-0000-4000-8000-000000000001',
  fullName: '張三',
  jobTitle: { id: 'a-1', name: '教練' },
  status: 'ACTIVE'
}

const mockFetchBranch = vi.fn()
const mockFetchBranchEmployees = vi.fn()
const mockUpdateBranch = vi.fn()
const mockDeleteBranch = vi.fn()
vi.stubGlobal('useBranches', () => ({
  fetchBranch: mockFetchBranch,
  fetchBranchEmployees: mockFetchBranchEmployees,
  updateBranch: mockUpdateBranch,
  deleteBranch: mockDeleteBranch
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

async function mountPage(component: typeof BranchDetail | typeof BranchEdit) {
  const wrapper = mount(component, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' }, Teleport: true } } })
  await flushPromises()
  return wrapper
}

describe('branches/[branchId].vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchBranch.mockResolvedValue({ ...branch })
    mockFetchBranchEmployees.mockResolvedValue([branchEmployee])
  })

  const clickArchive = async (w: VueWrapper) => {
    await w.find('.header-actions button.btn-warning').trigger('click')
    await w.find('.modal-overlay button.btn-warning').trigger('click')
    await flushPromises()
  }

  const clickDelete = async (w: VueWrapper) => {
    await w.find('.header-actions .btn-danger').trigger('click')
    await w.find('.modal-overlay .btn.btn-danger').trigger('click')
    await flushPromises()
  }

  it('shows the camelCase tax id and the employees from the API', async () => {
    const wrapper = await mountPage(BranchDetail)

    expect(wrapper.text()).toContain('12345678')
    expect(wrapper.text()).toContain('張三')
    expect(wrapper.text()).toContain('教練')
  })

  it('archives with the backend status vocabulary (published -> archived) and toasts on success', async () => {
    mockUpdateBranch.mockResolvedValue({ ...branch, status: 'archived' })
    const wrapper = await mountPage(BranchDetail)
    await clickArchive(wrapper)

    expect(mockUpdateBranch).toHaveBeenCalledWith(BRANCH_ID, { status: 'archived' })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.BRANCH_ARCHIVED)
    expect(wrapper.text()).toContain(PAGES.BRANCHES.ACTIVATE_BRANCH)
  })

  it('does not toast success or flip the status when the archive request fails (updateBranch resolves null)', async () => {
    mockUpdateBranch.mockResolvedValue(null)
    const wrapper = await mountPage(BranchDetail)
    await clickArchive(wrapper)

    expect(mockUpdateBranch).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain(PAGES.BRANCHES.ARCHIVE_BRANCH)
    expect(wrapper.text()).not.toContain(PAGES.BRANCHES.ACTIVATE_BRANCH)
  })

  it('does not toast success or redirect when the delete is refused (deleteBranch resolves false)', async () => {
    mockDeleteBranch.mockResolvedValue(false)
    const wrapper = await mountPage(BranchDetail)
    await clickDelete(wrapper)

    expect(mockDeleteBranch).toHaveBeenCalledWith(BRANCH_ID)
    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('toasts success and redirects after the backend archived the branch', async () => {
    mockDeleteBranch.mockResolvedValue(true)
    const wrapper = await mountPage(BranchDetail)
    await clickDelete(wrapper)

    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.BRANCH_DELETED)
    expect(mockPush).toHaveBeenCalledWith('/branches')
  })
})

describe('branches/[branchId]/edit.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchBranch.mockResolvedValue({ ...branch })
    mockUpdateBranch.mockResolvedValue(branch)
  })

  const submit = async (w: VueWrapper) => {
    await w.find('form').trigger('submit')
    await flushPromises()
  }

  it('loads taxId into the form and PATCHes it back as taxId (not tax_id) with status published', async () => {
    const wrapper = await mountPage(BranchEdit)
    const values = wrapper.findAll('input.input').map(i => (i.element as HTMLInputElement).value)
    expect(values).toContain('12345678')

    await submit(wrapper)

    expect(mockUpdateBranch).toHaveBeenCalledWith(BRANCH_ID, {
      name: '信義店',
      type: 'BRANCH',
      address: '台北市信義區',
      phone: '02-12345678',
      taxId: '12345678',
      status: 'published'
    })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.BRANCH_UPDATED)
    expect(mockPush).toHaveBeenCalledWith(`/branches/${BRANCH_ID}`)
  })

  it('shows no success toast and does not redirect when the update fails', async () => {
    mockUpdateBranch.mockResolvedValue(null)
    const wrapper = await mountPage(BranchEdit)
    await submit(wrapper)

    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(wrapper.find('.submit-error').text()).toBe(PAGES.BRANCHES.ERROR_UPDATE_FAILED)
  })
})
