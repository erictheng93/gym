<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'default',
  middleware: ['auth']
})

// Check if user has admin/manager role
const { user, apiCall } = useAuth()
const hasAccess = computed(() => {
  const role = user.value?.role?.name
  return role === 'Administrator' || role === 'Manager'
})

const {
  tenantInfo,
  tenantQuota,
  fetchTenantInfo,
  fetchTenantQuota,
  getQuotaUsagePercent,
  isQuotaNearLimit
} = useTenant()

// API 使用統計
const apiStats = ref({
  totalRequests: 0,
  rateLimitHits: 0,
  avgResponseTime: 0,
  topEndpoints: [] as Array<{ path: string; count: number }>
})

const isLoading = ref(true)
const statsTimeRange = ref<'24h' | '7d' | '30d'>('24h')

// 載入所有數據
onMounted(async () => {
  isLoading.value = true
  try {
    await fetchTenantInfo()
    await fetchTenantQuota()
    await fetchApiStats()
  } catch (error) {
    console.error('[Analytics] Error loading data:', error)
  } finally {
    isLoading.value = false
  }
})

// 獲取 API 使用統計
const fetchApiStats = async () => {
  try {
    const response = await apiCall(`/gym/analytics/api-stats?timeRange=${statsTimeRange.value}`)
    if (response.success && response.data) {
      apiStats.value = {
        totalRequests: response.data.totalRequests || 0,
        rateLimitHits: response.data.rateLimitHits || 0,
        avgResponseTime: response.data.avgResponseTime || 0,
        topEndpoints: (response.data.topEndpoints || []).map((ep: any) => ({
          path: `${ep.method} ${ep.path}`,
          count: ep.count
        }))
      }
    }
  } catch (error) {
    console.error('[Analytics] Failed to fetch API stats:', error)
    // 使用模擬數據作為後備
    apiStats.value = {
      totalRequests: 0,
      rateLimitHits: 0,
      avgResponseTime: 0,
      topEndpoints: []
    }
  }
}

// 切換時間範圍
const changeTimeRange = async (range: '24h' | '7d' | '30d') => {
  statsTimeRange.value = range
  await fetchApiStats()
}

// 計算速率限制命中率
const rateLimitHitRate = computed(() => {
  if (apiStats.value.totalRequests === 0) return 0
  return ((apiStats.value.rateLimitHits / apiStats.value.totalRequests) * 100).toFixed(2)
})

// 格式化數字
const formatNumber = (num: number) => {
  return new Intl.NumberFormat('zh-TW').format(num)
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

      <!-- 第二行：API 使用統計 -->
      <div class="api-stats-section">
        <div class="section-header">
          <h2 class="section-title">API 使用統計</h2>
          <div class="time-range-selector">
            <button
              :class="{ active: statsTimeRange === '24h' }"
              @click="changeTimeRange('24h')"
            >
              24 小時
            </button>
            <button
              :class="{ active: statsTimeRange === '7d' }"
              @click="changeTimeRange('7d')"
            >
              7 天
            </button>
            <button
              :class="{ active: statsTimeRange === '30d' }"
              @click="changeTimeRange('30d')"
            >
              30 天
            </button>
          </div>
        </div>

        <!-- 統計卡片 -->
        <div class="stats-grid">
          <!-- 總請求數 -->
          <div class="stat-card">
            <div class="stat-icon requests">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div class="stat-content">
              <p class="stat-label">總請求數</p>
              <p class="stat-value">{{ formatNumber(apiStats.totalRequests) }}</p>
            </div>
          </div>

          <!-- 速率限制命中次數 -->
          <div class="stat-card">
            <div class="stat-icon rate-limit">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <div class="stat-content">
              <p class="stat-label">速率限制觸發</p>
              <p class="stat-value">{{ formatNumber(apiStats.rateLimitHits) }}</p>
              <p class="stat-meta">{{ rateLimitHitRate }}%</p>
            </div>
          </div>

          <!-- 平均響應時間 -->
          <div class="stat-card">
            <div class="stat-icon response-time">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div class="stat-content">
              <p class="stat-label">平均響應時間</p>
              <p class="stat-value">{{ apiStats.avgResponseTime }} <span class="unit">ms</span></p>
            </div>
          </div>
        </div>

        <!-- 熱門端點 -->
        <div class="top-endpoints">
          <h3 class="subsection-title">熱門 API 端點</h3>
          <div class="endpoint-list">
            <div
              v-for="(endpoint, index) in apiStats.topEndpoints"
              :key="endpoint.path"
              class="endpoint-item"
            >
              <div class="endpoint-rank">{{ index + 1 }}</div>
              <div class="endpoint-path">{{ endpoint.path }}</div>
              <div class="endpoint-count">{{ formatNumber(endpoint.count) }} 次</div>
            </div>
          </div>
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

.time-range-selector {
  display: flex;
  gap: var(--space-xs);
  background: var(--color-bg-tertiary);
  padding: 4px;
  border-radius: var(--radius-md);
}

.time-range-selector button {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.time-range-selector button.active {
  background: var(--color-bg-primary);
  color: var(--color-accent);
}

/* 統計卡片網格 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border: 0.5px solid var(--color-divider);
  border-radius: var(--radius-md);
}

.stat-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.stat-icon.requests {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.stat-icon.rate-limit {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.stat-icon.response-time {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.stat-content {
  flex: 1;
}

.stat-label {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.stat-value {
  margin: 4px 0 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-value .unit {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-tertiary);
}

.stat-meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* 熱門端點 */
.top-endpoints {
  margin-top: var(--space-lg);
}

.endpoint-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.endpoint-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border: 0.5px solid var(--color-divider);
  border-radius: var(--radius-md);
}

.endpoint-rank {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.endpoint-path {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
}

.endpoint-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
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
