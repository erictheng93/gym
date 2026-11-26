import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import BranchesNew from './new.vue'
import FormField from '../../../../../packages/ui/components/form/FormField.vue'
import FormInput from '../../../../../packages/ui/components/form/FormInput.vue'
import FormRadioGroup from '../../../../../packages/ui/components/form/FormRadioGroup.vue'
import { LABELS, MESSAGES, PAGES, VALIDATION } from '~/constants'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)

const mockPush = vi.fn()
const mockBack = vi.fn()
vi.stubGlobal('useRouter', () => ({ push: mockPush, back: mockBack }))
vi.stubGlobal('definePageMeta', vi.fn())

const mockCreateBranch = vi.fn()
vi.stubGlobal('useBranches', () => ({ createBranch: mockCreateBranch }))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

// Real Zod validation, real useFormSubmit and the real @gym-nexus/ui form components are used.
const mountPage = () => mount(BranchesNew, {
  global: { components: { FormField, FormInput, FormRadioGroup } }
})

// Text inputs in template order: name, address, phone, tax_id.
const inputs = (w: VueWrapper) => {
  const [name, address, phone, taxId] = w.findAll('input')
  return { name: name!, address: address!, phone: phone!, taxId: taxId! }
}
const fieldErrors = (w: VueWrapper) => w.findAll('.form-field-error').map(e => e.text())

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('branches/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateBranch.mockResolvedValue({ id: 'branch-1' })
  })

  it('creates a branch with trimmed fields and empty optionals as null, then navigates to /branches', async () => {
    const wrapper = mountPage()
    const f = inputs(wrapper)
    await f.name.setValue('  信義店  ')
    await f.address.setValue('   ')
    await submit(wrapper)

    expect(mockCreateBranch).toHaveBeenCalledWith({
      name: '信義店',
      type: 'BRANCH',
      address: null,
      phone: null,
      tax_id: null,
      status: 'active'
    })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.BRANCH_CREATED)
    expect(mockPush).toHaveBeenCalledWith('/branches')
  })

  it('submits the selected type, status and contact info', async () => {
    const wrapper = mountPage()
    const f = inputs(wrapper)
    await f.name.setValue('總部')
    await f.address.setValue('台北市信義區')
    await f.phone.setValue('02-12345678')
    await f.taxId.setValue('12345678')
    const options = wrapper.findAll('button.radio-option')
    await options.find(b => b.text() === LABELS.BRANCH_TYPE.HEADQUARTER)!.trigger('click')
    await options.at(-1)!.trigger('click') // status: archived (last option)
    await submit(wrapper)

    expect(mockCreateBranch).toHaveBeenCalledWith({
      name: '總部',
      type: 'HEADQUARTER',
      address: '台北市信義區',
      phone: '02-12345678',
      tax_id: '12345678',
      status: 'archived'
    })
  })

  it('requires a name', async () => {
    const wrapper = mountPage()
    await submit(wrapper)

    expect(mockCreateBranch).not.toHaveBeenCalled()
    expect(fieldErrors(wrapper)).toContain(VALIDATION.REQUIRED)
  })

  async function submitInvalidContact() {
    const wrapper = mountPage()
    const f = inputs(wrapper)
    await f.name.setValue('信義店')
    await f.phone.setValue('abc')
    await f.taxId.setValue('1234')
    await submit(wrapper)
    return wrapper
  }

  it('does not submit an invalid phone or tax id', async () => {
    await submitInvalidContact()
    expect(mockCreateBranch).not.toHaveBeenCalled()
  })

  it('shows the phone and tax id validation messages', async () => {
    const wrapper = await submitInvalidContact()
    expect(fieldErrors(wrapper)).toEqual(expect.arrayContaining([
      VALIDATION.PHONE_INVALID,
      VALIDATION.TAX_ID_INVALID
    ]))
  })

  it('shows an error and stays on the page when creation fails', async () => {
    mockCreateBranch.mockRejectedValue(new Error('network'))
    const wrapper = mountPage()
    await inputs(wrapper).name.setValue('信義店')
    await submit(wrapper)

    expect(wrapper.find('.submit-error').text()).toBe(PAGES.BRANCHES.ERROR_CREATE_FAILED)
    expect(toast.error).toHaveBeenCalledWith(MESSAGES.ERRORS.BRANCH_CREATE_FAILED)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('goes back on cancel', async () => {
    const wrapper = mountPage()
    await wrapper.find('button.btn-ghost').trigger('click')
    expect(mockBack).toHaveBeenCalled()
  })
})
