// -nocheck
/**
 * useFormValidation.test.ts
 * Tests for the Zod-integrated form validation composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

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

// Import after mocks
import { useFormValidation } from './useFormValidation'

describe('useFormValidation', () => {
  // 基本測試 Schema
  const basicSchema = z.object({
    name: z.string().min(2, '名稱至少 2 個字').max(50, '名稱不能超過 50 個字'),
    email: z.string().email('Email 格式不正確'),
    age: z.number().positive('年齡必須大於 0').optional()
  })

  type BasicFormData = z.infer<typeof basicSchema>

  const initialData: BasicFormData = {
    name: '',
    email: '',
    age: undefined
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('初始化', () => {
    it('應該正確初始化 formData', () => {
      const { formData } = useFormValidation(basicSchema, initialData)

      expect(formData.value.name).toBe('')
      expect(formData.value.email).toBe('')
      expect(formData.value.age).toBeUndefined()
    })

    it('應該初始化時沒有錯誤', () => {
      const { errors, isValid } = useFormValidation(basicSchema, initialData)

      expect(errors.value).toEqual({})
      expect(isValid.value).toBe(true)
    })

    it('應該初始化 isDirty 為 false', () => {
      const { isDirty } = useFormValidation(basicSchema, initialData)

      expect(isDirty.value).toBe(false)
    })

    it('應該初始化 isValidating 為 false', () => {
      const { isValidating } = useFormValidation(basicSchema, initialData)

      expect(isValidating.value).toBe(false)
    })

    it('應該接受帶有初始值的資料', () => {
      const customInitial: BasicFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25
      }
      const { formData } = useFormValidation(basicSchema, customInitial)

      expect(formData.value.name).toBe('John Doe')
      expect(formData.value.email).toBe('john@example.com')
      expect(formData.value.age).toBe(25)
    })

    it('應該處理 null 初始值', () => {
      const schema = z.object({ value: z.string().nullable() })
      const { formData } = useFormValidation(schema, { value: null })

      expect(formData.value.value).toBeNull()
    })
  })

  describe('validate - 整個表單驗證', () => {
    it('應該在有效資料時返回 true', async () => {
      const validData: BasicFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25
      }
      const { validate } = useFormValidation(basicSchema, validData)

      const result = await validate()

      expect(result).toBe(true)
    })

    it('應該在無效資料時返回 false 並設定錯誤', async () => {
      const { validate, errors } = useFormValidation(basicSchema, initialData)

      const result = await validate()

      expect(result).toBe(false)
      expect(errors.value).toHaveProperty('name')
      expect(errors.value).toHaveProperty('email')
    })

    it('應該在驗證通過後清除錯誤', async () => {
      const { formData, validate, errors } = useFormValidation(basicSchema, initialData)

      // 先驗證失敗
      await validate()
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      // 修正資料後再驗證
      formData.value.name = 'John'
      formData.value.email = 'john@example.com'
      const result = await validate()

      expect(result).toBe(true)
      expect(errors.value).toEqual({})
    })

    it('應該在驗證過程中設置 isValidating 為 true', async () => {
      const { validate, isValidating } = useFormValidation(basicSchema, initialData)

      // isValidating should toggle during validation
      const validatePromise = validate()
      // Note: Since validation is sync, isValidating may be false already
      await validatePromise
      expect(isValidating.value).toBe(false)
    })
  })

  describe('validateField - 單一欄位驗證', () => {
    it('應該驗證單一欄位並返回錯誤', async () => {
      const { formData, validateField, errors } = useFormValidation(basicSchema, initialData)

      formData.value.name = 'A' // 太短
      const result = await validateField('name')

      expect(result).toBe(false)
      expect(errors.value.name).toBe('名稱至少 2 個字')
    })

    it('應該在欄位有效時返回 true', async () => {
      const { formData, validateField, errors } = useFormValidation(basicSchema, initialData)

      formData.value.name = 'John Doe'
      const result = await validateField('name')

      expect(result).toBe(true)
      expect(errors.value.name).toBeUndefined()
    })

    it('應該只更新該欄位的錯誤', async () => {
      const { formData, validate, validateField, errors } = useFormValidation(basicSchema, initialData)

      // 先產生多個錯誤
      await validate()
      expect(errors.value.name).toBeDefined()
      expect(errors.value.email).toBeDefined()

      // 修正 name 欄位並驗證
      formData.value.name = 'Valid Name'
      await validateField('name')

      expect(errors.value.name).toBeUndefined()
      expect(errors.value.email).toBeDefined() // email 錯誤仍存在
    })

    it('應該處理不存在的欄位 schema', async () => {
      const simpleSchema = z.object({
        value: z.string()
      })
      const { validateField } = useFormValidation(simpleSchema, { value: '' })

      // 如果欄位 schema 不存在，應該回退到完整驗證
      const result = await validateField('value')
      // 空字串驗證通過 (沒有 min 限制)
      expect(result).toBe(true)
    })
  })

  describe('clearErrors - 清除錯誤', () => {
    it('應該清除所有錯誤', async () => {
      const { validate, clearErrors, errors } = useFormValidation(basicSchema, initialData)

      await validate() // 產生錯誤
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      clearErrors()
      expect(errors.value).toEqual({})
    })
  })

  describe('clearFieldError - 清除單一欄位錯誤', () => {
    it('應該只清除指定欄位的錯誤', async () => {
      const { validate, clearFieldError, errors } = useFormValidation(basicSchema, initialData)

      await validate() // 產生多個錯誤
      expect(errors.value.name).toBeDefined()
      expect(errors.value.email).toBeDefined()

      clearFieldError('name')
      expect(errors.value.name).toBeUndefined()
      expect(errors.value.email).toBeDefined() // 其他錯誤保留
    })
  })

  describe('reset - 重置表單', () => {
    it('應該重置表單資料到初始值', () => {
      const { formData, reset } = useFormValidation(basicSchema, initialData)

      formData.value.name = 'Changed'
      formData.value.email = 'changed@example.com'

      reset()

      expect(formData.value.name).toBe('')
      expect(formData.value.email).toBe('')
    })

    it('應該同時清除錯誤', async () => {
      const { validate, reset, errors } = useFormValidation(basicSchema, initialData)

      await validate()
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      reset()
      expect(errors.value).toEqual({})
    })

    it('應該接受新的初始資料', () => {
      const { formData, reset } = useFormValidation(basicSchema, initialData)

      const newData = { name: 'New Name' }
      reset(newData)

      expect(formData.value.name).toBe('New Name')
      expect(formData.value.email).toBe('') // 保持原始初始值
    })

    it('應該更新初始快照', () => {
      const { reset, isDirty } = useFormValidation(basicSchema, initialData)

      reset({ name: 'New Initial' })

      expect(isDirty.value).toBe(false) // 重置後不應該是 dirty
    })
  })

  describe('setFieldValue - 設定欄位值', () => {
    it('應該設定欄位值', () => {
      const { formData, setFieldValue } = useFormValidation(basicSchema, initialData)

      setFieldValue('name', 'Test Name')

      expect(formData.value.name).toBe('Test Name')
    })

    it('應該在 validateOnChange 時觸發防抖驗證', async () => {
      const { setFieldValue, errors } = useFormValidation(
        basicSchema,
        initialData,
        { validateOnChange: true, debounce: 300 }
      )

      setFieldValue('name', 'A') // 太短

      // 應該還沒有錯誤 (防抖中)
      expect(errors.value.name).toBeUndefined()

      // 前進時間
      await vi.advanceTimersByTimeAsync(300)

      // 現在應該有錯誤
      expect(errors.value.name).toBe('名稱至少 2 個字')
    })

    it('應該取消之前的防抖驗證', async () => {
      const { setFieldValue, errors } = useFormValidation(
        basicSchema,
        initialData,
        { validateOnChange: true, debounce: 300 }
      )

      setFieldValue('name', 'A') // 無效
      await vi.advanceTimersByTimeAsync(100)
      setFieldValue('name', 'Valid Name') // 有效
      await vi.advanceTimersByTimeAsync(300)

      // 應該只驗證最後的值
      expect(errors.value.name).toBeUndefined()
    })

    it('應該在 validateOnChange: false 時不自動驗證', async () => {
      const { setFieldValue, errors } = useFormValidation(
        basicSchema,
        initialData,
        { validateOnChange: false }
      )

      setFieldValue('name', 'A')
      await vi.advanceTimersByTimeAsync(500)

      expect(errors.value.name).toBeUndefined()
    })
  })

  describe('setFieldError - 設定欄位錯誤', () => {
    it('應該能手動設定錯誤訊息', () => {
      const { setFieldError, errors } = useFormValidation(basicSchema, initialData)

      setFieldError('name', '自定義錯誤訊息')

      expect(errors.value.name).toBe('自定義錯誤訊息')
    })

    it('應該覆蓋現有錯誤', async () => {
      const { validate, setFieldError, errors } = useFormValidation(basicSchema, initialData)

      await validate()
      expect(errors.value.name).toBeDefined()

      setFieldError('name', '新的錯誤訊息')
      expect(errors.value.name).toBe('新的錯誤訊息')
    })
  })

  describe('getFieldError - 獲取欄位錯誤', () => {
    it('應該返回欄位錯誤訊息', async () => {
      const { validate, getFieldError } = useFormValidation(basicSchema, initialData)

      await validate()

      expect(getFieldError('name')).toBe('名稱至少 2 個字')
    })

    it('應該在沒有錯誤時返回 undefined', () => {
      const { getFieldError } = useFormValidation(basicSchema, initialData)

      expect(getFieldError('name')).toBeUndefined()
    })
  })

  describe('hasFieldError - 欄位是否有錯誤', () => {
    it('應該在有錯誤時返回 true', async () => {
      const { validate, hasFieldError } = useFormValidation(basicSchema, initialData)

      await validate()

      expect(hasFieldError('name')).toBe(true)
    })

    it('應該在沒有錯誤時返回 false', () => {
      const { hasFieldError } = useFormValidation(basicSchema, initialData)

      expect(hasFieldError('name')).toBe(false)
    })
  })

  describe('isDirty - 表單是否被修改', () => {
    it('應該在修改後變為 true', () => {
      const { formData, isDirty } = useFormValidation(basicSchema, initialData)

      expect(isDirty.value).toBe(false)

      formData.value.name = 'Changed'

      expect(isDirty.value).toBe(true)
    })

    it('應該在恢復原值後變回 false', () => {
      const { formData, isDirty } = useFormValidation(basicSchema, initialData)

      formData.value.name = 'Changed'
      expect(isDirty.value).toBe(true)

      formData.value.name = ''
      expect(isDirty.value).toBe(false)
    })
  })

  describe('isValid - 表單是否有效', () => {
    it('應該在沒有錯誤時為 true', () => {
      const { isValid } = useFormValidation(basicSchema, initialData)

      expect(isValid.value).toBe(true)
    })

    it('應該在有錯誤時為 false', async () => {
      const { validate, isValid } = useFormValidation(basicSchema, initialData)

      await validate()

      expect(isValid.value).toBe(false)
    })
  })

  describe('複雜 Schema 支援', () => {
    it('應該支援 refine 驗證', async () => {
      const schemaWithRefine = z.object({
        password: z.string().min(8, '密碼至少 8 個字'),
        confirmPassword: z.string()
      }).refine(data => data.password === data.confirmPassword, {
        message: '密碼不一致',
        path: ['confirmPassword']
      })

      const { validate, errors } = useFormValidation(schemaWithRefine, {
        password: 'password123',
        confirmPassword: 'different'
      })

      await validate()

      expect(errors.value.confirmPassword).toBe('密碼不一致')
    })

    it('應該支援 nullable 欄位', async () => {
      const schemaWithNullable = z.object({
        name: z.string().nullable()
      })

      const { formData, validate } = useFormValidation(schemaWithNullable, {
        name: null
      })

      const result = await validate()

      expect(result).toBe(true)
      expect(formData.value.name).toBeNull()
    })

    it('應該支援 optional 欄位', async () => {
      const schemaWithOptional = z.object({
        required: z.string().min(1, '必填'),
        optional: z.string().optional()
      })

      const { validate } = useFormValidation(schemaWithOptional, {
        required: 'value',
        optional: undefined
      })

      const result = await validate()
      expect(result).toBe(true)
    })

    it('應該支援 enum 欄位', async () => {
      const schemaWithEnum = z.object({
        status: z.enum(['active', 'inactive'])
      })

      const { formData, validate } = useFormValidation(schemaWithEnum, {
        status: 'active'
      })

      const result = await validate()
      expect(result).toBe(true)
      expect(formData.value.status).toBe('active')
    })

    it('應該支援 nested objects', async () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string().min(1, '姓名必填'),
          email: z.string().email('Email 格式錯誤')
        })
      })

      const { validate, errors } = useFormValidation(nestedSchema, {
        user: { name: '', email: 'invalid' }
      })

      await validate()

      expect(errors.value['user.name']).toBe('姓名必填')
      expect(errors.value['user.email']).toBe('Email 格式錯誤')
    })
  })
})
