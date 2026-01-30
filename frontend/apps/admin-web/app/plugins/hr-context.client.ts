/**
 * HR Context Plugin
 * 提供 HR 模組的依賴注入上下文
 *
 * 這個 plugin 負責設置 HR adapters，讓 hr-composables 包可以使用
 */

import { HR_CONTEXT_KEY, type IHRContext } from '@gym-nexus/hr-composables'
import { createHRAdapters, type AuthData } from '@gym-nexus/hr-directus-adapter'

export default defineNuxtPlugin({
  name: 'hr-context',
  async setup(nuxtApp) {
    const { $directus } = nuxtApp

    // 只在有 directus 實例時設置
    if (!$directus) {
      console.warn('[HR Context] Directus instance not available')
      return
    }

    // 提供 Vue 應用級別的上下文
    nuxtApp.hook('app:created', (vueApp) => {
      // 創建 authData getter - 在首次訪問時獲取用戶數據
      const getAuthData = (): AuthData => {
        try {
          // 使用 Nuxt 的 auth store
          const authStore = (nuxtApp as any).$authStore || null
          const user = authStore?.user

          return {
            userId: user?.id || null,
            employeeId: user?.employee?.id || null,
            branchId: user?.employee?.branch_id || null,
            branchType: user?.employee?.branch?.branch_type || null,
            accessibleBranchIds: user?.employee?.branch_id ? [user.employee.branch_id] : []
          }
        } catch {
          // Auth store 可能還未初始化
          return {
            userId: null,
            employeeId: null,
            branchId: null,
            branchType: null,
            accessibleBranchIds: []
          }
        }
      }

      const authData = getAuthData()
      const adapters = createHRAdapters($directus as any, authData)

      const hrContext: IHRContext = {
        attendanceAdapter: adapters.attendance,
        leaveAdapter: adapters.leave,
        shiftAdapter: adapters.shift,
        makeupAdapter: adapters.makeup,
        tenantContext: adapters.tenant
      }

      vueApp.provide(HR_CONTEXT_KEY, hrContext)
    })
  }
})
