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

  console.log('[Middleware] Running auth check on client...')
  const { checkAuth, accessToken } = useMemberAuth()
  console.log('[Middleware] Access token value:', accessToken.value ? 'exists' : 'null')
  const isAuthenticated = await checkAuth()
  console.log('[Middleware] isAuthenticated:', isAuthenticated)

  if (!isAuthenticated) {
    console.log('[Middleware] Redirecting to login...')
    return navigateTo('/login')
  }
  console.log('[Middleware] Auth passed, continuing...')
})
