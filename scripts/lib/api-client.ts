/**
 * Directus API Client for test scripts
 * Cross-platform HTTP client using native fetch (Node.js 18+)
 */

export interface DirectusAuthResponse {
  data: {
    access_token: string
    refresh_token: string
    expires: number
  }
}

export interface DirectusResponse<T> {
  data: T
}

export interface DirectusError {
  errors: Array<{
    message: string
    extensions?: Record<string, unknown>
  }>
}

export class DirectusClient {
  private baseUrl: string
  private accessToken: string | null = null

  constructor(baseUrl: string = 'http://localhost:8055') {
    this.baseUrl = baseUrl
  }

  /**
   * Check server health
   */
  async ping(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/server/ping`)
    return response.text()
  }

  /**
   * Login and store access token
   */
  async login(email: string, password: string): Promise<DirectusAuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json() as DirectusError
      throw new Error(`Login failed: ${error.errors?.[0]?.message || response.statusText}`)
    }

    const data = await response.json() as DirectusAuthResponse
    this.accessToken = data.data.access_token
    return data
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }
    return headers
  }

  /**
   * Get items from a collection
   */
  async getItems<T>(
    collection: string,
    params?: Record<string, string | number>
  ): Promise<DirectusResponse<T[]>> {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value))
      })
    }

    const url = `${this.baseUrl}/items/${collection}${searchParams.toString() ? '?' + searchParams.toString() : ''}`
    const response = await fetch(url, {
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      const error = await response.json() as DirectusError
      throw new Error(`Failed to get ${collection}: ${error.errors?.[0]?.message || response.statusText}`)
    }

    return response.json() as Promise<DirectusResponse<T[]>>
  }

  /**
   * Get single item by ID
   */
  async getItem<T>(
    collection: string,
    id: string,
    fields?: string[]
  ): Promise<DirectusResponse<T>> {
    const searchParams = new URLSearchParams()
    if (fields?.length) {
      searchParams.append('fields', fields.join(','))
    }

    const url = `${this.baseUrl}/items/${collection}/${id}${searchParams.toString() ? '?' + searchParams.toString() : ''}`
    const response = await fetch(url, {
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      const error = await response.json() as DirectusError
      throw new Error(`Failed to get ${collection}/${id}: ${error.errors?.[0]?.message || response.statusText}`)
    }

    return response.json() as Promise<DirectusResponse<T>>
  }

  /**
   * Create item in a collection
   */
  async createItem<T>(
    collection: string,
    data: Record<string, unknown>
  ): Promise<DirectusResponse<T>> {
    const response = await fetch(`${this.baseUrl}/items/${collection}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json() as DirectusError
      throw new Error(`Failed to create ${collection}: ${error.errors?.[0]?.message || response.statusText}`)
    }

    return response.json() as Promise<DirectusResponse<T>>
  }

  /**
   * Update item in a collection
   */
  async updateItem<T>(
    collection: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<DirectusResponse<T>> {
    const response = await fetch(`${this.baseUrl}/items/${collection}/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json() as DirectusError
      throw new Error(`Failed to update ${collection}/${id}: ${error.errors?.[0]?.message || response.statusText}`)
    }

    return response.json() as Promise<DirectusResponse<T>>
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null
  }

  /**
   * Get current access token (truncated for display)
   */
  getTokenPreview(): string {
    if (!this.accessToken) return 'N/A'
    return this.accessToken.substring(0, 20) + '...'
  }
}

// Default client instance
export const directus = new DirectusClient()
