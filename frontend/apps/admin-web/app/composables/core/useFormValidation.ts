/**
 * 表單驗證 Composable
 * 整合 Zod 驗證與 Vue 響應式系統
 */

import { z } from 'zod'
import { formatZodErrors } from '~/schemas/common.schema'

export interface FormValidationOptions {
  /** 是否在欄位變更時即時驗證（預設 false） */
  validateOnChange?: boolean
  /** 是否在失焦時驗證（預設 true） */
  validateOnBlur?: boolean
  /** 驗證延遲時間（毫秒，用於 validateOnChange） */
  debounce?: number
}

export interface FormValidationResult<T> {
  /** 表單數據 */
  formData: Ref<T>
  /** 欄位錯誤訊息 */
  errors: Ref<Record<string, string>>
  /** 表單是否有效 */
  isValid: ComputedRef<boolean>
  /** 是否正在驗證 */
  isValidating: Ref<boolean>
  /** 表單是否被修改過 */
  isDirty: Ref<boolean>
  /** 驗證整個表單 */
  validate: () => Promise<boolean>
  /** 驗證單一欄位 */
  validateField: (field: keyof T) => Promise<boolean>
  /** 清除所有錯誤 */
  clearErrors: () => void
  /** 清除單一欄位錯誤 */
  clearFieldError: (field: keyof T) => void
  /** 重置表單 */
  reset: (newData?: Partial<T>) => void
  /** 設定欄位值 */
  setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void
  /** 設定欄位錯誤 */
  setFieldError: (field: keyof T, message: string) => void
  /** 獲取欄位錯誤 */
  getFieldError: (field: keyof T) => string | undefined
  /** 欄位是否有錯誤 */
  hasFieldError: (field: keyof T) => boolean
}

/**
 * 表單驗證 Composable
 * @param schema - Zod 驗證 Schema
 * @param initialData - 初始表單數據
 * @param options - 驗證選項
 */
export function useFormValidation<T extends z.ZodType>(
  schema: T,
  initialData: z.infer<T>,
  options?: FormValidationOptions
): FormValidationResult<z.infer<T>> {
  type FormData = z.infer<T>

  const {
    validateOnChange = false,
    validateOnBlur = true,
    debounce = 300,
  } = options || {}

  // 表單數據
  const formData = ref<FormData>({ ...initialData }) as Ref<FormData>

  // 初始數據快照（用於重置和比較）
  const initialSnapshot = ref<FormData>({ ...initialData })

  // 錯誤訊息
  const errors = ref<Record<string, string>>({})

  // 驗證狀態
  const isValidating = ref(false)

  // 表單是否有效
  const isValid = computed(() => Object.keys(errors.value).length === 0)

  // 表單是否被修改過
  const isDirty = computed(() => {
    return JSON.stringify(formData.value) !== JSON.stringify(initialSnapshot.value)
  })

  // 防抖計時器
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 驗證整個表單
   */
  const validate = async (): Promise<boolean> => {
    isValidating.value = true

    try {
      const result = schema.safeParse(formData.value)

      if (result.success) {
        errors.value = {}
        return true
      }

      errors.value = formatZodErrors(result.error)
      return false
    } finally {
      isValidating.value = false
    }
  }

  /**
   * 驗證單一欄位
   */
  const validateField = async (field: keyof FormData): Promise<boolean> => {
    // 嘗試提取單一欄位的 schema
    const fieldSchema = (schema as z.ZodObject<z.ZodRawShape>).shape?.[field as string]

    if (!fieldSchema) {
      // 如果無法提取單一欄位，驗證整個表單
      return validate()
    }

    const result = fieldSchema.safeParse((formData.value as Record<string, unknown>)[field as string])

    if (result.success) {
      // 清除該欄位的錯誤
      const newErrors = { ...errors.value }
      delete newErrors[field as string]
      errors.value = newErrors
      return true
    }

    // 設定該欄位的錯誤
    errors.value = {
      ...errors.value,
      [field as string]: result.error.issues[0]?.message || '驗證失敗',
    }
    return false
  }

  /**
   * 清除所有錯誤
   */
  const clearErrors = (): void => {
    errors.value = {}
  }

  /**
   * 清除單一欄位錯誤
   */
  const clearFieldError = (field: keyof FormData): void => {
    const newErrors = { ...errors.value }
    delete newErrors[field as string]
    errors.value = newErrors
  }

  /**
   * 重置表單
   */
  const reset = (newData?: Partial<FormData>): void => {
    if (newData) {
      formData.value = { ...initialSnapshot.value, ...newData }
      initialSnapshot.value = { ...formData.value }
    } else {
      formData.value = { ...initialSnapshot.value }
    }
    clearErrors()
  }

  /**
   * 設定欄位值
   */
  const setFieldValue = <K extends keyof FormData>(field: K, value: FormData[K]): void => {
    ;(formData.value as Record<string, unknown>)[field as string] = value

    // 如果啟用了即時驗證
    if (validateOnChange) {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        validateField(field)
      }, debounce)
    }
  }

  /**
   * 設定欄位錯誤
   */
  const setFieldError = (field: keyof FormData, message: string): void => {
    errors.value = {
      ...errors.value,
      [field as string]: message,
    }
  }

  /**
   * 獲取欄位錯誤
   */
  const getFieldError = (field: keyof FormData): string | undefined => {
    return errors.value[field as string]
  }

  /**
   * 欄位是否有錯誤
   */
  const hasFieldError = (field: keyof FormData): boolean => {
    return !!errors.value[field as string]
  }

  return {
    formData,
    errors,
    isValid,
    isValidating,
    isDirty,
    validate,
    validateField,
    clearErrors,
    clearFieldError,
    reset,
    setFieldValue,
    setFieldError,
    getFieldError,
    hasFieldError,
  }
}

// 導出類型
export type { FormValidationOptions, FormValidationResult }
