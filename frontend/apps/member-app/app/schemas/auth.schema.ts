/**
 * Authentication validation schemas
 * Used for login, OTP verification, and password management
 */

import { z } from 'zod'

// Phone number regex for Taiwan mobile numbers (09xxxxxxxx)
const PHONE_REGEX = /^09\d{8}$/

// Password requirements
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d).+$/

/**
 * Email/Password login schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, '請輸入電子郵件')
    .email('請輸入有效的電子郵件格式'),
  password: z
    .string()
    .min(1, '請輸入密碼'),
})

export type LoginFormData = z.infer<typeof loginSchema>

/**
 * OTP request schema (send OTP to phone)
 */
export const otpRequestSchema = z.object({
  phone: z
    .string()
    .min(1, '請輸入手機號碼')
    .regex(PHONE_REGEX, '請輸入有效的手機號碼（09開頭，共10碼）'),
})

export type OtpRequestFormData = z.infer<typeof otpRequestSchema>

/**
 * OTP verification schema
 */
export const otpVerifySchema = z.object({
  phone: z
    .string()
    .min(1, '請輸入手機號碼')
    .regex(PHONE_REGEX, '請輸入有效的手機號碼'),
  code: z
    .string()
    .length(6, '驗證碼為 6 位數字')
    .regex(/^\d{6}$/, '驗證碼僅能包含數字'),
})

export type OtpVerifyFormData = z.infer<typeof otpVerifySchema>

/**
 * Forgot password schema
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, '請輸入電子郵件')
    .email('請輸入有效的電子郵件格式'),
})

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

/**
 * Reset password schema (with token)
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, '重設連結無效'),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元`)
    .regex(PASSWORD_REGEX, '密碼必須包含英文字母和數字'),
  confirmPassword: z
    .string()
    .min(1, '請確認密碼'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: '確認密碼不符',
  path: ['confirmPassword'],
})

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

/**
 * Change password schema (for logged-in users)
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, '請輸入目前密碼'),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `新密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元`)
    .regex(PASSWORD_REGEX, '新密碼必須包含英文字母和數字'),
  confirmPassword: z
    .string()
    .min(1, '請確認新密碼'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: '確認密碼不符',
  path: ['confirmPassword'],
}).refine(data => data.currentPassword !== data.newPassword, {
  message: '新密碼不能與目前密碼相同',
  path: ['newPassword'],
})

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>
