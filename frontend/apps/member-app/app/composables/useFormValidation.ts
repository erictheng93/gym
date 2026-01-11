/**
 * useFormValidation - Zod Schema-based Form Validation Composable
 *
 * Provides type-safe form validation using Zod schemas with reactive error state.
 *
 * @example
 * const { errors, validate, clearErrors, isValid } = useFormValidation(loginSchema)
 *
 * const handleSubmit = async () => {
 *   const result = validate({ email: email.value, password: password.value })
 *   if (!result.success) return
 *
 *   // result.data is fully typed based on schema
 *   await login(result.data.email, result.data.password)
 * }
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { z, type ZodSchema, type ZodError } from 'zod'

// Error object type - maps field names to error messages
export type FormErrors<T> = Partial<Record<keyof T | '_form', string>>

// Validation result type
export type ValidationResult<T> =
  | { success: true; data: T; errors: null }
  | { success: false; data: null; errors: FormErrors<T> }

/**
 * Parse Zod errors into a flat error object
 */
function parseZodErrors<T>(zodError: ZodError): FormErrors<T> {
  const errors: FormErrors<T> = {}

  for (const issue of zodError.issues) {
    const path = issue.path[0]
    if (path !== undefined) {
      // Only keep the first error per field
      if (!errors[path as keyof T]) {
        errors[path as keyof T] = issue.message
      }
    } else {
      // Root-level errors (e.g., from refine)
      errors['_form' as keyof FormErrors<T>] = issue.message
    }
  }

  return errors
}

/**
 * Form validation composable with Zod schema support
 */
export function useFormValidation<T extends z.ZodRawShape>(schema: ZodSchema<z.infer<z.ZodObject<T>>>) {
  type FormData = z.infer<typeof schema>

  const errors: Ref<FormErrors<FormData>> = ref({})
  const touched: Ref<Partial<Record<keyof FormData, boolean>>> = ref({})

  /**
   * Validate the entire form
   */
  const validate = (data: unknown): ValidationResult<FormData> => {
    const result = schema.safeParse(data)

    if (result.success) {
      errors.value = {}
      return { success: true, data: result.data, errors: null }
    }

    const parsedErrors = parseZodErrors<FormData>(result.error)
    errors.value = parsedErrors
    return { success: false, data: null, errors: parsedErrors }
  }

  /**
   * Validate a single field
   */
  const validateField = (fieldName: keyof FormData, value: unknown, formData?: unknown): string | undefined => {
    // For single field validation, we need the full form context for cross-field validation
    const dataToValidate = formData || { [fieldName]: value }
    const result = schema.safeParse(dataToValidate)

    if (result.success) {
      // Clear this field's error
      const newErrors = { ...errors.value }
      delete newErrors[fieldName]
      errors.value = newErrors
      return undefined
    }

    // Find error for this specific field
    const fieldError = result.error.issues.find(
      issue => issue.path[0] === fieldName
    )

    if (fieldError) {
      errors.value = { ...errors.value, [fieldName]: fieldError.message }
      return fieldError.message
    }

    // Clear error if no field-specific error found
    const newErrors = { ...errors.value }
    delete newErrors[fieldName]
    errors.value = newErrors
    return undefined
  }

  /**
   * Mark a field as touched (for showing errors only after interaction)
   */
  const touchField = (fieldName: keyof FormData) => {
    touched.value = { ...touched.value, [fieldName]: true }
  }

  /**
   * Mark all fields as touched
   */
  const touchAll = () => {
    const result = schema.safeParse({})
    if (!result.success) {
      const allFields = result.error.issues.map(i => i.path[0]).filter(Boolean) as (keyof FormData)[]
      const touchedAll: Partial<Record<keyof FormData, boolean>> = {}
      for (const field of allFields) {
        touchedAll[field] = true
      }
      touched.value = touchedAll
    }
  }

  /**
   * Clear all errors
   */
  const clearErrors = () => {
    errors.value = {}
  }

  /**
   * Clear a specific field's error
   */
  const clearFieldError = (fieldName: keyof FormData) => {
    const newErrors = { ...errors.value }
    delete newErrors[fieldName]
    errors.value = newErrors
  }

  /**
   * Set a manual error (e.g., from server response)
   */
  const setError = (fieldName: keyof FormData | '_form', message: string) => {
    errors.value = { ...errors.value, [fieldName]: message }
  }

  /**
   * Set multiple errors at once
   */
  const setErrors = (newErrors: FormErrors<FormData>) => {
    errors.value = { ...errors.value, ...newErrors }
  }

  /**
   * Reset form state (errors and touched)
   */
  const reset = () => {
    errors.value = {}
    touched.value = {}
  }

  /**
   * Check if form has any errors
   */
  const hasErrors: ComputedRef<boolean> = computed(() =>
    Object.keys(errors.value).length > 0
  )

  /**
   * Check if form is valid (no errors)
   */
  const isValid: ComputedRef<boolean> = computed(() =>
    Object.keys(errors.value).length === 0
  )

  /**
   * Get error for a specific field (only if touched)
   */
  const getFieldError = (fieldName: keyof FormData): string | undefined => {
    if (touched.value[fieldName]) {
      return errors.value[fieldName]
    }
    return undefined
  }

  /**
   * Get all visible errors (only for touched fields)
   */
  const visibleErrors: ComputedRef<FormErrors<FormData>> = computed(() => {
    const visible: FormErrors<FormData> = {}
    for (const [key, value] of Object.entries(errors.value)) {
      if (touched.value[key as keyof FormData] || key === '_form') {
        visible[key as keyof FormErrors<FormData>] = value
      }
    }
    return visible
  })

  return {
    // State
    errors,
    touched,
    hasErrors,
    isValid,
    visibleErrors,

    // Actions
    validate,
    validateField,
    touchField,
    touchAll,
    clearErrors,
    clearFieldError,
    setError,
    setErrors,
    reset,
    getFieldError,
  }
}

/**
 * Simple validation helper for one-off validations
 * Returns { success, data, errors } without reactive state
 */
export function validateOnce<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data, errors: null }
  }

  return {
    success: false,
    data: null,
    errors: parseZodErrors<T>(result.error),
  }
}

export default useFormValidation
