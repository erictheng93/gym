/**
 * Unit tests for useFormValidation composable
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { useFormValidation, validateOnce } from './useFormValidation'

// Test schema
const testSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
  name: z.string().min(1, '請輸入姓名').optional(),
})

const schemaWithRefine = z.object({
  password: z.string().min(8, '密碼至少需要 8 個字元'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: '密碼不符',
  path: ['confirmPassword'],
})

describe('useFormValidation', () => {
  describe('validate', () => {
    it('should return success with valid data', () => {
      const { validate } = useFormValidation(testSchema)
      const result = validate({ email: 'test@example.com', password: 'password123' })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ email: 'test@example.com', password: 'password123' })
      expect(result.errors).toBeNull()
    })

    it('should return errors for invalid data', () => {
      const { validate, errors } = useFormValidation(testSchema)
      const result = validate({ email: 'invalid', password: '123' })

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.errors?.email).toBe('請輸入有效的電子郵件')
      expect(result.errors?.password).toBe('密碼至少需要 8 個字元')
      expect(errors.value.email).toBe('請輸入有效的電子郵件')
    })

    it('should clear errors on successful validation', () => {
      const { validate, errors } = useFormValidation(testSchema)

      // First, create some errors
      validate({ email: 'invalid', password: '123' })
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      // Then validate with valid data
      validate({ email: 'test@example.com', password: 'password123' })
      expect(Object.keys(errors.value).length).toBe(0)
    })

    it('should handle refine validations', () => {
      const { validate } = useFormValidation(schemaWithRefine)
      const result = validate({ password: 'password123', confirmPassword: 'different' })

      expect(result.success).toBe(false)
      expect(result.errors?.confirmPassword).toBe('密碼不符')
    })
  })

  describe('validateField', () => {
    it('should validate a single field', () => {
      const { validateField, errors } = useFormValidation(testSchema)

      const error = validateField('email', 'invalid-email', { email: 'invalid-email', password: 'password123' })

      expect(error).toBe('請輸入有效的電子郵件')
      expect(errors.value.email).toBe('請輸入有效的電子郵件')
    })

    it('should clear field error when valid', () => {
      const { validateField, errors, setError } = useFormValidation(testSchema)

      // Set an error first
      setError('email', 'Some error')
      expect(errors.value.email).toBe('Some error')

      // Validate with valid value
      validateField('email', 'valid@example.com', { email: 'valid@example.com', password: 'password123' })

      expect(errors.value.email).toBeUndefined()
    })
  })

  describe('touchField', () => {
    it('should mark field as touched', () => {
      const { touchField, touched } = useFormValidation(testSchema)

      expect(touched.value.email).toBeUndefined()

      touchField('email')

      expect(touched.value.email).toBe(true)
    })
  })

  describe('touchAll', () => {
    it('should mark all fields as touched', () => {
      const { touchAll, touched } = useFormValidation(testSchema)

      touchAll()

      expect(touched.value.email).toBe(true)
      expect(touched.value.password).toBe(true)
    })
  })

  describe('clearErrors', () => {
    it('should clear all errors', () => {
      const { validate, clearErrors, errors } = useFormValidation(testSchema)

      validate({ email: 'invalid', password: '123' })
      expect(Object.keys(errors.value).length).toBeGreaterThan(0)

      clearErrors()
      expect(Object.keys(errors.value).length).toBe(0)
    })
  })

  describe('clearFieldError', () => {
    it('should clear specific field error', () => {
      const { validate, clearFieldError, errors } = useFormValidation(testSchema)

      validate({ email: 'invalid', password: '123' })
      expect(errors.value.email).toBeDefined()
      expect(errors.value.password).toBeDefined()

      clearFieldError('email')

      expect(errors.value.email).toBeUndefined()
      expect(errors.value.password).toBeDefined()
    })
  })

  describe('setError', () => {
    it('should set a manual error', () => {
      const { setError, errors } = useFormValidation(testSchema)

      setError('email', '此 Email 已被使用')

      expect(errors.value.email).toBe('此 Email 已被使用')
    })

    it('should set form-level error', () => {
      const { setError, errors } = useFormValidation(testSchema)

      setError('_form', '表單提交失敗')

      expect(errors.value._form).toBe('表單提交失敗')
    })
  })

  describe('setErrors', () => {
    it('should set multiple errors at once', () => {
      const { setErrors, errors } = useFormValidation(testSchema)

      setErrors({
        email: 'Email 錯誤',
        password: '密碼錯誤',
      })

      expect(errors.value.email).toBe('Email 錯誤')
      expect(errors.value.password).toBe('密碼錯誤')
    })
  })

  describe('reset', () => {
    it('should reset errors and touched state', () => {
      const { validate, touchField, reset, errors, touched } = useFormValidation(testSchema)

      validate({ email: 'invalid', password: '123' })
      touchField('email')

      expect(Object.keys(errors.value).length).toBeGreaterThan(0)
      expect(touched.value.email).toBe(true)

      reset()

      expect(Object.keys(errors.value).length).toBe(0)
      expect(Object.keys(touched.value).length).toBe(0)
    })
  })

  describe('hasErrors', () => {
    it('should return true when there are errors', () => {
      const { validate, hasErrors } = useFormValidation(testSchema)

      expect(hasErrors.value).toBe(false)

      validate({ email: 'invalid', password: '123' })

      expect(hasErrors.value).toBe(true)
    })
  })

  describe('isValid', () => {
    it('should return true when there are no errors', () => {
      const { validate, isValid } = useFormValidation(testSchema)

      expect(isValid.value).toBe(true)

      validate({ email: 'invalid', password: '123' })
      expect(isValid.value).toBe(false)

      validate({ email: 'valid@example.com', password: 'password123' })
      expect(isValid.value).toBe(true)
    })
  })

  describe('getFieldError', () => {
    it('should return error only for touched fields', () => {
      const { validate, getFieldError, touchField } = useFormValidation(testSchema)

      validate({ email: 'invalid', password: '123' })

      // Not touched yet
      expect(getFieldError('email')).toBeUndefined()

      touchField('email')
      expect(getFieldError('email')).toBe('請輸入有效的電子郵件')
    })
  })

  describe('visibleErrors', () => {
    it('should only include errors for touched fields', () => {
      const { validate, visibleErrors, touchField } = useFormValidation(testSchema)

      validate({ email: 'invalid', password: '123' })

      expect(Object.keys(visibleErrors.value).length).toBe(0)

      touchField('email')
      expect(visibleErrors.value.email).toBe('請輸入有效的電子郵件')
      expect(visibleErrors.value.password).toBeUndefined()
    })

    it('should always include form-level errors', () => {
      const { setError, visibleErrors } = useFormValidation(testSchema)

      setError('_form', '表單錯誤')

      expect(visibleErrors.value._form).toBe('表單錯誤')
    })
  })
})

describe('validateOnce', () => {
  it('should validate without creating reactive state', () => {
    const result = validateOnce(testSchema, { email: 'test@example.com', password: 'password123' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ email: 'test@example.com', password: 'password123' })
  })

  it('should return errors for invalid data', () => {
    const result = validateOnce(testSchema, { email: 'invalid', password: '123' })

    expect(result.success).toBe(false)
    expect(result.errors?.email).toBe('請輸入有效的電子郵件')
  })
})
