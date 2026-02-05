import { loadSession } from '~/utils/session-storage'

export default defineNuxtRouteMiddleware(async (to) => {
  // 跳過登入頁面
  if (to.path === '/login') return

  const { user, currentEmployee, checkAuth } = useAuth()

  // 方案 B: 先同步檢查 localStorage，信任快取立即渲染
  // 這樣可以避免 hard refresh 時的登入頁閃爍
  if (import.meta.client) {
    // Client-side: 先檢查 localStorage
    if (!user.value) {
      const cached = loadSession()
      if (cached?.user) {
        // 同步 hydrate state，立即渲染頁面
        user.value = cached.user
        if (cached.employee) {
          currentEmployee.value = cached.employee
        }

        // 背景驗證 session 是否仍有效
        // 如果無效，則重導向到登入頁
        checkAuth().then((valid) => {
          if (!valid) {
            navigateTo('/login')
          }
        })

        // 允許立即導航，不等待驗證
        return
      }
    } else {
      // 已經有 user state（可能是從其他頁面導航過來），直接允許
      return
    }

    // Client-side 沒有快取 session，執行完整驗證
    const isAuthenticated = await checkAuth()
    if (!isAuthenticated) {
      return navigateTo('/login')
    }
  } else {
    // Server-side: 在 SSR 時跳過驗證，讓 client-side 處理
    // 這避免了 SSR 沒有 cookie/localStorage 導致的問題
    // Client 會在 hydration 後立即執行驗證
    return
  }
})
