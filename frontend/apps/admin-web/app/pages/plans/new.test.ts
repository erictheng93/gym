import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed as vueComputed, computed, nextTick, ref, reactive } from 'vue'
import PlansNew from './new.vue'
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

// Mock usePlans
const mockCreatePlan = vi.fn()
vi.stubGlobal('usePlans', () => ({
  createPlan: mockCreatePlan
}))

// Mock useToast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}
vi.stubGlobal('useToast', () => mockToast)

// Mock useZodFormValidation
const mockErrors = ref<Record<string, string>>({})
const mockValidate = vi.fn().mockReturnValue(true)
const mockSetError = vi.fn().mockImplementation((field: string, message: string) => {
  mockErrors.value[field] = message
})
const mockClearErrors = vi.fn().mockImplementation(() => {
  mockErrors.value = {}
})

vi.mock('~/composables/core/useZodFormValidation', () => ({
  useZodFormValidation: (_schema: unknown, initialData: unknown) => ({
    formData: reactive({ ...(initialData as object) }),
    errors: mockErrors,
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
const mockIsSubmitting = ref(false)
const mockSubmit = vi.fn().mockImplementation(async (fn: () => Promise<unknown>, options?: { successMessage?: string; errorMessage?: string; onSuccess?: () => void; onError?: (error: Error) => void }) => {
  mockIsSubmitting.value = true
  try {
    const result = await fn()
    if (result) {
      if (options?.successMessage) {
        mockToast.success(options.successMessage)
      }
      if (options?.onSuccess) {
        options.onSuccess()
      }
    }
    return result
  } catch (error) {
    if (options?.errorMessage) {
      mockToast.error(options.errorMessage)
    }
    if (options?.onError) {
      options.onError(error as Error)
    }
    return null
  } finally {
    mockIsSubmitting.value = false
  }
})

vi.mock('~/composables/useFormSubmit', () => ({
  useFormSubmit: () => ({
    isSubmitting: mockIsSubmitting,
    submitError: ref(null),
    submit: mockSubmit
  })
}))

describe('Plans New Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockErrors.value = {}
    mockIsSubmitting.value = false
  })

  const mountPage = () => {
    return mount(PlansNew, {
      global: {
        stubs: {
          // No component stubs needed since this page uses inline inputs
        }
      }
    })
  }

  describe('初始化渲染', () => {
    it('應該正確渲染頁面', () => {
      const wrapper = mountPage()

      expect(wrapper.find('.plan-form-page').exists()).toBe(true)
      expect(wrapper.find('.plan-form').exists()).toBe(true)
    })

    it('應該顯示頁面標題', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(PAGES.PLANS.ADD_PLAN)
    })

    it('應該顯示返回按鈕', () => {
      const wrapper = mountPage()

      const backBtn = wrapper.find('.back-btn')
      expect(backBtn.exists()).toBe(true)
    })

    it('應該渲染基本資料區段', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(PAGES.PLANS.BASIC_INFO)
    })

    it('應該渲染規則設定區段', () => {
      const wrapper = mountPage()

      expect(wrapper.text()).toContain(PAGES.PLANS.RULES_SETTINGS)
    })

    it('應該渲染預覽區塊', () => {
      const wrapper = mountPage()

      expect(wrapper.find('.price-preview').exists()).toBe(true)
      expect(wrapper.text()).toContain('預覽')
    })

    it('應該渲染提交按鈕', () => {
      const wrapper = mountPage()

      const submitBtn = wrapper.find('button[type="submit"]')
      expect(submitBtn.exists()).toBe(true)
      expect(submitBtn.text()).toContain(PAGES.PLANS.ADD_PLAN)
    })

    it('應該渲染取消按鈕', () => {
      const wrapper = mountPage()

      const cancelBtn = wrapper.find('.btn-ghost')
      expect(cancelBtn.exists()).toBe(true)
      expect(cancelBtn.text()).toContain(MESSAGES.FORM.CANCEL)
    })
  })

  describe('表單初始值', () => {
    it('應該有正確的初始值', () => {
      const wrapper = mountPage()

      expect(wrapper.vm.form.name).toBe('')
      expect(wrapper.vm.form.plan_type).toBe('TIME_BASED')
      expect(wrapper.vm.form.price).toBe(0)
      expect(wrapper.vm.form.duration_months).toBe(1)
      expect(wrapper.vm.form.class_counts).toBe(10)
      expect(wrapper.vm.form.allow_transfer).toBe(false)
      expect(wrapper.vm.form.allow_pause).toBe(true)
      expect(wrapper.vm.form.status).toBe('active')
    })
  })

  describe('方案類型切換', () => {
    it('應該渲染時間型方案的月份欄位', async () => {
      const wrapper = mountPage()
      wrapper.vm.form.plan_type = 'TIME_BASED'
      await nextTick()

      expect(wrapper.text()).toContain(PAGES.PLANS.DURATION_MONTHS)
    })

    it('應該渲染堂數型方案的堂數欄位', async () => {
      const wrapper = mountPage()
      wrapper.vm.form.plan_type = 'COUNT_BASED'
      await nextTick()

      expect(wrapper.text()).toContain(PAGES.PLANS.CLASS_COUNTS)
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
    it('應該在有效表單提交時呼叫 createPlan', async () => {
      mockCreatePlan.mockResolvedValueOnce({ id: 'new-plan-1' })

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試方案'
      wrapper.vm.form.plan_type = 'TIME_BASED'
      wrapper.vm.form.price = 5000
      wrapper.vm.form.duration_months = 6
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockCreatePlan).toHaveBeenCalled()
    })

    it('應該在成功建立後導航到方案列表', async () => {
      mockCreatePlan.mockResolvedValueOnce({ id: 'new-plan-1' })

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試方案'
      wrapper.vm.form.price = 5000
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockPush).toHaveBeenCalledWith('/plans')
    })

    it('應該在成功建立後顯示成功訊息', async () => {
      mockCreatePlan.mockResolvedValueOnce({ id: 'new-plan-1' })

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試方案'
      wrapper.vm.form.price = 5000
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockToast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.PLAN_CREATED)
    })

    it('應該正確處理時間型方案資料', async () => {
      mockCreatePlan.mockResolvedValueOnce({ id: 'new-plan-1' })

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '時間型方案'
      wrapper.vm.form.plan_type = 'TIME_BASED'
      wrapper.vm.form.price = 3000
      wrapper.vm.form.duration_months = 12
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockCreatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '時間型方案',
          plan_type: 'TIME_BASED',
          price: 3000,
          duration_months: 12,
          class_counts: null
        })
      )
    })

    it('應該正確處理堂數型方案資料', async () => {
      mockCreatePlan.mockResolvedValueOnce({ id: 'new-plan-1' })

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '堂數型方案'
      wrapper.vm.form.plan_type = 'COUNT_BASED'
      wrapper.vm.form.price = 2000
      wrapper.vm.form.class_counts = 20
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockCreatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '堂數型方案',
          plan_type: 'COUNT_BASED',
          price: 2000,
          duration_months: null,
          class_counts: 20
        })
      )
    })
  })

  describe('表單驗證', () => {
    it('應該在驗證失敗時不提交', async () => {
      mockValidate.mockReturnValueOnce(false)

      const wrapper = mountPage()
      await flushPromises()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockCreatePlan).not.toHaveBeenCalled()
    })
  })

  describe('錯誤處理', () => {
    it('應該在建立失敗時顯示錯誤訊息', async () => {
      mockCreatePlan.mockRejectedValueOnce(new Error('Create failed'))

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試方案'
      wrapper.vm.form.price = 5000
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockToast.error).toHaveBeenCalledWith(MESSAGES.ERRORS.PLAN_CREATE_FAILED)
    })

    it('應該在建立失敗時設定錯誤狀態', async () => {
      mockCreatePlan.mockRejectedValueOnce(new Error('Create failed'))

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試方案'
      wrapper.vm.form.price = 5000
      await nextTick()

      await wrapper.vm.handleSubmit()
      await flushPromises()

      expect(mockSetError).toHaveBeenCalledWith('submit', PAGES.PLANS.ERROR_CREATE_FAILED)
    })
  })

  describe('提交狀態', () => {
    it('應該在提交時禁用提交按鈕', async () => {
      let resolveCreate: (value: unknown) => void
      mockCreatePlan.mockReturnValueOnce(new Promise(resolve => {
        resolveCreate = resolve
      }))

      const wrapper = mountPage()
      await flushPromises()

      wrapper.vm.form.name = '測試方案'
      wrapper.vm.form.price = 5000
      await nextTick()

      const submitPromise = wrapper.vm.handleSubmit()
      await nextTick()

      expect(wrapper.vm.isSubmitting).toBe(true)

      resolveCreate!({ id: 'new-plan-1' })
      await submitPromise
      await flushPromises()

      expect(wrapper.vm.isSubmitting).toBe(false)
    })
  })

  describe('價格格式化', () => {
    it('應該正確格式化價格', () => {
      const wrapper = mountPage()

      expect(wrapper.vm.formatPrice(1000)).toBe('1,000')
      expect(wrapper.vm.formatPrice(1000000)).toBe('1,000,000')
      expect(wrapper.vm.formatPrice(0)).toBe('0')
    })
  })

  describe('預覽區塊', () => {
    it('應該顯示方案名稱', async () => {
      const wrapper = mountPage()

      wrapper.vm.form.name = '月費方案'
      await nextTick()

      expect(wrapper.find('.preview-name').text()).toBe('月費方案')
    })

    it('應該顯示預設名稱當未輸入時', () => {
      const wrapper = mountPage()

      expect(wrapper.find('.preview-name').text()).toBe('方案名稱')
    })

    it('應該顯示格式化的價格', async () => {
      const wrapper = mountPage()

      wrapper.vm.form.price = 5000
      await nextTick()

      expect(wrapper.find('.preview-price').text()).toContain('5,000')
    })
  })
})
