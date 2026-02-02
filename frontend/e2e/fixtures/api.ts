import { APIRequestContext } from '@playwright/test'
import { TestEnv } from '../config/test-env'

const API_BASE_URL = TestEnv.apiBaseUrl

export interface AuthResponse {
  data: {
    access_token: string
    refresh_token: string
    expires: number
  }
}

export async function getAuthToken(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/auth/login`, {
    data: {
      email,
      password,
    },
  })

  if (!response.ok()) {
    throw new Error(`Authentication failed: ${response.status()}`)
  }

  const data: AuthResponse = await response.json()
  return data.data.access_token
}

export async function createTestMember(
  request: APIRequestContext,
  token: string,
  data: {
    name: string
    phone: string
    email?: string
    branch_id: string
  }
) {
  const response = await request.post(`${API_BASE_URL}/items/members`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data,
  })

  if (!response.ok()) {
    throw new Error(`Failed to create member: ${response.status()}`)
  }

  return await response.json()
}

export async function createTestContract(
  request: APIRequestContext,
  token: string,
  data: {
    member_id: string
    membership_plan_id: string
    start_date: string
    amount: number
    sales_person_id?: string
  }
) {
  const response = await request.post(`${API_BASE_URL}/items/contracts`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data,
  })

  if (!response.ok()) {
    throw new Error(`Failed to create contract: ${response.status()}`)
  }

  return await response.json()
}

export async function cleanupTestData(
  request: APIRequestContext,
  token: string,
  collection: string,
  ids: string[]
) {
  for (const id of ids) {
    await request.delete(`${API_BASE_URL}/items/${collection}/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  }
}
