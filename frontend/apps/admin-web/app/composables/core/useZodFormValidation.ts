/**
 * useZodFormValidation - Zod Schema 表單驗證 Composable
 *
 * 將 Zod Schema 直接整合到表單驗證中，支援即時驗證
 *
 * @example
 * const { formData, errors, validate, validateField } = useZodFormValidation(
 *   createMemberSchema,
 *   { full_name: '', email: '' },
 *   { validateOnChange: true }
 * )
 */

import { ref, reactive, watch, computed, type UnwrapRef, type ComputedRef, type Ref } from 'vue'
import { z } from 'zod'
import { formatZodErrors } from '~/schemas/common.schema'

export interface ZodFormOptions {
  /** 在欄位變更時自動驗證整個表單 */
  validateOnChange?: boolean
  /** 防抖延遲時間（毫秒），用於 validateOnChange */
  debounceMs?: number
}

export interface ZodFormReturn<T> {
  /** 表單資料（reactive） */
  formData: UnwrapRef<T>
  /** 錯誤訊息（以欄位名稱為 key） */
  errors: Ref<Record<string, string>>
  /** 表單是否有效 */
  isValid: ComputedRef<boolean>
  /** 是否有任何錯誤 */
  hasErrors: ComputedRef<boolean>
  /** 驗證整個表單 */
  validate: () => boolean
  /** 驗證單一欄位 */
  validateField: (field: keyof T) => string | undefined
  /** 清除所有錯誤 */
  clearErrors: () => void
  /** 清除單一欄位錯誤 */
  clearFieldError: (field: keyof T) => void
  /** 設定錯誤訊息 */
  setError: (field: keyof T | 'submit', message: string) => void
  /** 重置表單到初始值 */
  reset: () => void
  /** 更新表單資料 */
  setFormData: (data: Partial<T>) => void
}

/**
 * Zod Schema 表單驗證 Composable
 *
 * @param schema - Zod Schema（必須是 ZodObject 或類似結構）
 * @param initialData - 表單初始資料
 * @param options - 驗證選項
 */
export function useZodFormValidation<T extends z.ZodType>(
  schema: T,
  initialData: z.infer<T>,
  options: ZodFormOptions = {}
): ZodFormReturn<z.infer<T>> {
  const { validateOnChange = false, debounceMs = 300 } = options

  // 儲存初始值以供重置使用
  const _initialData = JSON.parse(JSON.stringify(initialData)) as z.infer<T>

  // 表單資料（reactive）
  const formData = reactive(JSON.parse(JSON.stringify(initialData))) as UnwrapRef<z.infer<T>>

  // 錯誤訊息
  const errors = ref<Record<string, string>>({})

  // 是否有效（無任何錯誤）
  const isValid = computed(() => Object.keys(errors.value).length === 0)

  // 是否有錯誤
  const hasErrors = computed(() => Object.keys(errors.value).length > 0)

  /**
   * 驗證整個表單
   */
  const validate = (): boolean => {
    const result = schema.safeParse(formData)

    if (result.success) {
      errors.value = {}
      return true
    }

    errors.value = formatZodErrors(result.error)
    return false
  }

  /**
   * 驗證單一欄位
   * 嘗試從 schema 中提取該欄位的驗證規則
   */
  const validateField = (field: keyof z.infer<T>): string | undefined => {
    // 先清除該欄位的錯誤
    const fieldKey = field as string
    const newErrors = { ...errors.value }
    delete newErrors[fieldKey]

    // 嘗試獲取欄位 schema
    const fieldSchema = getFieldSchema(schema, fieldKey)

    if (fieldSchema) {
      // 使用欄位 schema 驗證
      const fieldValue = (formData as Record<string, unknown>)[fieldKey]
      const result = fieldSchema.safeParse(fieldValue)

      if (!result.success) {
        const message = result.error.issues[0]?.message
        if (message) {
          newErrors[fieldKey] = message
          errors.value = newErrors
          return message
        }
      }
    } else {
      // 無法獲取欄位 schema，使用整個 schema 驗證
      const result = schema.safeParse(formData)
      if (!result.success) {
        const fieldErrors = formatZodErrors(result.error)
        if (fieldErrors[fieldKey]) {
          newErrors[fieldKey] = fieldErrors[fieldKey]
          errors.value = newErrors
          return fieldErrors[fieldKey]
        }
      }
    }

    errors.value = newErrors
    return undefined
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
  const clearFieldError = (field: keyof z.infer<T>): void => {
    const newErrors = { ...errors.value }
    delete newErrors[field as string]
    errors.value = newErrors
  }

  /**
   * 設定錯誤訊息
   */
  const setError = (field: keyof z.infer<T> | 'submit', message: string): void => {
    errors.value = { ...errors.value, [field as string]: message }
  }

  /**
   * 重置表單到初始值
   */
  const reset = (): void => {
    Object.assign(formData as object, JSON.parse(JSON.stringify(_initialData)))
    clearErrors()
  }

  /**
   * 更新表單資料
   */
  const setFormData = (data: Partial<z.infer<T>>): void => {
    Object.assign(formData as object, data)
  }

  // 設置 validateOnChange
  if (validateOnChange) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    watch(
      () => formData as object,
      () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }
        debounceTimer = setTimeout(() => {
          validate()
        }, debounceMs)
      },
      { deep: true }
    )
  }

  return {
    formData,
    errors,
    isValid,
    hasErrors,
    validate,
    validateField,
    clearErrors,
    clearFieldError,
    setError,
    reset,
    setFormData
  }
}

/**
 * 從 Zod Schema 中提取單一欄位的 Schema
 * 支援 ZodObject, ZodEffects (refine/transform), ZodOptional, ZodNullable 等
 * Zod v4 compatible
 */
function getFieldSchema(schema: z.ZodType, fieldName: string): z.ZodType | undefined {
  // Use duck typing for Zod v4 compatibility
  const schemaDef = schema as unknown as { _zod?: { def?: { shape?: Record<string, z.ZodType>; schema?: z.ZodType; innerType?: z.ZodType } }; shape?: Record<string, z.ZodType>; _def?: { shape?: Record<string, z.ZodType>; schema?: z.ZodType; innerType?: z.ZodType } }

  // ZodObject - check for shape property (works in both Zod v3 and v4)
  if ('shape' in schema && typeof schema.shape === 'object' && schema.shape !== null) {
    return (schema.shape as Record<string, z.ZodType>)[fieldName]
  }

  // Try _def.shape for some Zod versions
  if (schemaDef._def?.shape) {
    return schemaDef._def.shape[fieldName]
  }

  // ZodEffects - unwrap inner schema
  if (schemaDef._def?.schema) {
    return getFieldSchema(schemaDef._def.schema as z.ZodType, fieldName)
  }

  // Zod v4 _zod structure
  if (schemaDef._zod?.def?.schema) {
    return getFieldSchema(schemaDef._zod.def.schema as z.ZodType, fieldName)
  }

  // ZodOptional, ZodNullable, ZodDefault - unwrap inner type
  if (schemaDef._def?.innerType) {
    return getFieldSchema(schemaDef._def.innerType as z.ZodType, fieldName)
  }

  // Zod v4 _zod structure for wrapped types
  if (schemaDef._zod?.def?.innerType) {
    return getFieldSchema(schemaDef._zod.def.innerType as z.ZodType, fieldName)
  }

  return undefined
}

export default useZodFormValidation
