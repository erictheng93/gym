export default defineNuxtRouteMiddleware(async (to) => {
  // 不需要驗證的頁面
  const publicPages = ['/login']
  if (publicPages.includes(to.path)) {
    return
  }

  // Skip auth check on server-side to avoid SSR issues
  // Auth will be checked on client-side hydration
  if (process.server) {
    return
  }

  const { checkAuth } = useMemberAuth()
  const isAuthenticated = await checkAuth()

  if (!isAuthenticated) {
    return navigateTo('/login')
  }
})
