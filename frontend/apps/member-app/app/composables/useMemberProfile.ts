/**
 * useMemberProfile composable
 * Full profile of the logged-in member: GET /api/member/me, PUT /api/member/me.
 * (There is no /api/member/profile route; the backend profile routes live at /me.)
 */

import type { MemberMeResponse } from './useAuthSession'

export interface MemberProfile {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  email: string | null
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null
  birthday: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  member_status: string
  join_date: string | null
  avatar: string | null
  branch: { id: string; name: string } | null
}

/**
 * Editable fields, in the form's snake_case. No phone: a phone change needs an
 * SMS code (useMemberAuth().sendPhoneVerification + changePhone); PUT refuses it.
 */
export interface MemberProfileUpdate {
  full_name?: string
  email?: string
  emergency_contact?: string
  emergency_phone?: string
}

const UPDATE_FIELD_MAP: Record<keyof MemberProfileUpdate, string> = {
  full_name: 'fullName',
  email: 'email',
  emergency_contact: 'emergencyContact',
  emergency_phone: 'emergencyPhone',
}

export function toMemberProfile(data: MemberMeResponse['data']): MemberProfile {
  const m = data.member
  return {
    id: m.id,
    member_code: m.memberCode,
    full_name: m.fullName,
    phone: m.phone,
    email: m.email,
    gender: m.gender,
    birthday: m.birthday,
    emergency_contact: m.emergencyContact,
    emergency_phone: m.emergencyPhone,
    member_status: m.status,
    join_date: m.joinDate,
    avatar: m.avatar,
    branch: data.branch ? { id: data.branch.id, name: data.branch.name } : null,
  }
}

/** PUT body (camelCase, backend whitelist) with only the given fields. */
export function toProfileUpdateBody(updates: MemberProfileUpdate): Record<string, string> {
  const body: Record<string, string> = {}
  for (const [key, value] of Object.entries(updates) as [keyof MemberProfileUpdate, string | undefined][]) {
    if (value !== undefined) body[UPDATE_FIELD_MAP[key]] = value
  }
  return body
}

export const useMemberProfile = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useMemberAuth()

  const profile = useState<MemberProfile | null>('member_profile', () => null)
  const isLoading = useState('member_profile_loading', () => false)

  /** Load the profile. Throws on network/API errors. */
  const fetchProfile = async (): Promise<MemberProfile | null> => {
    isLoading.value = true
    try {
      const response = await $fetch<MemberMeResponse>(`${apiUrl}/api/member/me`, {
        headers: getAuthHeader(),
      })
      profile.value = response.success && response.data?.member ? toMemberProfile(response.data) : null
      return profile.value
    } finally {
      isLoading.value = false
    }
  }

  /** Save the given fields. Throws on network/API errors (e.g. 400 EMAIL_TAKEN). */
  const updateProfile = async (updates: MemberProfileUpdate) => {
    const body = toProfileUpdateBody(updates)
    if (Object.keys(body).length === 0) return
    await $fetch(`${apiUrl}/api/member/me`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body,
    })
  }

  return { profile, isLoading, fetchProfile, updateProfile }
}
