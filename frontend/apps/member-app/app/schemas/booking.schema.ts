/**
 * Booking validation schemas
 * Used for class booking operations
 */

import { z } from 'zod'

/**
 * Book session schema
 */
export const bookSessionSchema = z.object({
  session_id: z
    .string()
    .uuid('無效的課程場次'),
  contract_id: z
    .string()
    .uuid('無效的合約')
    .optional(),
})

export type BookSessionFormData = z.infer<typeof bookSessionSchema>

/**
 * Cancel booking schema
 */
export const cancelBookingSchema = z.object({
  booking_id: z
    .string()
    .uuid('無效的預約'),
  reason: z
    .string()
    .max(500, '取消原因不能超過 500 字')
    .optional(),
})

export type CancelBookingFormData = z.infer<typeof cancelBookingSchema>

/**
 * Booking filter schema (for querying bookings)
 */
export const bookingFilterSchema = z.object({
  status: z
    .enum(['CONFIRMED', 'WAITLISTED', 'CANCELLED', 'NO_SHOW', 'ATTENDED'])
    .optional(),
  upcoming: z
    .boolean()
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

export type BookingFilterData = z.infer<typeof bookingFilterSchema>

/**
 * Booking status enum for type safety
 */
export const BookingStatus = {
  CONFIRMED: 'CONFIRMED',
  WAITLISTED: 'WAITLISTED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  ATTENDED: 'ATTENDED',
} as const

export type BookingStatusType = typeof BookingStatus[keyof typeof BookingStatus]
