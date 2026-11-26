import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted } from 'vue'
import MembersNew from './new.vue'
import FormField from '../../../../../packages/ui/components/form/FormField.vue'
import FormInput from '../../../../../packages/ui/components/form/FormInput.vue'
import FormRadioGroup from '../../../../../packages/ui/components/form/FormRadioGroup.vue'
import FormDatePicker from '../../../../../packages/ui/components/form/FormDatePicker.vue'
import FormSelect from '../../../../../packages/ui/components/form/FormSelect.vue'
import FormTagInput from '../../../../../packages/ui/components/form/FormTagInput.vue'
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

const mockCreateMember = vi.fn()
vi.stubGlobal('useMembers', () => ({ createMember: mockCreateMember }))

// Branch ids must be UUIDs to satisfy the member schema.
const BRANCH_1 = '11111111-1111-1111-1111-111111111111'
const BRANCH_2 = '22222222-2222-2222-2222-222222222222'
const mockBranches = ref([
  { id: BRANCH_1, name: '總店' },
  { id: BRANCH_2, name: '分店A' }
])
const mockFetchBranches = vi.fn()
vi.stubGlobal('useBranches', () => ({ branches: mockBranches, fetchBranches: mockFetchBranches }))

const tenant = {
  canCreate: vi.fn(),
  fetchTenantInfo: vi.fn(),
  fetchTenantQuota: vi.fn(),
  isQuotaNearLimit: vi.fn(),
  getQuotaUsagePercent: vi.fn()
}
vi.stubGlobal('useTenant', () => tenant)

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

// Real Zod validation, real useFormSubmit and the real @gym-nexus/ui form components are used.
async function mountPage() {
  const wrapper = mount(MembersNew, {
    global: {
      components: { FormField, FormInput, FormRadioGroup, FormDatePicker, FormSelect, FormTagInput }
    }
  })
  await flushPromises()
  return wrapper
}

const byPlaceholder = (w: VueWrapper, placeholder: string) => w.find(`input[placeholder="${placeholder}"]`)
const fieldErrors = (w: VueWrapper) => w.findAll('.form-field-error').map(e => e.text())

async function fillRequired(w: VueWrapper) {
  await byPlaceholder(w, PAGES.MEMBERS.NAME_PLACEHOLDER).setValue('王小明')
  await byPlaceholder(w, '0912345678').setValue('0912345678')
}

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('members/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-11-15T10:00:00Z'))
    tenant.canCreate.mockReturnValue(true)
    tenant.isQuotaNearLimit.mockReturnValue(false)
    tenant.getQuotaUsagePercent.mockReturnValue(50)
    tenant.fetchTenantInfo.mockResolvedValue(undefined)
    tenant.fetchTenantQuota.mockResolvedValue(undefined)
    mockFetchBranches.mockResolvedValue(undefined)
    mockCreateMember.mockResolvedValue({ id: 'member-1' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads branches and tenant quota, defaulting to the first branch', async () => {
    const wrapper = await mountPage()

    expect(mockFetchBranches).toHaveBeenCalled()
    expect(tenant.fetchTenantQuota).toHaveBeenCalled()
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe(BRANCH_1)
  })

  it('submits the member in the backend camelCase shape and navigates to /members', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await wrapper.findAll('button.radio-option').find(b => b.text() === LABELS.GENDER.FEMALE)!.trigger('click')
    await wrapper.find('input[type="date"]').setValue('1990-05-01')
    await wrapper.find('select').setValue(BRANCH_2)
    await byPlaceholder(wrapper, 'email@example.com').setValue('a@example.com')
    await byPlaceholder(wrapper, '請輸入緊急聯絡人姓名').setValue('王媽媽')
    await submit(wrapper)

    expect(mockCreateMember).toHaveBeenCalledWith({
      fullName: '王小明',
      phone: '0912345678',
      email: 'a@example.com',
      gender: 'FEMALE',
      birthday: '1990-05-01',
      branchId: BRANCH_2,
      emergencyContact: '王媽媽',
      emergencyPhone: null,
      tags: [],
      joinDate: '2024-11-15'
    })
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.MEMBER_CREATED)
    expect(mockPush).toHaveBeenCalledWith('/members')
  })

  it('sends empty optional fields as null', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(mockCreateMember).toHaveBeenCalledWith(expect.objectContaining({
      email: null,
      gender: null,
      birthday: null,
      emergencyContact: null,
      emergencyPhone: null
    }))
  })

  it('shows validation errors and does not submit', async () => {
    const wrapper = await mountPage()
    await byPlaceholder(wrapper, PAGES.MEMBERS.NAME_PLACEHOLDER).setValue('王')
    await byPlaceholder(wrapper, '0912345678').setValue('12ab')
    await submit(wrapper)

    expect(mockCreateMember).not.toHaveBeenCalled()
    expect(fieldErrors(wrapper)).toEqual(expect.arrayContaining([VALIDATION.NAME_MIN, VALIDATION.PHONE_INVALID]))
  })

  it('blocks creation when the member quota is exhausted', async () => {
    tenant.canCreate.mockReturnValue(false)
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(tenant.canCreate).toHaveBeenCalledWith('members')
    expect(mockCreateMember).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
    expect(wrapper.find('.submit-error').text()).toContain('配額已達上限')
  })

  it('warns when the quota is near its limit', async () => {
    tenant.isQuotaNearLimit.mockReturnValue(true)
    tenant.getQuotaUsagePercent.mockReturnValue(92)
    const wrapper = await mountPage()
    expect(wrapper.find('.quota-alert').text()).toContain('92%')
  })

  it('shows the API error message and stays on the page when creation fails', async () => {
    mockCreateMember.mockRejectedValue(new Error('電話號碼已存在'))
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(wrapper.find('.submit-error').text()).toBe('電話號碼已存在')
    expect(toast.error).toHaveBeenCalledWith(MESSAGES.ERRORS.MEMBER_CREATE_FAILED)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
