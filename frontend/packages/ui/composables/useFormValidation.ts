/**
 * useFormValidation - 表單驗證 Composable
 *
 * 提供常用驗證規則和錯誤狀態管理
 *
 * @example
 * const { errors, validate, clearErrors } = useFormValidation()
 *
 * // 使用內建驗證規則
 * const isValid = validate(form, {
 *   full_name: [required('請輸入姓名')],
 *   email: [email('Email 格式不正確')],
 *   phone: [pattern(/^[0-9-+() ]+$/, '電話格式不正確')]
 * })
 */

import { ref, computed, type Ref } from 'vue'

// 驗證規則類型
export type ValidationRule<T = unknown> = (value: T) => string | undefined

// 驗證規則集合類型
export type ValidationRules<T> = {
  [K in keyof T]?: ValidationRule<T[K]>[]
}

// 錯誤物件類型
export type ValidationErrors<T> = Partial<Record<keyof T | 'submit', string>>

/**
 * 必填驗證
 */
export const required = (message = '此欄位為必填'): ValidationRule => {
  return (value) => {
    if (value === null || value === undefined || value === '') {
      return message
    }
    if (typeof value === 'string' && value.trim() === '') {
      return message
    }
    if (Array.isArray(value) && value.length === 0) {
      return message
    }
    return undefined
  }
}

/**
 * Email 格式驗證
 */
export const email = (message = 'Email 格式不正確'): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return message
    }
    return undefined
  }
}

/**
 * 電話格式驗證
 */
export const phone = (message = '電話格式不正確'): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const phoneRegex = /^[0-9\-+() ]+$/
    if (!phoneRegex.test(value)) {
      return message
    }
    return undefined
  }
}

/**
 * 正則表達式驗證
 */
export const pattern = (regex: RegExp, message = '格式不正確'): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    if (!regex.test(value)) {
      return message
    }
    return undefined
  }
}

/**
 * 最小長度驗證
 */
export const minLength = (min: number, message?: string): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    if (value.length < min) {
      return message || `長度不得少於 ${min} 個字元`
    }
    return undefined
  }
}

/**
 * 最大長度驗證
 */
export const maxLength = (max: number, message?: string): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    if (value.length > max) {
      return message || `長度不得超過 ${max} 個字元`
    }
    return undefined
  }
}

/**
 * 最小值驗證
 */
export const min = (minValue: number, message?: string): ValidationRule<number | null> => {
  return (value) => {
    if (value === null || value === undefined) return undefined
    if (value < minValue) {
      return message || `數值不得小於 ${minValue}`
    }
    return undefined
  }
}

/**
 * 最大值驗證
 */
export const max = (maxValue: number, message?: string): ValidationRule<number | null> => {
  return (value) => {
    if (value === null || value === undefined) return undefined
    if (value > maxValue) {
      return message || `數值不得大於 ${maxValue}`
    }
    return undefined
  }
}

/**
 * 數值範圍驗證（包含邊界）
 */
export const between = (minValue: number, maxValue: number, message?: string): ValidationRule<number | null> => {
  return (value) => {
    if (value === null || value === undefined) return undefined
    if (value < minValue || value > maxValue) {
      return message || `數值必須介於 ${minValue} 至 ${maxValue} 之間`
    }
    return undefined
  }
}

/**
 * 正數驗證（大於 0）
 */
export const positive = (message = '數值必須大於 0'): ValidationRule<number | null> => {
  return (value) => {
    if (value === null || value === undefined) return undefined
    if (value <= 0) {
      return message
    }
    return undefined
  }
}

/**
 * 日期不能是未來日期
 */
export const dateNotFuture = (message = '日期不能是未來日期'): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const inputDate = new Date(value)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (inputDate > today) {
      return message
    }
    return undefined
  }
}

/**
 * 日期不能是過去日期
 */
export const dateNotPast = (message = '日期不能是過去日期'): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const inputDate = new Date(value)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (inputDate < today) {
      return message
    }
    return undefined
  }
}

/**
 * 日期範圍驗證
 */
export const dateRange = (minDate?: string, maxDate?: string, message?: string): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const inputDate = new Date(value)
    if (minDate) {
      const min = new Date(minDate)
      if (inputDate < min) {
        return message || `日期不能早於 ${minDate}`
      }
    }
    if (maxDate) {
      const max = new Date(maxDate)
      if (inputDate > max) {
        return message || `日期不能晚於 ${maxDate}`
      }
    }
    return undefined
  }
}

/**
 * 電話長度驗證（只計算數字）
 */
export const phoneLength = (minDigits = 8, maxDigits = 15, message?: string): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const digitsOnly = value.replace(/\D/g, '')
    if (digitsOnly.length < minDigits) {
      return message || `電話號碼至少需要 ${minDigits} 位數字`
    }
    if (digitsOnly.length > maxDigits) {
      return message || `電話號碼不能超過 ${maxDigits} 位數字`
    }
    return undefined
  }
}

/**
 * 陣列長度驗證（適用於標籤等）
 */
export const arrayLength = (maxItems: number, message?: string): ValidationRule<unknown[]> => {
  return (value) => {
    if (!value || !Array.isArray(value)) return undefined
    if (value.length > maxItems) {
      return message || `最多只能有 ${maxItems} 個項目`
    }
    return undefined
  }
}

/**
 * 台灣身分證字號驗證
 */
export const taiwanId = (message = '身分證字號格式不正確'): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const idRegex = /^[A-Z][12]\d{8}$/
    if (!idRegex.test(value.toUpperCase())) {
      return message
    }
    return undefined
  }
}

/**
 * 台灣統一編號驗證
 */
export const taxId = (message = '統一編號格式不正確'): ValidationRule<string> => {
  return (value) => {
    if (!value) return undefined
    const taxIdRegex = /^\d{8}$/
    if (!taxIdRegex.test(value)) {
      return message
    }
    return undefined
  }
}

/**
 * 表單驗證 Composable
 */
export function useFormValidation<T extends Record<string, unknown>>() {
  const errors: Ref<ValidationErrors<T>> = ref({})

  /**
   * 驗證單一欄位
   */
  const validateField = <K extends keyof T>(
    fieldName: K,
    value: T[K],
    rules: ValidationRule<T[K]>[]
  ): string | undefined => {
    for (const rule of rules) {
      const error = rule(value)
      if (error) {
        return error
      }
    }
    return undefined
  }

  /**
   * 驗證整個表單
   */
  const validate = (form: T, rules: ValidationRules<T>): boolean => {
    const newErrors: ValidationErrors<T> = {}

    for (const [fieldName, fieldRules] of Object.entries(rules)) {
      if (fieldRules && Array.isArray(fieldRules)) {
        const error = validateField(
          fieldName as keyof T,
          form[fieldName as keyof T],
          fieldRules as ValidationRule<T[keyof T]>[]
        )
        if (error) {
          newErrors[fieldName as keyof T] = error
        }
      }
    }

    errors.value = newErrors
    return Object.keys(newErrors).length === 0
  }

  /**
   * 清除所有錯誤
   */
  const clearErrors = () => {
    errors.value = {}
  }

  /**
   * 清除單一欄位錯誤
   */
  const clearFieldError = (fieldName: keyof T) => {
    const newErrors = { ...errors.value }
    delete newErrors[fieldName]
    errors.value = newErrors
  }

  /**
   * 設定單一欄位錯誤
   */
  const setError = (fieldName: keyof T | 'submit', message: string) => {
    errors.value = { ...errors.value, [fieldName]: message }
  }

  /**
   * 檢查是否有錯誤
   */
  const hasErrors = computed(() => Object.keys(errors.value).length > 0)

  return {
    errors,
    validate,
    validateField,
    clearErrors,
    clearFieldError,
    setError,
    hasErrors
  }
}

export default useFormValidation
