/**
 * Auth Types - Centralized authentication type definitions
 *
 * These types are used across auth composables:
 * - useMemberAuth (facade)
 * - useAuthSession
 * - useAuthMethods
 * - useAuthTokens
 */

import type { Member, Contract } from '@gym-nexus/shared/types'

export interface CurrentMember {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  email: string | null
  branch_id: string | null
  branch_name: string | null
  member_status: Member['member_status']
  activeContract: Contract | null
}

export interface AuthResult {
  success: boolean
  message: string
}

export interface OtpSendResult extends AuthResult {
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
