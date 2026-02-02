/**
 * API Client for backend-v2
 */

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
}

interface ApiClientOptions {
  baseUrl?: string;
}

interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
    employeeId: string | null;
    tenantId: string | null;
  };
}

interface UserInfo {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
  tenantId: string | null;
  isActive: boolean;
}

export const useApi = (options: ApiClientOptions = {}) => {
  const config = useRuntimeConfig();
  const baseUrl = options.baseUrl || config.public?.apiBaseUrl || 'http://localhost:8056';

  // Common fetch options
  const getFetchOptions = (): RequestInit => ({
    credentials: 'include', // Include cookies for session
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Generic request method
  const request = async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    const url = `${baseUrl}${endpoint}`;
    const fetchOptions = {
      ...getFetchOptions(),
      ...options,
      headers: {
        ...getFetchOptions().headers,
        ...(options.headers || {}),
      },
    };

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  };

  // Auth methods
  const auth = {
    login: async (email: string, password: string): Promise<LoginResponse> => {
      const response = await request<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Login failed');
      }

      return response.data;
    },

    logout: async (): Promise<void> => {
      await request('/api/auth/logout', { method: 'POST' });
    },

    refresh: async (): Promise<void> => {
      await request('/api/auth/refresh', { method: 'POST' });
    },

    me: async (): Promise<UserInfo> => {
      const response = await request<UserInfo>('/api/auth/me');

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get user info');
      }

      return response.data;
    },

    changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
      const response = await request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to change password');
      }
    },
  };

  // Generic CRUD methods
  const items = {
    read: async <T>(collection: string, params?: Record<string, unknown>): Promise<T[]> => {
      const queryString = params ? '?' + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString() : '';

      const response = await request<T[]>(`/api/${collection}${queryString}`);
      return response.data || [];
    },

    readOne: async <T>(collection: string, id: string): Promise<T> => {
      const response = await request<T>(`/api/${collection}/${id}`);
      if (!response.data) {
        throw new Error(`Item not found: ${collection}/${id}`);
      }
      return response.data;
    },

    create: async <T>(collection: string, data: Partial<T>): Promise<T> => {
      const response = await request<T>(`/api/${collection}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.data) {
        throw new Error(response.error || 'Failed to create item');
      }
      return response.data;
    },

    update: async <T>(collection: string, id: string, data: Partial<T>): Promise<T> => {
      const response = await request<T>(`/api/${collection}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!response.data) {
        throw new Error(response.error || 'Failed to update item');
      }
      return response.data;
    },

    delete: async (collection: string, id: string): Promise<void> => {
      await request(`/api/${collection}/${id}`, { method: 'DELETE' });
    },
  };

  return {
    request,
    auth,
    items,
    baseUrl,
  };
};

export type ApiClient = ReturnType<typeof useApi>;
