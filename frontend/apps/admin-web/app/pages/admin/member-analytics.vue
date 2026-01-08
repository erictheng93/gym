<template>
  <div class="member-analytics-page">
    <div class="page-header">
      <h1>会员分析</h1>
      <div class="header-actions">
        <select v-model="timeRange" @change="loadAnalytics" class="time-range-select">
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="90d">最近 90 天</option>
          <option value="1y">最近 1 年</option>
        </select>
        <button @click="exportData" class="btn-secondary">
          导出数据
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="content">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="card">
          <div class="card-header">
            <h3>总会员数</h3>
            <span class="icon members">👥</span>
          </div>
          <div class="card-body">
            <div class="value">{{ formatNumber(summary.totalMembers) }}</div>
            <div class="change" :class="summary.memberGrowth >= 0 ? 'positive' : 'negative'">
              {{ summary.memberGrowth >= 0 ? '+' : '' }}{{ summary.memberGrowth }}% 增长
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>活跃会员</h3>
            <span class="icon active">✓</span>
          </div>
          <div class="card-body">
            <div class="value">{{ formatNumber(summary.activeMembers) }}</div>
            <div class="meta">{{ summary.activeRate }}% 活跃率</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>新增会员</h3>
            <span class="icon new">+</span>
          </div>
          <div class="card-body">
            <div class="value">{{ formatNumber(summary.newMembers) }}</div>
            <div class="meta">本期新增</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>流失会员</h3>
            <span class="icon churn">−</span>
          </div>
          <div class="card-body">
            <div class="value">{{ formatNumber(summary.churnedMembers) }}</div>
            <div class="meta">{{ summary.churnRate }}% 流失率</div>
          </div>
        </div>
      </div>

      <!-- Charts Row 1 -->
      <div class="charts-row">
        <!-- Member Growth Chart -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>会员增长趋势</h3>
          </div>
          <div class="chart-body">
            <canvas ref="memberGrowthChart"></canvas>
          </div>
        </div>

        <!-- Member Status Distribution -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>会员状态分布</h3>
          </div>
          <div class="chart-body">
            <canvas ref="memberStatusChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Charts Row 2 -->
      <div class="charts-row">
        <!-- Contract Type Distribution -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>合约类型分布</h3>
          </div>
          <div class="chart-body">
            <canvas ref="contractTypeChart"></canvas>
          </div>
        </div>

        <!-- Revenue Trend -->
        <div class="chart-container">
          <div class="chart-header">
            <h3>收入趋势</h3>
          </div>
          <div class="chart-body">
            <canvas ref="revenueTrendChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Top Plans Table -->
      <div class="table-card">
        <div class="table-header">
          <h3>热门会籍套餐</h3>
        </div>
        <div class="table-body">
          <table class="data-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>套餐名称</th>
                <th>会员数</th>
                <th>占比</th>
                <th>月收入</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(plan, index) in topPlans" :key="plan.id">
                <td class="rank">{{ index + 1 }}</td>
                <td>{{ plan.name }}</td>
                <td>{{ formatNumber(plan.memberCount) }}</td>
                <td>{{ plan.percentage }}%</td>
                <td>{{ formatCurrency(plan.monthlyRevenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Age Distribution -->
      <div class="chart-container full-width">
        <div class="chart-header">
          <h3>年龄分布</h3>
        </div>
        <div class="chart-body">
          <canvas ref="ageDistributionChart"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useAuth } from '~/composables/useAuth'

const { apiCall } = useAuth()

const loading = ref(false)
const error = ref(null)
const timeRange = ref('30d')

const summary = ref({
  totalMembers: 0,
  activeMembers: 0,
  newMembers: 0,
  churnedMembers: 0,
  memberGrowth: 0,
  activeRate: 0,
  churnRate: 0
})

const memberGrowthData = ref([])
const memberStatusData = ref([])
const contractTypeData = ref([])
const revenueTrendData = ref([])
const ageDistributionData = ref([])
const topPlans = ref([])

// Chart refs
const memberGrowthChart = ref(null)
const memberStatusChart = ref(null)
const contractTypeChart = ref(null)
const revenueTrendChart = ref(null)
const ageDistributionChart = ref(null)

let charts = {}

const loadAnalytics = async () => {
  loading.value = true
  error.value = null

  try {
    // Fetch member growth data
    const growthResponse = await apiCall(`/gym/reports/member-growth?days=${getDays()}`)
    if (growthResponse.success) {
      memberGrowthData.value = growthResponse.data.growth || []
      summary.value.totalMembers = growthResponse.data.totalMembers || 0
      summary.value.newMembers = growthResponse.data.newMembers || 0
      summary.value.memberGrowth = growthResponse.data.growthRate || 0
    }

    // Fetch member status distribution
    const statusResponse = await apiCall('/gym/admin/member-analytics/status-distribution')
    if (statusResponse.success) {
      memberStatusData.value = statusResponse.data || []
      const activeCount = memberStatusData.value.find(s => s.status === 'active')?.count || 0
      summary.value.activeMembers = activeCount
      summary.value.activeRate = summary.value.totalMembers > 0
        ? ((activeCount / summary.value.totalMembers) * 100).toFixed(1)
        : 0
    }

    // Fetch contract type distribution
    const contractResponse = await apiCall('/gym/admin/member-analytics/contract-distribution')
    if (contractResponse.success) {
      contractTypeData.value = contractResponse.data || []
    }

    // Fetch revenue trend
    const revenueResponse = await apiCall(`/gym/reports/revenue?days=${getDays()}`)
    if (revenueResponse.success) {
      revenueTrendData.value = revenueResponse.data.trend || []
    }

    // Fetch age distribution
    const ageResponse = await apiCall('/gym/admin/member-analytics/age-distribution')
    if (ageResponse.success) {
      ageDistributionData.value = ageResponse.data || []
    }

    // Fetch top plans
    const plansResponse = await apiCall('/gym/admin/member-analytics/top-plans')
    if (plansResponse.success) {
      topPlans.value = plansResponse.data || []
    }

    // Calculate churn stats
    const churnResponse = await apiCall(`/gym/admin/member-analytics/churn?days=${getDays()}`)
    if (churnResponse.success) {
      summary.value.churnedMembers = churnResponse.data.churnedCount || 0
      summary.value.churnRate = churnResponse.data.churnRate || 0
    }

    // Render charts after data is loaded
    await nextTick()
    renderCharts()

  } catch (err) {
    error.value = err.message || '加载失败'
    console.error('Failed to load analytics:', err)
  } finally {
    loading.value = false
  }
}

const getDays = () => {
  const mapping = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365
  }
  return mapping[timeRange.value] || 30
}

const renderCharts = () => {
  // Destroy existing charts
  Object.values(charts).forEach(chart => chart?.destroy?.())
  charts = {}

  // Import Chart.js dynamically (assuming it's installed)
  if (typeof window !== 'undefined' && window.Chart) {
    const Chart = window.Chart

    // Member Growth Line Chart
    if (memberGrowthChart.value) {
      charts.memberGrowth = new Chart(memberGrowthChart.value, {
        type: 'line',
        data: {
          labels: memberGrowthData.value.map(d => formatDate(d.date)),
          datasets: [{
            label: '会员总数',
            data: memberGrowthData.value.map(d => d.total),
            borderColor: '#0071e3',
            backgroundColor: 'rgba(0, 113, 227, 0.1)',
            tension: 0.3
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

    // Member Status Pie Chart
    if (memberStatusChart.value) {
      charts.memberStatus = new Chart(memberStatusChart.value, {
        type: 'doughnut',
        data: {
          labels: memberStatusData.value.map(d => getStatusLabel(d.status)),
          datasets: [{
            data: memberStatusData.value.map(d => d.count),
            backgroundColor: ['#34c759', '#ff9500', '#ff3b30', '#8e8e93']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      })
    }

    // Contract Type Bar Chart
    if (contractTypeChart.value) {
      charts.contractType = new Chart(contractTypeChart.value, {
        type: 'bar',
        data: {
          labels: contractTypeData.value.map(d => d.type),
          datasets: [{
            label: '合约数量',
            data: contractTypeData.value.map(d => d.count),
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
    if (revenueTrendChart.value) {
      charts.revenueTrend = new Chart(revenueTrendChart.value, {
        type: 'line',
        data: {
          labels: revenueTrendData.value.map(d => formatDate(d.date)),
          datasets: [{
            label: '收入',
            data: revenueTrendData.value.map(d => d.amount),
            borderColor: '#34c759',
            backgroundColor: 'rgba(52, 199, 89, 0.1)',
            tension: 0.3
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
    if (ageDistributionChart.value) {
      charts.ageDistribution = new Chart(ageDistributionChart.value, {
        type: 'bar',
        data: {
          labels: ageDistributionData.value.map(d => d.ageRange),
          datasets: [{
            label: '会员数',
            data: ageDistributionData.value.map(d => d.count),
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
  }
}

const exportData = async () => {
  try {
    const response = await apiCall(`/gym/admin/member-analytics/export?timeRange=${timeRange.value}&format=csv`)
    if (response.success && response.data.downloadUrl) {
      window.open(response.data.downloadUrl, '_blank')
    } else {
      alert('导出失败')
    }
  } catch (err) {
    alert(err.message || '导出失败')
  }
}

const getStatusLabel = (status) => {
  const labels = {
    active: '活跃',
    inactive: '未激活',
    suspended: '暂停',
    expired: '已过期'
  }
  return labels[status] || status
}

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  return new Intl.NumberFormat('zh-TW').format(num)
}

const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD'
  }).format(amount)
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  loadAnalytics()

  // Load Chart.js if not already loaded
  if (typeof window !== 'undefined' && !window.Chart) {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js'
    script.onload = () => {
      if (memberGrowthData.value.length > 0) {
        renderCharts()
      }
    }
    document.head.appendChild(script)
  }
})
</script>

<style scoped>
.member-analytics-page {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.time-range-select {
  padding: 8px 12px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.card {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-header h3 {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin: 0;
}

.icon {
  font-size: 24px;
}

.card-body .value {
  font-size: 32px;
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
}

.card-body .change {
  font-size: 14px;
  font-weight: 500;
}

.change.positive {
  color: #34c759;
}

.change.negative {
  color: #ff3b30;
}

.card-body .meta {
  font-size: 14px;
  color: #666;
}

.charts-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.chart-container {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  padding: 20px;
}

.chart-container.full-width {
  grid-column: 1 / -1;
}

.chart-header {
  margin-bottom: 16px;
}

.chart-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.chart-body {
  position: relative;
  height: 300px;
}

.table-card {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  margin-bottom: 24px;
  overflow: hidden;
}

.table-header {
  padding: 16px 20px;
  border-bottom: 1px solid #dee2e6;
}

.table-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.table-body {
  padding: 20px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: #f8f9fa;
  padding: 12px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  border-bottom: 2px solid #dee2e6;
}

.data-table td {
  padding: 12px;
  border-bottom: 1px solid #dee2e6;
  font-size: 14px;
}

.data-table .rank {
  font-weight: 600;
  color: #666;
}

.loading,
.error {
  padding: 40px;
  text-align: center;
  color: #666;
}

.error {
  color: #dc3545;
}

.btn-secondary {
  padding: 8px 16px;
  background: #f8f9fa;
  color: #333;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #e2e6ea;
}
</style>
