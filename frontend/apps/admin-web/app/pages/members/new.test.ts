import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed as vueComputed, nextTick, ref, reactive, computed } from 'vue'
import MembersNew from './new.vue'
import { MESSAGES, PAGES, LABELS } from '~/constants'

// Restore Vue's computed for component tests
const originalComputed = globalThis.computed
beforeAll(() => {
  globalThis.computed = vueComputed
})
afterAll(() => {
  globalThis.computed = originalComputed
})

// Mock router
const mockPush = vi.fn()
const mockBack = vi.fn()
vi.stubGlobal('useRouter', () => ({
  push: mockPush,
  back: mockBack
}))

// Mock definePageMeta
vi.stubGlobal('definePageMeta', vi.fn())

// Mock useMembers
const mockCreateMember = vi.fn()
vi.stubGlobal('useMembers', () => ({
  createMember: mockCreateMember
}))

// Mock useBranches - use valid UUIDs for Zod validation
const mockBranches = ref([
  { id: '11111111-1111-1111-1111-111111111111', name: '總店' },
  { id: '22222222-2222-2222-2222-222222222222', name: '分店A' }
])
const mockFetchBranches = vi.fn()
vi.stubGlobal('useBranches', () => ({
  branches: mockBranches,
  fetchBranches: mockFetchBranches
}))

// Mock useToast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}
vi.stubGlobal('useToast', () => mockToast)

// Mock useZodFormValidation to simplify form testing
const mockValidate = vi.fn().mockReturnValue(true)
const mockClearErrors = vi.fn()
const mockSetError = vi.fn()

vi.mock('~/composables/core/useZodFormValidation', () => ({
  useZodFormValidation: (_schema: unknown, initialData: unknown) => ({
    formData: reactive({ ...(initialData as object) }),
    errors: ref({}),
    isValid: computed(() => true),
    hasErrors: computed(() => false),
    validate: mockValidate,
    validateField: vi.fn(),
    clearErrors: mockClearErrors,
    clearFieldError: vi.fn(),
    setError: mockSetError,
    reset: vi.fn(),
    setFormData: vi.fn()
  })
}))

// Mock useFormSubmit
const mockSubmit = vi.fn().mockImplementation(async (fn: () => Promise<unknown>, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
  try {
    const result = await fn()
    if (result && options?.onSuccess) {
      options.onSuccess()
    }
    return result
  } catch (error) {
    if (options?.onError) {
      options.onError(error as Error)
    }
    return null
  }
})

vi.mock('~/composables/useFormSubmit', () => ({
  useFormSubmit: () => ({
    isSubmitting: ref(false),
    submitError: ref(null),
    submit: mockSubmit
  })
}))

// Mock useTenant from @gym-nexus/shared
const mockCanCreate = vi.fn().mockReturnValue(true)
const mockFetchTenantInfo = vi.fn().mockResolvedValue(undefined)
const mockFetchTenantQuota = vi.fn().mockResolvedValue(undefined)
const mockIsQuotaNearLimit = vi.fn().mockReturnValue(false)
const mockGetQuotaUsagePercent = vi.fn().mockReturnValue(50)

vi.mock('@gym-nexus/shared', () => ({
  useTenant: () => ({
    canCreate: mockCanCreate,
    fetchTenantInfo: mockFetchTenantInfo,
    fetchTenantQuota: mockFetchTenantQuota,
    isQuotaNearLimit: mockIsQuotaNearLimit,
    getQuotaUsagePercent: mockGetQuotaUsagePercent
  })
}))

// Mock FormInput, FormSelect, FormRadioGroup, FormDatePicker, FormTagInput components
const FormInputStub = {
  name: 'FormInput',
  template: '<div class="form-input-stub"><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
  props: ['modelValue', 'label', 'error', 'required', 'type', 'placeholder', 'min', 'max']
}

const FormSelectStub = {
  name: 'FormSelect',
  template: '<div class="form-select-stub"><select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></div>',
  props: ['modelValue', 'label', 'options', 'placeholder', 'error']
}

const FormRadioGroupStub = {
  name: 'FormRadioGroup',
  template: '<div class="form-radio-group-stub"></div>',
  props: ['modelValue', 'label', 'options', 'allowEmpty']
}

const FormDatePickerStub = {
  name: 'FormDatePicker',
  template: '<div class="form-date-picker-stub"><input type="date" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
  props: ['modelValue', 'label', 'error']
}

const FormTagInputStub = {
  name: 'FormTagInput',
  template: '<div class="form-tag-input-stub"></div>',
  props: ['modelValue', 'placeholder', 'maxTags', 'error', 'addButtonText']
}

describe('Members New Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBranches.value = [
      { id: '11111111-1111-1111-1111-111111111111', name: '總店' },
      { id: '22222222-2222-2222-2222-222222222222', name: '分店A' }
    ]
  })

  const mountPage = () => {
    return mount(MembersNew, {
      global: {
        stubs: {
          FormInput: FormInputStub,
          FormSelect: FormSelectStub,
          FormRadioGroup: FormRadioGroupStub,
          FormDatePicker: FormDatePickerStub,
          FormTagInput: FormTagInputStub
        }
      }
    })
  }

  describe('初始化渲染', () => {
    it('應該正確渲染頁面', () => {
      const wrapper = mountPage()

      expect(wrapper.find('.form-page').exists()).toBe(true)
      expect(wrapper.find('.form-container').exists()).toBe(true)
    })

    it('應該顯示頁面標題', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(PAGES.MEMBERS.ADD_MEMBER)
    })

    it('應該顯示返回按鈕', () => {
      const wrapper = mountPage()

      const backBtn = wrapper.find('.back-btn')
      expect(backBtn.exists()).toBe(true)
    })

    it('應該渲染基本資料區段', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(MESSAGES.COMMON.BASIC_INFO)
    })

    it('應該渲染聯絡資訊區段', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(MESSAGES.COMMON.CONTACT_INFO)
    })

    it('應該渲染標籤區段', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(MESSAGES.FORM.TAGS)
    })

    it('應該渲染提交按鈕', () => {
      const wrapper = mountPage()

      const submitBtn = wrapper.find('button[type="submit"]')
      expect(submitBtn.exists()).toBe(true)
      expect(submitBtn.text()).toContain(PAGES.MEMBERS.ADD_MEMBER)
    })

    it('應該渲染取消按鈕', () => {
      const wrapper = mountPage()

      const cancelBtn = wrapper.find('.btn-ghost')
      expect(cancelBtn.exists()).toBe(true)
      expect(cancelBtn.text()).toContain(MESSAGES.FORM.CANCEL)
    })
  })

  describe('表單組件', () => {
    it('應該渲染姓名輸入框', () => {
      const wrapper = mountPage()

      expect(wrapper.findAllComponents(FormInputStub).length).toBeGreaterThan(0)
    })

    it('應該渲染性別選擇', () => {
      const wrapper = mountPage()

      expect(wrapper.findComponent(FormRadioGroupStub).exists()).toBe(true)
    })

    it('應該渲染生日選擇', () => {
      const wrapper = mountPage()

      expect(wrapper.findComponent(FormDatePickerStub).exists()).toBe(true)
    })

    it('應該渲染分店選擇', () => {
      const wrapper = mountPage()

      expect(wrapper.findComponent(FormSelectStub).exists()).toBe(true)
    })

    it('應該渲染標籤輸入', () => {
      const wrapper = mountPage()

      expect(wrapper.findComponent(FormTagInputStub).exists()).toBe(true)
    })
  })

  describe('導航', () => {
    it('應該在點擊返回按鈕時返回上一頁', async () => {
      const wrapper = mountPage()

      await wrapper.find('.back-btn').trigger('click')

      expect(mockBack).toHaveBeenCalled()
    })

    it('應該在點擊取消按鈕時返回上一頁', async () => {
      const wrapper = mountPage()

      await wrapper.find('.btn-ghost').trigger('click')

      expect(mockBack).toHaveBeenCalled()
    })
  })

  describe('表單提交', () => {
    it('應該在有效表單提交時呼叫 createMember', async () => {
      mockCreateMember.mockResolvedValueOnce({ id: 'new-member-1' })

      const wrapper = mountPage()
      await flushPromises()

      // Set form values using Object.assign for reactive object
      Object.assign(wrapper.vm.form, {
        full_name: '測試會員',
        branch_id: '11111111-1111-1111-1111-111111111111'
      })
      await nextTick()

      // Call handleSubmit directly
      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockCreateMember).toHaveBeenCalled()
    })

    it('應該在成功建立後導航到會員列表', async () => {
      mockCreateMember.mockResolvedValueOnce({ id: 'new-member-1' })

      const wrapper = mountPage()
      await flushPromises()

      // Set form values using Object.assign for reactive object
      Object.assign(wrapper.vm.form, {
        full_name: '測試會員',
        branch_id: '11111111-1111-1111-1111-111111111111'
      })
      await nextTick()

      // Call handleSubmit directly
      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith('/members')
    })
  })

  describe('加載狀態', () => {
    it('應該在初始載入時取得分店列表', async () => {
      mountPage()
      await flushPromises()

      expect(mockFetchBranches).toHaveBeenCalled()
    })
  })

  describe('錯誤處理', () => {
    it('應該在建立失敗時設定錯誤', async () => {
      // Mock createMember to return null (failure case)
      mockCreateMember.mockResolvedValueOnce(null)

      const wrapper = mountPage()
      await flushPromises()

      // Set valid form values
      Object.assign(wrapper.vm.form, {
        full_name: '測試會員',
        branch_id: '11111111-1111-1111-1111-111111111111'
      })
      await nextTick()

      // Expect the submit to handle the error
      try {
        await wrapper.vm.handleSubmit()
      } catch {
        // Error is expected when createMember returns null
      }
      await flushPromises()

      // Should have called setError with an error message
      expect(mockSetError).toHaveBeenCalled()
    })

    it('應該在配額不足時顯示錯誤', async () => {
      // Mock canCreate to return false
      mockCanCreate.mockReturnValueOnce(false)

      const wrapper = mountPage()
      await flushPromises()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      // Should show toast error for quota exceeded
      expect(mockToast.error).toHaveBeenCalledWith('會員配額已達上限，無法新增會員')
    })
  })
})
