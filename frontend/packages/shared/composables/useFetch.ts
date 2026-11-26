/**
 * Backend API fetch utility shared by Gym Nexus frontend apps.
 */

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  pagination?: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
}

/** Thrown by apiFetch for a non-2xx response; `message` is the backend's `error` text */
export class ApiError extends Error {
  readonly status: number
  /** Machine-readable `code` of the error body (e.g. NO_VALID_CONTRACT), when the backend sends one */
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function useFetch() {
  const config = useRuntimeConfig()
  const baseUrl = config.public?.apiBaseUrl || 'http://localhost:8056'

  const apiFetch = async <T>(
    endpoint: string,
    options: FetchOptions = {}
  ): Promise<ApiResponse<T>> => {
    const { method = 'GET', body, params } = options

    let url = `${baseUrl}/api${endpoint}`

    if (params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value))
        }
      }

      const queryString = searchParams.toString()
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString
      }
    }

    const fetchOptions: RequestInit = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      // Error bodies are usually JSON ({ error }), but a proxy or an unmatched route may not be
      let json: { error?: string; code?: string } | null = null
      try {
        json = await response.json()
      } catch {
        // not JSON
      }
      throw new ApiError(json?.error || `HTTP ${response.status}`, response.status, json?.code)
    }

    const json = await response.json()

    return json
  }

  const readItems = async <T>(
    collection: string,
    options?: {
      page?: number
      limit?: number
      search?: string
      filter?: Record<string, unknown>
      sort?: string
      sortOrder?: 'asc' | 'desc'
    }
  ): Promise<{ data: T[]; total: number }> => {
    const params: Record<string, string | number | boolean | undefined> = {}

    if (options?.page) params.page = options.page
    if (options?.limit) params.limit = options.limit
    if (options?.search) params.search = options.search
    if (options?.sort) params.sortBy = options.sort
    if (options?.sortOrder) params.sortOrder = options.sortOrder

    if (options?.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        if (value !== undefined && value !== null) {
          params[key] = String(value)
        }
      }
    }

    const response = await apiFetch<T[]>(`/${collection}`, { params })
    return {
      data: response.data || [],
      total: response.pagination?.total || 0
    }
  }

  /**
   * GET one item. Returns null only when the backend answers 404 (or sends no
   * `data`); every other failure is thrown so callers cannot mistake it for "not found".
   */
  const readItem = async <T>(collection: string, id: string): Promise<T | null> => {
    try {
      const response = await apiFetch<T>(`/${collection}/${id}`)
      return response.data ?? null
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  }

  /**
   * POST a new item. Throws on any HTTP/network error (it used to return null,
   * which pages ignored and toasted success). Resolves to `data`, or null when
   * the backend acknowledges without a body.
   */
  const createItem = async <T>(collection: string, data: Partial<T>): Promise<T | null> => {
    const response = await apiFetch<T>(`/${collection}`, {
      method: 'POST',
      body: data
    })
    return response.data ?? null
  }

  /** PATCH an item. Throws on failure; resolves to `data` (null when none is sent back). */
  const updateItem = async <T>(collection: string, id: string, data: Partial<T>): Promise<T | null> => {
    const response = await apiFetch<T>(`/${collection}/${id}`, {
      method: 'PATCH',
      body: data
    })
    return response.data ?? null
  }

  return {
    apiFetch,
    readItems,
    readItem,
    createItem,
    updateItem
  }
}

export type FetchClient = ReturnType<typeof useFetch>

