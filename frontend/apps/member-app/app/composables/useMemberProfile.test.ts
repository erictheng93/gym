/**
 * Tests for useMemberProfile composable (GET/PUT /api/member/me)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const stateStore = new Map<string, { value: unknown }>()
const mockGetAuthHeader = vi.fn(() => ({ 'X-Member-Token': 'test-token' }))

vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiBaseUrl: 'http://localhost:8056' } }))
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) stateStore.set(key, { value: init ? init() : undefined })
  return stateStore.get(key)!
})
vi.stubGlobal('useMemberAuth', () => ({ getAuthHeader: mockGetAuthHeader }))
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

import { useMemberProfile, toProfileUpdateBody } from './useMemberProfile'

// Shape of GET /api/member/me (backend/src/routes/member-profile.ts)
const meResponse = {
  success: true,
  data: {
    member: {
      id: 'member-1',
      memberCode: 'MEM001',
      fullName: '趙小明',
      phone: '0911-111-111',
      email: 'member1@example.com',
      gender: 'MALE',
      birthday: '1990-05-01',
      address: null,
      emergencyContact: '趙媽媽',
      emergencyPhone: null,
      status: 'ACTIVE',
      joinDate: '2024-03-01',
      avatar: null,
      height: null,
      hasPassword: true,
      socialAccounts: [],
    },
    branch: { id: 'branch-1', name: '台北總店', address: null, phone: null },
    contracts: [],
  },
}

describe('useMemberProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
  })

  it('loads GET /api/member/me (not /api/member/profile) with X-Member-Token and maps it', async () => {
    mockFetch.mockResolvedValueOnce(meResponse)
    const { fetchProfile, profile, isLoading } = useMemberProfile()

    await fetchProfile()

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8056/api/member/me', {
      headers: { 'X-Member-Token': 'test-token' },
    })
    expect(profile.value).toEqual({
      id: 'member-1',
      member_code: 'MEM001',
      full_name: '趙小明',
      phone: '0911-111-111',
      email: 'member1@example.com',
      gender: 'MALE',
      birthday: '1990-05-01',
      emergency_contact: '趙媽媽',
      emergency_phone: null,
      member_status: 'ACTIVE',
      join_date: '2024-03-01',
      avatar: null,
      branch: { id: 'branch-1', name: '台北總店' },
    })
    expect(isLoading.value).toBe(false)
  })

  it('propagates errors and clears loading', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const p = useMemberProfile()
    await expect(p.fetchProfile()).rejects.toThrow('boom')
    expect(p.isLoading.value).toBe(false)
  })

  it('saves with PUT /api/member/me and the backend camelCase field names', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, data: { member: {} } })

    await useMemberProfile().updateProfile({ full_name: '趙大明', emergency_phone: '0912345678' })

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8056/api/member/me', {
      method: 'PUT',
      headers: { 'X-Member-Token': 'test-token' },
      body: { fullName: '趙大明', emergencyPhone: '0912345678' },
    })
  })

  it('does not call the API when nothing changed', async () => {
    await useMemberProfile().updateProfile({})
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('maps every editable field and skips undefined ones', () => {
    expect(toProfileUpdateBody({
      full_name: 'a',
      phone: '0911111111',
      email: 'x@y.z',
      emergency_contact: 'b',
      emergency_phone: undefined,
    })).toEqual({ fullName: 'a', phone: '0911111111', email: 'x@y.z', emergencyContact: 'b' })
  })
})
