<script setup lang="ts">
/**
 * Member Analytics Page
 * 會員分析頁面 - 使用新的 /gym/analytics/* API
 */

import { Chart, registerables } from 'chart.js'

definePageMeta({
  middleware: 'auth'
})

// Register Chart.js components
Chart.register(...registerables)

const { $directus } = useNuxtApp()
const config = useRuntimeConfig()
const { formatNumber, formatCurrency, getHeatmapColor } = useCharts()

const loading = ref(false)
const error = ref<string | null>(null)
const timeRange = ref<'7d' | '30d' | '90d' | '1y'>('30d')

// Summary data
const summary = ref({
  totalMembers: 0,
  activeMembers: 0,
  newMembers: 0,
  churnedMembers: 0,
  memberGrowth: 0,
  activeRate: 0,
  churnRate: 0
})

// Chart data
const memberGrowthData = ref<any[]>([])
const memberStatusData = ref<any[]>([])
const contractTypeData = ref<any[]>([])
const revenueTrendData = ref<any[]>([])
const ageDistributionData = ref<any[]>([])
const genderDistributionData = ref<any[]>([])
const topPlans = ref<any[]>([])

// Chart refs
const memberGrowthChartRef = ref<HTMLCanvasElement | null>(null)
const memberStatusChartRef = ref<HTMLCanvasElement | null>(null)
const contractTypeChartRef = ref<HTMLCanvasElement | null>(null)
const revenueTrendChartRef = ref<HTMLCanvasElement | null>(null)
const ageDistributionChartRef = ref<HTMLCanvasElement | null>(null)
const genderChartRef = ref<HTMLCanvasElement | null>(null)

// Chart instances
const charts: Record<string, Chart | null> = {}

const getDays = () => {
  const mapping: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365
  }
  return mapping[timeRange.value] || 30
}

const apiCall = async (endpoint: string) => {
  const baseURL = config.public.directusUrl || 'http://localhost:8055'
  const token = await $directus.getToken()

  const response = await fetch(`${baseURL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

const loadAnalytics = async () => {
  loading.value = true
  error.value = null
  const days = getDays()

  try {
    // Fetch member demographics (status, gender, age distribution)
    const demographicsResponse = await apiCall(`/gym/analytics/member-demographics?days=${days}`)
    if (demographicsResponse.success) {
      const data = demographicsResponse.data

      // Status distribution
      memberStatusData.value = data.status_distribution || []

      // Gender distribution
      genderDistributionData.value = data.gender_distribution || []

      // Age distribution
      ageDistributionData.value = data.age_distribution || []

      // Summary stats
      const total = memberStatusData.value.reduce((sum: number, s: any) => sum + (parseInt(s.count) || 0), 0)
      const active = memberStatusData.value.find((s: any) => s.status === 'ACTIVE')?.count || 0
      summary.value.totalMembers = total
      summary.value.activeMembers = parseInt(active)
      summary.value.activeRate = total > 0 ? parseFloat(((parseInt(active) / total) * 100).toFixed(1)) : 0
    }

    // Fetch contract analytics
    const contractResponse = await apiCall(`/gym/analytics/contract-analytics?days=${days}`)
    if (contractResponse.success) {
      const data = contractResponse.data

      // Contract type distribution
      contractTypeData.value = data.type_distribution || []

      // Top plans from contract analytics
      topPlans.value = (data.plan_stats || []).slice(0, 5).map((plan: any, index: number) => ({
        id: plan.plan_id,
        name: plan.plan_name,
        memberCount: parseInt(plan.contract_count) || 0,
        percentage: plan.percentage || 0,
        monthlyRevenue: parseFloat(plan.total_value) || 0
      }))

      // Renewal rate for churn calculation
      const renewalRate = parseFloat(data.renewal_rate) || 0
      summary.value.churnRate = parseFloat((100 - renewalRate).toFixed(1))
    }

    // Fetch revenue breakdown for trend
    const revenueResponse = await apiCall(`/gym/analytics/revenue-breakdown?days=${days}`)
    if (revenueResponse.success) {
      const data = revenueResponse.data

      // Monthly trend for revenue
      revenueTrendData.value = (data.by_month || []).map((m: any) => ({
        date: `${m.year}-${String(m.month).padStart(2, '0')}`,
        amount: parseFloat(m.revenue) || 0
      }))
    }

    // Fetch member growth from reports
    const growthResponse = await apiCall(`/gym/reports/member-growth?days=${days}`)
    if (growthResponse.success) {
      memberGrowthData.value = growthResponse.data.growth || []
      summary.value.newMembers = growthResponse.data.newMembers || 0
      summary.value.memberGrowth = parseFloat(growthResponse.data.growthRate) || 0
      summary.value.churnedMembers = growthResponse.data.churnedMembers || 0
    }

    // Render charts after data is loaded
    await nextTick()
    renderCharts()

  } catch (err: any) {
    error.value = err.message || '載入失敗'
    console.error('Failed to load analytics:', err)
  } finally {
    loading.value = false
  }
}

const renderCharts = () => {
  // Destroy existing charts
  Object.values(charts).forEach(chart => chart?.destroy())

  // Member Growth Line Chart
  if (memberGrowthChartRef.value && memberGrowthData.value.length > 0) {
    charts.memberGrowth = new Chart(memberGrowthChartRef.value, {
      type: 'line',
      data: {
        labels: memberGrowthData.value.map(d => formatDate(d.date)),
        datasets: [{
          label: '會員總數',
          data: memberGrowthData.value.map(d => d.total),
          borderColor: '#0071e3',
          backgroundColor: 'rgba(0, 113, 227, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: false }
        }
      }
    })
  }

  // Member Status Doughnut Chart
  if (memberStatusChartRef.value && memberStatusData.value.length > 0) {
    const statusColors: Record<string, string> = {
      'ACTIVE': '#34c759',
      'INACTIVE': '#8e8e93',
      'SUSPENDED': '#ff9500',
      'EXPIRED': '#ff3b30'
    }

    charts.memberStatus = new Chart(memberStatusChartRef.value, {
      type: 'doughnut',
      data: {
        labels: memberStatusData.value.map(d => getStatusLabel(d.status)),
        datasets: [{
          data: memberStatusData.value.map(d => parseInt(d.count)),
          backgroundColor: memberStatusData.value.map(d => statusColors[d.status] || '#8e8e93')
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' }
        }
      }
    })
  }

  // Contract Type Bar Chart
  if (contractTypeChartRef.value && contractTypeData.value.length > 0) {
    charts.contractType = new Chart(contractTypeChartRef.value, {
      type: 'bar',
      data: {
        labels: contractTypeData.value.map(d => getContractTypeLabel(d.contract_type)),
        datasets: [{
          label: '合約數量',
          data: contractTypeData.value.map(d => parseInt(d.count)),
          backgroundColor: '#5856d6'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    })
  }

  // Revenue Trend Line Chart
  if (revenueTrendChartRef.value && revenueTrendData.value.length > 0) {
    charts.revenueTrend = new Chart(revenueTrendChartRef.value, {
      type: 'line',
      data: {
        labels: revenueTrendData.value.map(d => d.date),
        datasets: [{
          label: '營收',
          data: revenueTrendData.value.map(d => d.amount),
          borderColor: '#34c759',
          backgroundColor: 'rgba(52, 199, 89, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    })
  }

  // Age Distribution Bar Chart
  if (ageDistributionChartRef.value && ageDistributionData.value.length > 0) {
    charts.ageDistribution = new Chart(ageDistributionChartRef.value, {
      type: 'bar',
      data: {
        labels: ageDistributionData.value.map(d => d.age_group),
        datasets: [{
          label: '會員數',
          data: ageDistributionData.value.map(d => parseInt(d.count)),
          backgroundColor: '#ff9500'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    })
  }

  // Gender Pie Chart
  if (genderChartRef.value && genderDistributionData.value.length > 0) {
    const genderColors: Record<string, string> = {
      'M': '#0071e3',
      'F': '#ff2d55',
      'OTHER': '#8e8e93'
    }

    charts.gender = new Chart(genderChartRef.value, {
      type: 'pie',
      data: {
        labels: genderDistributionData.value.map(d => getGenderLabel(d.gender)),
        datasets: [{
          data: genderDistributionData.value.map(d => parseInt(d.count)),
          backgroundColor: genderDistributionData.value.map(d => genderColors[d.gender] || '#8e8e93')
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' }
        }
      }
    })
  }
}

const exportData = async (format: 'csv' | 'pdf' = 'csv') => {
  try {
    const baseURL = config.public.directusUrl || 'http://localhost:8055'
    const token = await $directus.getToken()

    const response = await fetch(
      `${baseURL}/gym/dashboard/export?type=member-analytics&format=${format}&days=${getDays()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `member-analytics-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } else {
      throw new Error('匯出失敗')
    }
  } catch (err: any) {
    useToast().error(err.message || '匯出失敗')
  }
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    ACTIVE: '活躍',
    INACTIVE: '未啟用',
    SUSPENDED: '暫停',
    EXPIRED: '已過期'
  }
  return labels[status] || status
}

const getContractTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    TIME_BASED: '期限制',
    COUNT_BASED: '次數制'
  }
  return labels[type] || type
}

const getGenderLabel = (gender: string) => {
  const labels: Record<string, string> = {
    M: '男性',
    F: '女性',
    OTHER: '其他'
  }
  return labels[gender] || gender
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  })
}

watch(timeRange, () => {
  loadAnalytics()
})

onMounted(() => {
  loadAnalytics()
})

onUnmounted(() => {
  // Cleanup charts
  Object.values(charts).forEach(chart => chart?.destroy())
})
</script>

<template>
  <div class="member-analytics-page">
    <div class="page-header">
      <div class="header-content">
        <h1>會員分析</h1>
        <p class="subtitle">深度了解會員結構與行為</p>
      </div>
      <div class="header-actions">
        <select v-model="timeRange" class="time-range-select">
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="90d">最近 90 天</option>
          <option value="1y">最近 1 年</option>
        </select>
        <div class="export-dropdown">
          <button class="btn-secondary" @click="exportData('csv')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            匯出 CSV
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner" />
      <span>載入中...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </svg>
      <span>{{ error }}</span>
      <button class="btn-primary" @click="loadAnalytics">重試</button>
    </div>

    <div v-else class="content">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="card">
          <div class="card-header">
            <h3>總會員數</h3>
            <span class="icon members">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
          </div>
          <div class="card-body">
            <div class="value">{{ formatNumber(summary.totalMembers) }}</div>
            <div class="change" :class="summary.memberGrowth >= 0 ? 'positive' : 'negative'">
              {{ summary.memberGrowth >= 0 ? '+' : '' }}{{ summary.memberGrowth }}% 成長
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>活躍會員</h3>
            <span class="icon active">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </svg>
            </span>
          </div>
          <div class="card-body">
            <div class="value">{{ formatNumber(summary.activeMembers) }}</div>
            <div class="meta">{{ summary.activeRate }}% 活躍率</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>新增會員</h3>
            <span class="icon new">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" x2="19" y1="8" y2="14" />
                <line x1="22" x2="16" y1="11" y2="11" />
              </svg>
            </span>
          </div>
          <div class="card-body">
            <div class="value">{{ formatNumber(summary.newMembers) }}</div>
            <div class="meta">本期新增</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>流失率</h3>
            <span class="icon churn">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="17" x2="22" y1="11" y2="11" />
              </svg>
            </span>
          </div>
          <div class="card-body">
            <div class="value">{{ summary.churnRate }}%</div>
            <div class="meta">{{ formatNumber(summary.churnedMembers) }} 流失</div>
          </div>
        </div>
      </div>

      <!-- Charts Row 1 -->
      <div class="charts-row">
        <!-- Member Growth Chart -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>會員成長趨勢</h3>
          </div>
          <div class="chart-body">
            <canvas ref="memberGrowthChartRef" />
          </div>
        </div>

        <!-- Member Status Distribution -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>會員狀態分佈</h3>
          </div>
          <div class="chart-body">
            <canvas ref="memberStatusChartRef" />
          </div>
        </div>
      </div>

      <!-- Charts Row 2 -->
      <div class="charts-row">
        <!-- Contract Type Distribution -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>合約類型分佈</h3>
          </div>
          <div class="chart-body">
            <canvas ref="contractTypeChartRef" />
          </div>
        </div>

        <!-- Revenue Trend -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>營收趨勢</h3>
          </div>
          <div class="chart-body">
            <canvas ref="revenueTrendChartRef" />
          </div>
        </div>
      </div>

      <!-- Charts Row 3: Demographics -->
      <div class="charts-row">
        <!-- Age Distribution -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>年齡分佈</h3>
          </div>
          <div class="chart-body">
            <canvas ref="ageDistributionChartRef" />
          </div>
        </div>

        <!-- Gender Distribution -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>性別分佈</h3>
          </div>
          <div class="chart-body">
            <canvas ref="genderChartRef" />
          </div>
        </div>
      </div>

      <!-- Top Plans Table -->
      <div class="table-card">
        <div class="table-header">
          <h3>熱門會籍方案</h3>
        </div>
        <div class="table-body">
          <table v-if="topPlans.length > 0" class="data-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>方案名稱</th>
                <th>會員數</th>
                <th>佔比</th>
                <th>總價值</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(plan, index) in topPlans" :key="plan.id">
                <td class="rank">
                  <span :class="['rank-badge', `rank-${index + 1}`]">{{ index + 1 }}</span>
                </td>
                <td>{{ plan.name }}</td>
                <td>{{ formatNumber(plan.memberCount) }}</td>
                <td>{{ plan.percentage }}%</td>
                <td>{{ formatCurrency(plan.monthlyRevenue) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="no-data">暫無方案數據</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.member-analytics-page {
  padding: var(--space-xl);
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
  gap: var(--space-md);
}

.header-content h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 var(--space-xs) 0;
  color: var(--color-text-primary);
}

.subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: var(--space-md);
  align-items: center;
}

.time-range-select {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 14px;
  cursor: pointer;
}

.time-range-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.btn-secondary:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-accent);
}

.btn-primary {
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.card {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.card-header h3 {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon.members {
  background: rgba(0, 113, 227, 0.1);
  color: #0071e3;
}

.icon.active {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.icon.new {
  background: rgba(88, 86, 214, 0.1);
  color: #5856d6;
}

.icon.churn {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.card-body .value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--space-xs);
}

.card-body .change {
  font-size: 13px;
  font-weight: 500;
}

.change.positive {
  color: #34c759;
}

.change.negative {
  color: #ff3b30;
}

.card-body .meta {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.charts-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.chart-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
}

.chart-header {
  margin-bottom: var(--space-md);
}

.chart-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.chart-body {
  position: relative;
  height: 280px;
}

.table-card {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.table-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.table-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.table-body {
  padding: var(--space-lg);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--color-bg-tertiary);
  padding: var(--space-md);
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid var(--color-border);
}

.data-table td {
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-divider);
  font-size: 14px;
  color: var(--color-text-primary);
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.rank-badge.rank-1 {
  background: linear-gradient(135deg, #ffd700, #ffb700);
  color: #7a5c00;
}

.rank-badge.rank-2 {
  background: linear-gradient(135deg, #c0c0c0, #a0a0a0);
  color: #505050;
}

.rank-badge.rank-3 {
  background: linear-gradient(135deg, #cd7f32, #b87333);
  color: white;
}

.no-data {
  text-align: center;
  padding: var(--space-2xl);
  color: var(--color-text-tertiary);
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-4xl);
  color: var(--color-text-tertiary);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  color: var(--color-error);
}

.error-state svg {
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 768px) {
  .member-analytics-page {
    padding: var(--space-md);
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: space-between;
  }

  .charts-row {
    grid-template-columns: 1fr;
  }

  .card-body .value {
    font-size: 24px;
  }
}
</style>
