<script setup lang="ts">
/**
 * War Room Dashboard
 * 總部戰情室儀表板
 */

definePageMeta({
  middleware: 'auth'
})

const { user } = useAuth()
const { fetchBranches, branches } = useBranches()
const {
  isLoading,
  kpis,
  liveMetrics,
  contractAlerts,
  revenueTargets,
  fetchKPIs,
  fetchContractAlerts,
  fetchRevenueTargets,
  startLiveUpdates,
  stopLiveUpdates
} = useDashboard()

// State
const selectedPeriod = ref<'today' | 'week' | 'month' | 'year'>('today')
const selectedBranch = ref<string>('')
const showLiveUpdates = ref(false)

// 熱力圖數據
const heatmapData = ref<number[][] | undefined>(undefined)

// 權限檢查 - 是否為 HQ
const isHeadquarter = computed(() => {
  // 管理員或總部用戶
  return user.value?.role === 'Administrator' ||
         user.value?.role === 'Manager'
})

// 期間選項
const periodOptions = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '本週' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '今年' }
]

// 載入數據
const loadData = async () => {
  const branchId = selectedBranch.value || undefined

  await Promise.all([
    fetchKPIs(selectedPeriod.value, branchId),
    fetchContractAlerts(30, branchId),
    fetchRevenueTargets(new Date().getFullYear(), branchId),
    loadHeatmapData(branchId)
  ])
}

// 載入熱力圖數據
const loadHeatmapData = async (branchId?: string) => {
  try {
    const config = useRuntimeConfig()
    const baseURL = config.public.apiBaseUrl || 'http://localhost:8056'

    const params = new URLSearchParams()
    params.append('weeks', '4')
    if (branchId) params.append('branch_id', branchId)

    const response = await fetch(`${baseURL}/api/admin/analytics/checkin-heatmap?${params}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      heatmapData.value = data.data?.heatmap || undefined
    }
  } catch (error) {
    console.error('Failed to load heatmap data:', error)
  }
}

// 切換即時更新
const toggleLiveUpdates = () => {
  showLiveUpdates.value = !showLiveUpdates.value
  if (showLiveUpdates.value) {
    startLiveUpdates(selectedBranch.value || undefined)
  } else {
    stopLiveUpdates()
  }
}

// 查看合約詳情
const handleViewContract = (contractId: string) => {
  navigateTo(`/contracts/${contractId}`)
}

// 查看所有警示
const handleViewAllAlerts = () => {
  navigateTo('/reports?tab=contract-expiry')
}

// 刷新數據
const refresh = async () => {
  await loadData()
  useToast().success('數據已更新')
}

// 匯出功能
const showExportMenu = ref(false)

const exportData = async (type: 'kpis' | 'revenue' | 'contracts' | 'checkins', format: 'csv' | 'json' = 'csv') => {
  try {
    const config = useRuntimeConfig()
    const baseURL = config.public.apiBaseUrl || 'http://localhost:8056'

    const params = new URLSearchParams()
    params.append('type', type)
    params.append('format', format)
    params.append('days', periodToDays(selectedPeriod.value).toString())
    if (selectedBranch.value) {
      params.append('branch_id', selectedBranch.value)
    }

    const response = await fetch(`${baseURL}/api/admin/dashboard/export?${params}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      useToast().success('匯出成功')
    } else {
      throw new Error('匯出失敗')
    }
  } catch (error: any) {
    useToast().error(error.message || '匯出失敗')
  }
  showExportMenu.value = false
}

const periodToDays = (period: string): number => {
  switch (period) {
    case 'today': return 1
    case 'week': return 7
    case 'month': return 30
    case 'year': return 365
    default: return 30
  }
}

// Watch for filter changes
watch([selectedPeriod, selectedBranch], () => {
  loadData()
})

// 初始化
onMounted(async () => {
  await fetchBranches()
  await loadData()
})

onUnmounted(() => {
  stopLiveUpdates()
})
</script>

<template>
  <div class="war-room">
    <!-- Header -->
    <header class="war-room-header">
      <div class="header-content">
        <h1 class="text-display">戰情室</h1>
        <p class="text-subhead text-secondary">即時掌握營運狀態</p>
      </div>

      <div class="header-controls">
        <!-- Branch Selector (HQ Only) -->
        <div v-if="isHeadquarter && branches.length > 1" class="control-group">
          <select v-model="selectedBranch" class="form-select">
            <option value="">全部分店</option>
            <option v-for="branch in branches" :key="branch.id" :value="branch.id">
              {{ branch.name }}
            </option>
          </select>
        </div>

        <!-- Period Selector -->
        <div class="control-group period-selector">
          <button
            v-for="option in periodOptions"
            :key="option.value"
            :class="['period-btn', { active: selectedPeriod === option.value }]"
            @click="selectedPeriod = option.value as any"
          >
            {{ option.label }}
          </button>
        </div>

        <!-- Live Toggle -->
        <button
          :class="['live-toggle', { active: showLiveUpdates }]"
          @click="toggleLiveUpdates"
        >
          <span class="live-dot" />
          LIVE
        </button>

        <!-- Export Menu -->
        <div class="export-dropdown">
          <button class="export-btn" @click="showExportMenu = !showExportMenu">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            匯出
          </button>
          <div v-if="showExportMenu" class="export-menu">
            <button @click="exportData('revenue', 'csv')">營收報表 (CSV)</button>
            <button @click="exportData('contracts', 'csv')">合約報表 (CSV)</button>
            <button @click="exportData('checkins', 'csv')">打卡記錄 (CSV)</button>
            <button @click="exportData('kpis', 'json')">KPI 數據 (JSON)</button>
          </div>
        </div>

        <!-- Refresh Button -->
        <button class="refresh-btn" :disabled="isLoading" @click="refresh">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ spinning: isLoading }">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>
    </header>

    <!-- KPI Grid -->
    <section class="kpi-section">
      <LazyKpiGrid
        :kpis="kpis"
        :loading="isLoading"
        :show-live="showLiveUpdates"
      />
    </section>

    <!-- Charts Row (Lazy loaded) -->
    <section class="charts-section">
      <div class="charts-grid">
        <!-- Revenue Chart -->
        <div class="chart-card">
          <Suspense>
            <template #default>
              <LazyRevenueChart
                :kpis="kpis"
                chart-type="bar"
                :loading="isLoading"
              />
            </template>
            <template #fallback>
              <div class="chart-loading">
                <div class="loading-spinner" />
              </div>
            </template>
          </Suspense>
        </div>

        <!-- Heatmap -->
        <div class="chart-card">
          <Suspense>
            <template #default>
              <LazyCheckinHeatmap
                :data="heatmapData"
                :loading="isLoading"
              />
            </template>
            <template #fallback>
              <div class="chart-loading">
                <div class="loading-spinner" />
              </div>
            </template>
          </Suspense>
        </div>
      </div>
    </section>

    <!-- Branch Comparison (HQ Only) - Lazy loaded -->
    <section v-if="isHeadquarter && !selectedBranch" class="comparison-section">
      <LazyBranchComparison
        :kpis="kpis"
        :targets="revenueTargets"
        :loading="isLoading"
      />
    </section>

    <!-- Bottom Row -->
    <section class="bottom-section">
      <div class="bottom-grid">
        <!-- Contract Alerts -->
        <div class="bottom-card">
          <LazyContractAlerts
            :alerts="contractAlerts"
            :loading="isLoading"
            :limit="8"
            @view-contract="handleViewContract"
            @view-all="handleViewAllAlerts"
          />
        </div>

        <!-- Live Feed -->
        <div class="bottom-card">
          <LazyLiveFeed
            :metrics="liveMetrics"
            :loading="isLoading && showLiveUpdates"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.war-room {
  max-width: 1600px;
  margin: 0 auto;
}

/* Header */
.war-room-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-2xl);
  flex-wrap: wrap;
  gap: var(--space-lg);
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
}

.form-select {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 14px;
  cursor: pointer;
  min-width: 140px;
}

.form-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.period-selector {
  display: flex;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: 2px;
}

.period-btn {
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) ease;
}

.period-btn:hover {
  color: var(--color-text-primary);
}

.period-btn.active {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.live-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.live-toggle:hover {
  border-color: var(--color-success);
  color: var(--color-success);
}

.live-toggle.active {
  border-color: var(--color-success);
  color: var(--color-success);
  background: rgba(52, 199, 89, 0.1);
}

.live-toggle .live-dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
}

.live-toggle.active .live-dot {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.refresh-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) ease;
}

.refresh-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Export Dropdown */
.export-dropdown {
  position: relative;
}

.export-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.export-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-xs);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 180px;
  z-index: 100;
  overflow: hidden;
}

.export-menu button {
  display: block;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) ease;
}

.export-menu button:hover {
  background: var(--color-bg-tertiary);
}

/* Chart loading fallback */
.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.chart-loading .loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Sections */
.kpi-section {
  margin-bottom: var(--space-2xl);
}

.charts-section {
  margin-bottom: var(--space-2xl);
}

.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}

.chart-card {
  min-height: 320px;
}

.comparison-section {
  margin-bottom: var(--space-2xl);
}

.bottom-section {
  margin-bottom: var(--space-2xl);
}

.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}

.bottom-card {
  min-height: 360px;
}

/* Responsive */
@media (max-width: 1200px) {
  .charts-grid,
  .bottom-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .war-room-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-controls {
    justify-content: space-between;
  }

  .period-selector {
    flex: 1;
    justify-content: center;
  }

  .period-btn {
    padding: var(--space-sm);
    font-size: 12px;
  }
}
</style>
