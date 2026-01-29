/**
 * Measurement validation schemas
 * Used for body measurement operations
 */

import { z } from 'zod'

// Measurement source options
export const MEASUREMENT_SOURCES = {
  MANUAL: '手動輸入',
  INBODY: 'InBody',
  APPLE_HEALTH: 'Apple Health',
} as const

export type MeasurementSource = keyof typeof MEASUREMENT_SOURCES

// Constraints
const WEIGHT_MIN = 20
const WEIGHT_MAX = 300
const BODY_FAT_MIN = 1
const BODY_FAT_MAX = 60
const MUSCLE_MASS_MIN = 10
const MUSCLE_MASS_MAX = 150
const BMI_MIN = 10
const BMI_MAX = 50

/**
 * Create measurement schema
 */
export const createMeasurementSchema = z.object({
  date: z
    .string()
    .optional(),
  weight: z
    .number()
    .min(WEIGHT_MIN, `體重至少 ${WEIGHT_MIN} kg`)
    .max(WEIGHT_MAX, `體重不能超過 ${WEIGHT_MAX} kg`)
    .optional()
    .nullable(),
  body_fat: z
    .number()
    .min(BODY_FAT_MIN, `體脂率至少 ${BODY_FAT_MIN}%`)
    .max(BODY_FAT_MAX, `體脂率不能超過 ${BODY_FAT_MAX}%`)
    .optional()
    .nullable(),
  muscle_mass: z
    .number()
    .min(MUSCLE_MASS_MIN, `肌肉量至少 ${MUSCLE_MASS_MIN} kg`)
    .max(MUSCLE_MASS_MAX, `肌肉量不能超過 ${MUSCLE_MASS_MAX} kg`)
    .optional()
    .nullable(),
  bmi: z
    .number()
    .min(BMI_MIN, `BMI 至少 ${BMI_MIN}`)
    .max(BMI_MAX, `BMI 不能超過 ${BMI_MAX}`)
    .optional()
    .nullable(),
  source: z
    .enum(['MANUAL', 'INBODY', 'APPLE_HEALTH'])
    .optional()
    .default('MANUAL'),
  raw_data: z
    .record(z.unknown())
    .optional(),
}).refine(
  data => data.weight || data.body_fat || data.muscle_mass || data.bmi,
  { message: '請至少輸入一項數據' }
)

export type CreateMeasurementFormData = z.infer<typeof createMeasurementSchema>

/**
 * Measurement filter schema
 */
export const measurementFilterSchema = z.object({
  start_date: z
    .string()
    .optional(),
  end_date: z
    .string()
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
  offset: z
    .number()
    .int()
    .min(0)
    .optional(),
})

export type MeasurementFilterData = z.infer<typeof measurementFilterSchema>

/**
 * Stats period options
 */
export const STATS_PERIODS = {
  '7': '7 天',
  '30': '30 天',
  '90': '90 天',
  '180': '180 天',
  '365': '一年',
} as const
