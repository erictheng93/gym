export default defineNuxtRouteMiddleware(async (to) => {
  // 不需要驗證的頁面
  const publicPages = ['/login']
  if (publicPages.includes(to.path)) {
    return
  }

  const { checkAuth } = useMemberAuth()
  const isAuthenticated = await checkAuth()

  if (!isAuthenticated) {
    return navigateTo('/login')
  }
})
