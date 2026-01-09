import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed as vueComputed, nextTick, ref, reactive } from 'vue'
import BranchesNew from './new.vue'
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'

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

// Mock useBranches
const mockCreateBranch = vi.fn()
vi.stubGlobal('useBranches', () => ({
  createBranch: mockCreateBranch
}))

// Mock useToast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}
vi.stubGlobal('useToast', () => mockToast)

// Mock useFormValidation
const mockErrors = ref<Record<string, string>>({})
const mockValidate = vi.fn().mockReturnValue(true)
const mockSetError = vi.fn().mockImplementation((field: string, message: string) => {
  mockErrors.value[field] = message
})
const mockClearErrors = vi.fn().mockImplementation(() => {
  mockErrors.value = {}
})

vi.stubGlobal('useFormValidation', () => ({
  errors: mockErrors,
  validate: mockValidate,
  setError: mockSetError,
  clearErrors: mockClearErrors
}))

// Mock validation rules
vi.stubGlobal('required', (message: string) => (value: unknown) =>
  value ? undefined : message
)

// Mock FormInput, FormRadioGroup components
const FormInputStub = {
  name: 'FormInput',
  template: '<div class="form-input-stub"><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
  props: ['modelValue', 'label', 'error', 'required', 'type', 'placeholder', 'maxlength']
}

const FormRadioGroupStub = {
  name: 'FormRadioGroup',
  template: '<div class="form-radio-group-stub"></div>',
  props: ['modelValue', 'label', 'options', 'required', 'error']
}

describe('Branches New Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockErrors.value = {}
  })

  const mountPage = () => {
    return mount(BranchesNew, {
      global: {
        stubs: {
          FormInput: FormInputStub,
          FormRadioGroup: FormRadioGroupStub
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

      expect(wrapper.text()).toContain(PAGES.BRANCHES.ADD_BRANCH)
    })

    it('應該顯示返回按鈕', () => {
      const wrapper = mountPage()

      const backBtn = wrapper.find('.back-btn')
      expect(backBtn.exists()).toBe(true)
    })

    it('應該渲染基本資料區段', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(PAGES.BRANCHES.BASIC_INFO)
    })

    it('應該渲染聯絡資訊區段', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(PAGES.BRANCHES.CONTACT_INFO)
    })

    it('應該渲染提交按鈕', () => {
      const wrapper = mountPage()

      const submitBtn = wrapper.find('button[type="submit"]')
      expect(submitBtn.exists()).toBe(true)
      expect(submitBtn.text()).toContain(PAGES.BRANCHES.ADD_BRANCH)
    })

    it('應該渲染取消按鈕', () => {
      const wrapper = mountPage()

      const cancelBtn = wrapper.find('.btn-ghost')
      expect(cancelBtn.exists()).toBe(true)
      expect(cancelBtn.text()).toContain(MESSAGES.FORM.CANCEL)
    })
  })

  describe('表單組件', () => {
    it('應該渲染分店名稱輸入框', () => {
      const wrapper = mountPage()

      expect(wrapper.findAllComponents(FormInputStub).length).toBeGreaterThan(0)
    })

    it('應該渲染分店類型選擇', () => {
      const wrapper = mountPage()

      const radioGroups = wrapper.findAllComponents(FormRadioGroupStub)
      expect(radioGroups.length).toBeGreaterThanOrEqual(2)
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
    it('應該在有效表單提交時呼叫 createBranch', async () => {
      mockCreateBranch.mockResolvedValueOnce({ id: 'new-branch-1' })

      const wrapper = mountPage()
      await flushPromises()

      // Set form values
      wrapper.vm.form.name = '測試分店'
      wrapper.vm.form.type = 'BRANCH'
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockCreateBranch).toHaveBeenCalled()
    })

    it('應該在成功建立後導航到分店列表', async () => {
      mockCreateBranch.mockResolvedValueOnce({ id: 'new-branch-1' })

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試分店'
      wrapper.vm.form.type = 'BRANCH'
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith('/branches')
    })

    it('應該在成功建立後顯示成功訊息', async () => {
      mockCreateBranch.mockResolvedValueOnce({ id: 'new-branch-1' })

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試分店'
      wrapper.vm.form.type = 'BRANCH'
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockToast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.BRANCH_CREATED)
    })
  })

  describe('表單驗證', () => {
    it('應該在驗證失敗時不提交', async () => {
      mockValidate.mockReturnValueOnce(false)

      const wrapper = mountPage()
      await flushPromises()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockCreateBranch).not.toHaveBeenCalled()
    })
  })

  describe('錯誤處理', () => {
    it('應該在建立失敗時顯示錯誤訊息', async () => {
      mockCreateBranch.mockRejectedValueOnce(new Error('Create failed'))

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試分店'
      wrapper.vm.form.type = 'BRANCH'
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockToast.error).toHaveBeenCalledWith(MESSAGES.ERRORS.BRANCH_CREATE_FAILED)
    })

    it('應該在建立失敗時設定錯誤狀態', async () => {
      mockCreateBranch.mockRejectedValueOnce(new Error('Create failed'))

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試分店'
      wrapper.vm.form.type = 'BRANCH'
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockSetError).toHaveBeenCalledWith('submit', PAGES.BRANCHES.ERROR_CREATE_FAILED)
    })
  })

  describe('提交狀態', () => {
    it('應該在提交時禁用提交按鈕', async () => {
      // Make createBranch return a promise that we can control
      let resolveCreate: (value: unknown) => void
      mockCreateBranch.mockReturnValueOnce(new Promise(resolve => {
        resolveCreate = resolve
      }))

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試分店'
      wrapper.vm.form.type = 'BRANCH'
      await nextTick()

      // Start submission
      const submitPromise = wrapper.vm.handleSubmit()
      await nextTick()

      // Check isSubmitting state
      expect(wrapper.vm.isSubmitting).toBe(true)

      // Resolve the promise
      resolveCreate!({ id: 'new-branch-1' })
      await submitPromise
      await flushPromises()

      expect(wrapper.vm.isSubmitting).toBe(false)
    })
  })
})
