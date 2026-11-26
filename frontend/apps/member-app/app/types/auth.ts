/**
 * Auth Types - Centralized authentication type definitions
 *
 * These types are used across auth composables:
 * - useMemberAuth (facade)
 * - useAuthSession
 * - useAuthMethods
 * - useAuthTokens
 */

import type { Member } from '@gym-nexus/shared/types'

/** Active contract summary, mapped from GET /api/member/me `contracts[]`. */
export interface ActiveContractSummary {
  id: string
  contract_no: string
  contract_status: 'ACTIVE' | 'PAUSED'
  start_date: string
  end_date: string | null
  remaining_counts: number | null
  plan: { name: string | null; plan_type: 'TIME_BASED' | 'COUNT_BASED' | null } | null
}

export interface CurrentMember {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  email: string | null
  branch_id: string | null
  branch_name: string | null
  member_status: Member['member_status']
  activeContract: ActiveContractSummary | null
}

export interface AuthResult {
  success: boolean
  message: string
}

export interface OtpSendResult extends AuthResult {
  otp?: string // Only in development
}

/** Body of POST /api/member/me/complete-profile. */
export interface CompleteProfileInput {
  phone: string
  otpCode: string
  fullName?: string
  gender?: 'MALE' | 'FEMALE' | 'OTHER'
  birthday?: string
  emergencyContact?: string
  emergencyPhone?: string
}

/** Result of the phone-verification / complete-profile calls. */
export interface ProfileApiResult extends AuthResult {
  /** Backend error code, e.g. PHONE_TAKEN, WRONG_CODE, INVALID_OTP, MAX_ATTEMPTS */
  code?: string
  attemptsRemaining?: number
  otp?: string // Only in development
}

export interface OAuthResult {
  success: boolean
  error?: string
  needsRegistration?: boolean
}

export interface TokenState {
  accessToken: string | null
  refreshToken: string | null
}
