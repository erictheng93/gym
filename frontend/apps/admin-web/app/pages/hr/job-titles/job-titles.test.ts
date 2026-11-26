import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import JobTitleNew from './new.vue'
import JobTitleEdit from './[id]/edit.vue'
import JobTitleIndex from './index.vue'
import FormField from '../../../../../../packages/ui/components/form/FormField.vue'
import FormInput from '../../../../../../packages/ui/components/form/FormInput.vue'
import { MESSAGES } from '~/constants'
import { PERMISSION_MODULES } from '~/constants/permissions'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const mockPush = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ params: { id: 'a0000000-0000-4000-8000-000000000001' } }))
vi.stubGlobal('definePageMeta', vi.fn())

const mockCreateJobTitle = vi.fn()
const mockUpdateJobTitle = vi.fn()
const mockGetJobTitle = vi.fn()
const mockDeleteJobTitle = vi.fn()
const mockFetchJobTitles = vi.fn()
const mockJobTitles = ref<unknown[]>([])
vi.stubGlobal('useJobTitles', () => ({
  jobTitles: mockJobTitles,
  isLoading: ref(false),
  createJobTitle: mockCreateJobTitle,
  updateJobTitle: mockUpdateJobTitle,
  getJobTitle: mockGetJobTitle,
  deleteJobTitle: mockDeleteJobTitle,
  fetchJobTitles: mockFetchJobTitles
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

const firstModule = PERMISSION_MODULES[0]!
const firstAction = firstModule.actions[0]!

const mountForm = async (component: typeof JobTitleNew) => {
  const wrapper = mount(component, { global: { components: { FormField, FormInput } } })
  await flushPromises()
  return wrapper
}

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

// Backend JOB_TITLE_SELECT row: camelCase, permissionsConfig (never permissions_config)
const stored = {
  id: 'a0000000-0000-4000-8000-000000000001',
  createdAt: '2026-01-01T00:00:00.000Z',
  name: '店長',
  code: 'MANAGER',
  description: null,
  level: null,
  sort: null,
  permissionsConfig: { [firstModule.key]: { [firstAction.key]: true } },
  tenantId: 't0000000-0000-4000-8000-000000000001'
}

describe('hr/job-titles/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateJobTitle.mockResolvedValue(stored)
  })

  it('sends the required `code` and camelCase permissionsConfig, then redirects', async () => {
    const wrapper = await mountForm(JobTitleNew)
    const [name, code] = wrapper.findAll('input')
    await name!.setValue(' 店長 ')
    await code!.setValue('MANAGER')
    // tick the first permission checkbox
    await wrapper.find('.action-checkbox input[type="checkbox"]').setValue(true)
    await submit(wrapper)

    expect(mockCreateJobTitle).toHaveBeenCalledTimes(1)
    const body = mockCreateJobTitle.mock.calls[0]![0]
    expect(body).toMatchObject({ name: '店長', code: 'MANAGER' })
    expect(body).not.toHaveProperty('permissions_config')
    expect(body.permissionsConfig[firstModule.key][firstAction.key]).toBe(true)
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.JOB_TITLE_CREATED)
    expect(mockPush).toHaveBeenCalledWith('/hr/job-titles')
  })

  it('requires a code before calling the API', async () => {
    const wrapper = await mountForm(JobTitleNew)
    await wrapper.find('input').setValue('店長')
    await submit(wrapper)

    expect(mockCreateJobTitle).not.toHaveBeenCalled()
  })

  it('shows no success toast and does not redirect when the create fails', async () => {
    mockCreateJobTitle.mockResolvedValue(null)
    const wrapper = await mountForm(JobTitleNew)
    const [name, code] = wrapper.findAll('input')
    await name!.setValue('店長')
    await code!.setValue('MANAGER')
    await submit(wrapper)

    expect(mockCreateJobTitle).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('hr/job-titles/[id]/edit.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetJobTitle.mockResolvedValue(stored)
    mockUpdateJobTitle.mockResolvedValue(stored)
  })

  const permissionBoxes = (w: VueWrapper) => w.findAll('.action-checkbox input[type="checkbox"]')

  it('loads the saved camelCase permissionsConfig into the checkboxes', async () => {
    const wrapper = await mountForm(JobTitleEdit)

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('店長')
    const boxes = permissionBoxes(wrapper)
    expect((boxes[0]!.element as HTMLInputElement).checked).toBe(true)
    expect(boxes.filter(b => (b.element as HTMLInputElement).checked)).toHaveLength(1)
  })

  it('PATCHes permissionsConfig (camelCase), including what was loaded', async () => {
    const wrapper = await mountForm(JobTitleEdit)
    await permissionBoxes(wrapper)[1]!.setValue(true)
    await submit(wrapper)

    expect(mockUpdateJobTitle).toHaveBeenCalledTimes(1)
    const [id, body] = mockUpdateJobTitle.mock.calls[0]!
    expect(id).toBe(stored.id)
    expect(body).not.toHaveProperty('permissions_config')
    const secondAction = firstModule.actions[1]!
    expect(body.permissionsConfig[firstModule.key]).toMatchObject({ [firstAction.key]: true, [secondAction.key]: true })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.JOB_TITLE_UPDATED)
    expect(mockPush).toHaveBeenCalledWith('/hr/job-titles')
  })

  it('shows no success toast and does not redirect when the update fails', async () => {
    mockUpdateJobTitle.mockResolvedValue(null)
    const wrapper = await mountForm(JobTitleEdit)
    await submit(wrapper)

    expect(toast.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('hr/job-titles/index.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJobTitles.value = [stored]
    mockFetchJobTitles.mockResolvedValue(undefined)
  })

  const mountIndex = async () => {
    const wrapper = mount(JobTitleIndex, {
      global: {
        stubs: { PageContainer: { template: '<div><slot /></div>' }, PageHeader: true, NuxtLink: true, Teleport: true, Transition: false }
      }
    })
    await flushPromises()
    return wrapper
  }

  it('counts permissions from permissionsConfig', async () => {
    const wrapper = await mountIndex()
    expect(wrapper.text()).toContain('1 個權限')
  })

  it('does not report success when the delete is refused (deleteJobTitle resolves false)', async () => {
    mockDeleteJobTitle.mockResolvedValue(false)
    const wrapper = await mountIndex()
    await wrapper.find('.icon-btn--danger').trigger('click')
    const confirm = wrapper.findAll('button').find(b => b.text().includes(MESSAGES.FORM.DELETE) && b.classes().some(c => c.includes('danger')))
    expect(confirm).toBeTruthy()
    await confirm!.trigger('click')
    await flushPromises()

    expect(mockDeleteJobTitle).toHaveBeenCalledWith(stored.id)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reports success only after the backend deleted the job title', async () => {
    mockDeleteJobTitle.mockResolvedValue(true)
    const wrapper = await mountIndex()
    await wrapper.find('.icon-btn--danger').trigger('click')
    const confirm = wrapper.findAll('button').find(b => b.text().includes(MESSAGES.FORM.DELETE) && b.classes().some(c => c.includes('danger')))
    await confirm!.trigger('click')
    await flushPromises()

    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.JOB_TITLE_DELETED)
  })
})
