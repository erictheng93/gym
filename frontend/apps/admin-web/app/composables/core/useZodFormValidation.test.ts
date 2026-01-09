import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { useZodFormValidation } from './useZodFormValidation'

// Mock formatZodErrors
vi.mock('~/schemas/common.schema', () => ({
  formatZodErrors: (error: z.ZodError) => {
    const errors: Record<string, string> = {}
    for (const issue of error.issues) {
      const path = issue.path.join('.')
      if (!errors[path]) {
        errors[path] = issue.message
      }
    }
    return errors
  }
}))

describe('useZodFormValidation', () => {
  // 測試用的 Schema
  const testSchema = z.object({
    name: z.string().min(2, '名稱至少 2 個字').max(50, '名稱不能超過 50 個字'),
    email: z.string().email('Email 格式不正確'),
    age: z.number().positive('年齡必須大於 0').optional(),
    status: z.enum(['active', 'inactive']).default('active')
  })

  type TestFormData = z.infer<typeof testSchema>

  const initialData: TestFormData = {
    name: '',
    email: '',
    age: undefined,
    status: 'active'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('初始化', () => {
    it('應該正確初始化表單資料', () => {
      const { formData } = useZodFormValidation(testSchema, initialData)

      expect(formData.name).toBe('')
      expect(formData.email).toBe('')
      expect(formData.age).toBeUndefined()
      expect(formData.status).toBe('active')
    })

    it('應該初始化時沒有錯誤', () => {
      const { errors, hasErrors, isValid } = useZodFormValidation(testSchema, initialData)

      expect(errors.value).toEqual({})
      expect(hasErrors.value).toBe(false)
      expect(isValid.value).toBe(true)
    })

    it('應該接受帶有初始值的資料', () => {
      const customInitial = {
        name: 'John',
        email: 'john@example.com',
        age: 25,
        status: 'active' as const
      }
      const { formData } = useZodFormValidation(testSchema, customInitial)

      expect(formData.name).toBe('John')
      expect(formData.email).toBe('john@example.com')
      expect(formData.age).toBe(25)
    })
  })

  describe('validate 方法', () => {
    it('應該在有效資料時返回 true', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
        status: 'active' as const
      }
      const { validate } = useZodFormValidation(testSchema, validData)

      const result = validate()

      expect(result).toBe(true)
    })

    it('應該在無效資料時返回 false 並設定錯誤', () => {
      const { validate, errors } = useZodFormValidation(testSchema, initialData)

      const result = validate()

      expect(result).toBe(false)
      expect(errors.value).toHaveProperty('name')
      expect(errors.value).toHaveProperty('email')
    })

    it('應該在驗證通過後清除錯誤', () => {
      const { formData, validate, errors } = useZodFormValidation(testSchema, initialData)

      // 先驗證失敗
      validate()
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      // 修正資料後再驗證
      formData.name = 'John'
      formData.email = 'john@example.com'
      const result = validate()

      expect(result).toBe(true)
      expect(errors.value).toEqual({})
    })
  })

  describe('validateField 方法', () => {
    it('應該驗證單一欄位並返回錯誤訊息', () => {
      const { formData, validateField } = useZodFormValidation(testSchema, initialData)

      formData.name = 'A' // 太短
      const error = validateField('name')

      expect(error).toBe('名稱至少 2 個字')
    })

    it('應該在欄位有效時返回 undefined', () => {
      const { formData, validateField } = useZodFormValidation(testSchema, initialData)

      formData.name = 'John Doe'
      const error = validateField('name')

      expect(error).toBeUndefined()
    })

    it('應該更新 errors 物件', () => {
      const { formData, validateField, errors } = useZodFormValidation(testSchema, initialData)

      formData.email = 'invalid-email'
      validateField('email')

      expect(errors.value.email).toBe('Email 格式不正確')
    })

    it('應該在修正後清除該欄位錯誤', () => {
      const { formData, validateField, errors } = useZodFormValidation(testSchema, initialData)

      // 先產生錯誤
      formData.email = 'invalid'
      validateField('email')
      expect(errors.value.email).toBeDefined()

      // 修正後再驗證
      formData.email = 'valid@example.com'
      validateField('email')
      expect(errors.value.email).toBeUndefined()
    })
  })

  describe('clearErrors 方法', () => {
    it('應該清除所有錯誤', () => {
      const { validate, clearErrors, errors } = useZodFormValidation(testSchema, initialData)

      validate() // 產生錯誤
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      clearErrors()
      expect(errors.value).toEqual({})
    })
  })

  describe('clearFieldError 方法', () => {
    it('應該只清除指定欄位的錯誤', () => {
      const { validate, clearFieldError, errors } = useZodFormValidation(testSchema, initialData)

      validate() // 產生多個錯誤
      expect(errors.value.name).toBeDefined()
      expect(errors.value.email).toBeDefined()

      clearFieldError('name')
      expect(errors.value.name).toBeUndefined()
      expect(errors.value.email).toBeDefined()
    })
  })

  describe('setError 方法', () => {
    it('應該能手動設定錯誤訊息', () => {
      const { setError, errors } = useZodFormValidation(testSchema, initialData)

      setError('name', '自定義錯誤')
      expect(errors.value.name).toBe('自定義錯誤')
    })

    it('應該能設定 submit 錯誤', () => {
      const { setError, errors } = useZodFormValidation(testSchema, initialData)

      setError('submit', '提交失敗')
      expect(errors.value.submit).toBe('提交失敗')
    })
  })

  describe('reset 方法', () => {
    it('應該重置表單資料到初始值', () => {
      const { formData, reset } = useZodFormValidation(testSchema, initialData)

      formData.name = 'Changed'
      formData.email = 'changed@example.com'

      reset()

      expect(formData.name).toBe('')
      expect(formData.email).toBe('')
    })

    it('應該同時清除錯誤', () => {
      const { validate, reset, errors } = useZodFormValidation(testSchema, initialData)

      validate()
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      reset()
      expect(errors.value).toEqual({})
    })
  })

  describe('setFormData 方法', () => {
    it('應該能部分更新表單資料', () => {
      const { formData, setFormData } = useZodFormValidation(testSchema, initialData)

      setFormData({ name: 'Updated Name' })

      expect(formData.name).toBe('Updated Name')
      expect(formData.email).toBe('') // 保持原值
    })

    it('應該能更新多個欄位', () => {
      const { formData, setFormData } = useZodFormValidation(testSchema, initialData)

      setFormData({
        name: 'New Name',
        email: 'new@example.com',
        age: 30
      })

      expect(formData.name).toBe('New Name')
      expect(formData.email).toBe('new@example.com')
      expect(formData.age).toBe(30)
    })
  })

  describe('computed 屬性', () => {
    it('isValid 應該反映驗證狀態', () => {
      const { validate, isValid } = useZodFormValidation(testSchema, {
        name: 'John',
        email: 'john@example.com',
        status: 'active'
      })

      expect(isValid.value).toBe(true) // 初始時沒有錯誤

      // 觸發驗證
      validate()
      expect(isValid.value).toBe(true)
    })

    it('hasErrors 應該在有錯誤時為 true', () => {
      const { validate, hasErrors } = useZodFormValidation(testSchema, initialData)

      expect(hasErrors.value).toBe(false)

      validate()
      expect(hasErrors.value).toBe(true)
    })
  })

  describe('複雜 Schema 支援', () => {
    it('應該支援 refine 驗證', () => {
      const schemaWithRefine = z.object({
        password: z.string().min(8),
        confirmPassword: z.string()
      }).refine(data => data.password === data.confirmPassword, {
        message: '密碼不一致',
        path: ['confirmPassword']
      })

      const { formData, validate, errors } = useZodFormValidation(schemaWithRefine, {
        password: 'password123',
        confirmPassword: 'different'
      })

      validate()
      expect(errors.value.confirmPassword).toBe('密碼不一致')
    })

    it('應該支援 nullable 欄位', () => {
      const schemaWithNullable = z.object({
        name: z.string().nullable()
      })

      const { formData, validate } = useZodFormValidation(schemaWithNullable, {
        name: null
      })

      const result = validate()
      expect(result).toBe(true)
      expect(formData.name).toBeNull()
    })

    it('應該支援 optional 欄位', () => {
      const schemaWithOptional = z.object({
        required: z.string(),
        optional: z.string().optional()
      })

      const { validate } = useZodFormValidation(schemaWithOptional, {
        required: 'value',
        optional: undefined
      })

      const result = validate()
      expect(result).toBe(true)
    })
  })
})
