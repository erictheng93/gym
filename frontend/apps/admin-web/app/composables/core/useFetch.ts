/**
 * Backend-v2 API Fetch Utility
 */

interface ApiResponse<T> {
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

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
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

    // Add query params
    if (params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value))
        }
      }
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
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
    const json = await response.json()

    if (!response.ok) {
      throw new Error(json.error || `HTTP ${response.status}`)
    }

    return json
  }

  // Collection operations
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

    // Add filter params
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

  const readItem = async <T>(collection: string, id: string): Promise<T | null> => {
    try {
      const response = await apiFetch<T>(`/${collection}/${id}`)
      return response.data || null
    } catch {
      return null
    }
  }

  const createItem = async <T>(collection: string, data: Partial<T>): Promise<T | null> => {
    try {
      const response = await apiFetch<T>(`/${collection}`, {
        method: 'POST',
        body: data
      })
      return response.data || null
    } catch {
      return null
    }
  }

  const updateItem = async <T>(collection: string, id: string, data: Partial<T>): Promise<T | null> => {
    try {
      const response = await apiFetch<T>(`/${collection}/${id}`, {
        method: 'PATCH',
        body: data
      })
      return response.data || null
    } catch {
      return null
    }
  }

  const deleteItem = async (collection: string, id: string): Promise<boolean> => {
    try {
      await apiFetch(`/${collection}/${id}`, { method: 'DELETE' })
      return true
    } catch {
      return false
    }
  }

  return {
    apiFetch,
    readItems,
    readItem,
    createItem,
    updateItem,
    deleteItem
  }
}

export type FetchClient = ReturnType<typeof useFetch>
