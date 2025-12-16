import { readMe } from '@directus/sdk'

interface User {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: string | null
}

export const useAuth = () => {
  const directus = useDirectus()
  const user = useState<User | null>('auth_user', () => null)
  const isAuthenticated = computed(() => !!user.value)
  const isLoading = useState('auth_loading', () => false)

  const login = async (email: string, password: string) => {
    isLoading.value = true
    try {
      // Use client.login() with an object containing email and password
      await directus.login({ email, password })
      await fetchUser()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '登入失敗'
      return { success: false, error: message }
    } finally {
      isLoading.value = false
    }
  }

  const logout = async () => {
    try {
      await directus.logout()
    } catch {
      // Ignore logout errors
    } finally {
      user.value = null
      await navigateTo('/login')
    }
  }

  const fetchUser = async () => {
    try {
      const me = await directus.request(readMe({
        fields: ['id', 'email', 'first_name', 'last_name', 'role']
      }))
      user.value = me as User
    } catch {
      user.value = null
    }
  }

  const checkAuth = async () => {
    if (!user.value) {
      await fetchUser()
    }
    return isAuthenticated.value
  }

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    fetchUser,
    checkAuth
  }
}
