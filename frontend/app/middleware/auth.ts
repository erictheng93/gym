export default defineNuxtRouteMiddleware(async (to) => {
  // 跳過登入頁面
  if (to.path === '/login') return

  const { checkAuth } = useAuth()
  const isAuthenticated = await checkAuth()

  if (!isAuthenticated) {
    return navigateTo('/login')
  }
})
