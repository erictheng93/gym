<script lang="ts">
const analyticsNumberFormatter = new Intl.NumberFormat('zh-TW')
</script>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'default',
  middleware: ['auth']
})

// Check if user has admin/manager role
const { user } = useAuth()
const hasAccess = computed(() => {
  const role = user.value?.role
  return role === 'admin' || role === 'manager'
})

const {
  tenantQuota,
  fetchTenantInfo,
  fetchTenantQuota,
  getQuotaUsagePercent,
  isQuotaNearLimit
} = useTenant()

const isLoading = ref(true)

// 載入所有數據
onMounted(async () => {
  isLoading.value = true
  try {
    await Promise.all([
      fetchTenantInfo(),
      fetchTenantQuota()
    ])
  } catch (error) {
    console.error('[Analytics] Error loading data:', error)
  } finally {
    isLoading.value = false
  }
})

// 格式化數字
const formatNumber = (num: number) => {
  return analyticsNumberFormatter.format(num)
}
</script>
<template>
  <div class="analytics-page">
    <!-- Access Denied -->
    <div v-if="!hasAccess" class="access-denied">
      <div class="access-denied-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="m4.93 4.93 14.14 14.14" />
        </svg>
      </div>
      <h2>權限不足</h2>
      <p>此頁面僅限管理員和店長訪問</p>
      <NuxtLink to="/" class="btn btn-primary">返回首頁</NuxtLink>
    </div>

    <!-- Page Content -->
    <div v-else>
      <!-- 頁面標題 -->
      <div class="page-header">
        <h1>系統分析</h1>
        <p class="page-subtitle">配額使用情況與 API 使用統計</p>
      </div>

      <!-- 載入狀態 -->
      <div v-if="isLoading" class="loading-container">
        <div class="spinner" />
        <p>載入分析數據中...</p>
      </div>

      <!-- 主要內容 -->
      <div v-else class="analytics-content">
        <!-- 第一行：租戶配額卡片 -->
        <div class="quota-section">
          <h2 class="section-title">配額使用情況</h2>
          <TenantQuotaCard />
        </div>

        <!-- 第二行：API 使用統計 (no backend endpoint yet; never show placeholder zeros as data) -->
        <div class="api-stats-section">
          <div class="section-header">
            <h2 class="section-title">API 使用統計</h2>
          </div>
          <div class="not-available">
            <span class="not-available-badge">尚未開放</span>
            <p>API 請求量、速率限制與回應時間統計尚未提供</p>
          </div>
        </div>

        <!-- 第三行：配額警告區域 -->
        <div v-if="tenantQuota" class="warnings-section">
          <h2 class="section-title">配額警告</h2>
          <div class="warnings-list">
            <!-- 會員配額警告 -->
            <div v-if="isQuotaNearLimit('members')" class="warning-card">
              <div class="warning-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div class="warning-content">
                <h4>會員數即將達到上限</h4>
                <p>
                  目前使用 {{ getQuotaUsagePercent('members') }}%
                  ({{ formatNumber(tenantQuota.members.current) }} / {{ formatNumber(tenantQuota.members.limit) }})
                </p>
                <button class="upgrade-button">升級方案</button>
              </div>
            </div>

            <!-- 員工配額警告 -->
            <div v-if="isQuotaNearLimit('employees')" class="warning-card">
              <div class="warning-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div class="warning-content">
                <h4>員工數即將達到上限</h4>
                <p>
                  目前使用 {{ getQuotaUsagePercent('employees') }}%
                  ({{ formatNumber(tenantQuota.employees.current) }} / {{ formatNumber(tenantQuota.employees.limit) }})
                </p>
                <button class="upgrade-button">升級方案</button>
              </div>
            </div>

            <!-- 分店配額警告 -->
            <div v-if="isQuotaNearLimit('branches')" class="warning-card">
              <div class="warning-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div class="warning-content">
                <h4>分店數即將達到上限</h4>
                <p>
                  目前使用 {{ getQuotaUsagePercent('branches') }}%
                  ({{ formatNumber(tenantQuota.branches.current) }} / {{ formatNumber(tenantQuota.branches.limit) }})
                </p>
                <button class="upgrade-button">升級方案</button>
              </div>
            </div>

            <!-- 存儲配額警告 -->
            <div v-if="isQuotaNearLimit('storage')" class="warning-card">
              <div class="warning-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div class="warning-content">
                <h4>存儲空間即將用完</h4>
                <p>
                  目前使用 {{ getQuotaUsagePercent('storage') }}%
                  ({{ tenantQuota.storage.current.toFixed(2) }} / {{ tenantQuota.storage.limit }} MB)
                </p>
                <button class="upgrade-button">升級方案</button>
              </div>
            </div>

            <!-- 無警告 -->
            <div v-if="!isQuotaNearLimit('members') && !isQuotaNearLimit('employees') && !isQuotaNearLimit('branches') && !isQuotaNearLimit('storage')" class="no-warnings">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p>目前沒有配額警告，一切正常</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Access Denied */
.access-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: var(--space-lg);
  text-align: center;
}

.access-denied-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
  display: flex;
  align-items: center;
  justify-content: center;
}

.access-denied h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.access-denied p {
  margin: 0;
  font-size: 15px;
  color: var(--color-text-secondary);
}


.analytics-page {
  padding: var(--space-xl);
  max-width: 1400px;
  margin: 0 auto;
}

/* 頁面標題 */
.page-header {
  margin-bottom: var(--space-xl);
}

.page-header h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.page-subtitle {
  margin: var(--space-xs) 0 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* 載入狀態 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-4xl);
  gap: var(--space-md);
  color: var(--color-text-tertiary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-bg-tertiary);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 主要內容 */
.analytics-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

/* 區塊標題 */
.section-title {
  margin: 0 0 var(--space-md);
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.subsection-title {
  margin: 0 0 var(--space-md);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* API 統計區塊 */
.api-stats-section {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

/* Not available yet (no backend endpoint) */
.not-available {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-height: 160px;
  text-align: center;
}

.not-available-badge {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.not-available p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* 配額警告區塊 */
.warnings-section {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.warnings-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.warning-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: rgba(255, 149, 0, 0.05);
  border: 1px solid rgba(255, 149, 0, 0.2);
  border-radius: var(--radius-md);
}

.warning-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 149, 0, 0.1);
  border-radius: var(--radius-md);
  color: #ff9500;
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
}

.warning-content h4 {
  margin: 0 0 var(--space-xs);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.warning-content p {
  margin: 0 0 var(--space-md);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.upgrade-button {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(135deg, #ff9500, #ffcc00);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform 0.2s var(--ease-out);
}

.upgrade-button:hover {
  transform: translateY(-1px);
}

/* 無警告狀態 */
.no-warnings {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  gap: var(--space-md);
  color: #34c759;
}

.no-warnings p {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
</style>
