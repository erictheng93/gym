<template>
  <div class="audit-logs-page">
    <div class="page-header">
      <h1>审计日志</h1>
      <button class="btn-secondary" @click="exportLogs">
        导出日志
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-group">
        <label>操作类型</label>
        <select v-model="filters.action" @change="loadLogs">
          <option value="">全部操作</option>
          <option value="create">创建</option>
          <option value="update">更新</option>
          <option value="delete">删除</option>
          <option value="login">登录</option>
          <option value="logout">登出</option>
        </select>
      </div>

      <div class="filter-group">
        <label>资源类型</label>
        <select v-model="filters.resourceType" @change="loadLogs">
          <option value="">全部资源</option>
          <option value="members">会员</option>
          <option value="contracts">合约</option>
          <option value="payments">支付</option>
          <option value="employees">员工</option>
          <option value="branches">分店</option>
          <option value="users">用户</option>
        </select>
      </div>

      <div class="filter-group">
        <label>严重程度</label>
        <select v-model="filters.severity" @change="loadLogs">
          <option value="">全部级别</option>
          <option value="info">信息</option>
          <option value="warning">警告</option>
          <option value="error">错误</option>
          <option value="critical">严重</option>
        </select>
      </div>

      <div class="filter-group">
        <label>时间范围</label>
        <select v-model="filters.timeRange" @change="loadLogs">
          <option value="24h">最近 24 小时</option>
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="90d">最近 90 天</option>
        </select>
      </div>

      <div class="filter-group">
        <label>搜索</label>
        <input
          v-model="filters.search"
          type="text"
          placeholder="搜索资源ID或用户"
          @input="debouncedSearch"
        />
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-label">总操作数</div>
        <div class="stat-value">{{ formatNumber(stats.totalLogs) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">成功操作</div>
        <div class="stat-value success">{{ formatNumber(stats.successLogs) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">失败操作</div>
        <div class="stat-value error">{{ formatNumber(stats.failedLogs) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均响应时间</div>
        <div class="stat-value">{{ stats.avgResponseTime }} ms</div>
      </div>
    </div>

    <!-- Logs Table -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>用户</th>
            <th>操作</th>
            <th>资源类型</th>
            <th>资源ID</th>
            <th>严重程度</th>
            <th>IP地址</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td class="timestamp">{{ formatDateTime(log.date_created) }}</td>
            <td>{{ log.user_name || '-' }}</td>
            <td>
              <span :class="`action-badge action-${log.action}`">
                {{ getActionLabel(log.action) }}
              </span>
            </td>
            <td>{{ getResourceLabel(log.resource_type) }}</td>
            <td class="resource-id">{{ truncate(log.resource_id, 8) }}</td>
            <td>
              <span :class="`severity-badge severity-${log.severity}`">
                {{ getSeverityLabel(log.severity) }}
              </span>
            </td>
            <td class="ip-address">{{ log.ip_address || '-' }}</td>
            <td class="actions">
              <button class="btn-text" @click="viewDetails(log.id)">
                查看详情
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="logs.length === 0" class="empty-state">
        暂无审计日志
      </div>

      <!-- Pagination -->
      <div v-if="pagination.total > pagination.limit" class="pagination">
        <button
          :disabled="pagination.page === 1"
          class="btn-pagination"
          @click="changePage(pagination.page - 1)"
        >
          上一页
        </button>
        <span class="page-info">
          第 {{ pagination.page }} 页，共 {{ totalPages }} 页
        </span>
        <button
          :disabled="pagination.page >= totalPages"
          class="btn-pagination"
          @click="changePage(pagination.page + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- Detail Modal -->
    <AppModal v-if="showDetailModal" @close="showDetailModal = false">
      <template #header>审计日志详情</template>
      <template #default>
        <div v-if="selectedLog" class="log-detail">
          <div class="detail-section">
            <h3>基本信息</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <label>操作时间</label>
                <div>{{ formatDateTime(selectedLog.date_created) }}</div>
              </div>
              <div class="detail-item">
                <label>操作用户</label>
                <div>{{ selectedLog.user_name || '-' }}</div>
              </div>
              <div class="detail-item">
                <label>操作类型</label>
                <div>{{ getActionLabel(selectedLog.action) }}</div>
              </div>
              <div class="detail-item">
                <label>资源类型</label>
                <div>{{ getResourceLabel(selectedLog.resource_type) }}</div>
              </div>
              <div class="detail-item">
                <label>资源ID</label>
                <div class="monospace">{{ selectedLog.resource_id }}</div>
              </div>
              <div class="detail-item">
                <label>严重程度</label>
                <div>
                  <span :class="`severity-badge severity-${selectedLog.severity}`">
                    {{ getSeverityLabel(selectedLog.severity) }}
                  </span>
                </div>
              </div>
              <div class="detail-item">
                <label>IP地址</label>
                <div>{{ selectedLog.ip_address || '-' }}</div>
              </div>
              <div class="detail-item">
                <label>User Agent</label>
                <div class="truncate">{{ selectedLog.user_agent || '-' }}</div>
              </div>
            </div>
          </div>

          <div v-if="selectedLog.old_values" class="detail-section">
            <h3>旧值</h3>
            <pre class="json-view">{{ formatJSON(selectedLog.old_values) }}</pre>
          </div>

          <div v-if="selectedLog.new_values" class="detail-section">
            <h3>新值</h3>
            <pre class="json-view">{{ formatJSON(selectedLog.new_values) }}</pre>
          </div>

          <div v-if="selectedLog.diff" class="detail-section">
            <h3>变更差异</h3>
            <pre class="json-view">{{ formatJSON(selectedLog.diff) }}</pre>
          </div>

          <div v-if="selectedLog.metadata" class="detail-section">
            <h3>元数据</h3>
            <pre class="json-view">{{ formatJSON(selectedLog.metadata) }}</pre>
          </div>
        </div>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'

const { apiCall } = useAuth()

const loading = ref(false)
const error = ref(null)
const logs = ref([])
const selectedLog = ref(null)
const showDetailModal = ref(false)

const filters = ref({
  action: '',
  resourceType: '',
  severity: '',
  timeRange: '7d',
  search: ''
})

const stats = ref({
  totalLogs: 0,
  successLogs: 0,
  failedLogs: 0,
  avgResponseTime: 0
})

const pagination = ref({
  page: 1,
  limit: 50,
  total: 0
})

const totalPages = computed(() => {
  return Math.ceil(pagination.value.total / pagination.value.limit)
})

let searchTimeout = null

const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    loadLogs()
  }, 500)
}

const loadStats = async () => {
  try {
    const params = new URLSearchParams({
      timeRange: filters.value.timeRange
    })

    const response = await apiCall(`/gym/audit/stats?${params.toString()}`)
    if (response.success && response.data) {
      stats.value = {
        totalLogs: response.data.totalLogs || 0,
        successLogs: response.data.successLogs || 0,
        failedLogs: response.data.failedLogs || 0,
        avgResponseTime: response.data.avgResponseTime || 0
      }
    }
  } catch (err) {
    console.error('Failed to load audit stats:', err)
  }
}

const loadLogs = async () => {
  loading.value = true
  error.value = null

  try {
    const params = new URLSearchParams({
      page: pagination.value.page.toString(),
      limit: pagination.value.limit.toString()
    })

    if (filters.value.action) params.append('action', filters.value.action)
    if (filters.value.resourceType) params.append('resource_type', filters.value.resourceType)
    if (filters.value.severity) params.append('severity', filters.value.severity)
    if (filters.value.timeRange) params.append('time_range', filters.value.timeRange)
    if (filters.value.search) params.append('search', filters.value.search)

    const response = await apiCall(`/gym/audit/logs?${params.toString()}`)
    if (response.success) {
      logs.value = response.data.logs || []
      pagination.value.total = response.data.pagination?.total || 0
    } else {
      error.value = response.message || '加载失败'
    }
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const viewDetails = async (logId) => {
  try {
    const response = await apiCall(`/gym/audit/logs/${logId}`)
    if (response.success && response.data) {
      selectedLog.value = response.data
      showDetailModal.value = true
    } else {
      alert('无法加载日志详情')
    }
  } catch (err) {
    alert(err.message || '加载失败')
  }
}

const exportLogs = async () => {
  try {
    const params = new URLSearchParams()
    if (filters.value.action) params.append('action', filters.value.action)
    if (filters.value.resourceType) params.append('resource_type', filters.value.resourceType)
    if (filters.value.severity) params.append('severity', filters.value.severity)
    if (filters.value.timeRange) params.append('time_range', filters.value.timeRange)

    const url = `/gym/audit/export?${params.toString()}`
    window.open(url, '_blank')
  } catch (err) {
    alert(err.message || '导出失败')
  }
}

const changePage = (newPage) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    pagination.value.page = newPage
    loadLogs()
  }
}

const getActionLabel = (action) => {
  const labels = {
    create: '创建',
    update: '更新',
    delete: '删除',
    login: '登录',
    logout: '登出'
  }
  return labels[action] || action
}

const getResourceLabel = (resourceType) => {
  const labels = {
    members: '会员',
    contracts: '合约',
    payments: '支付',
    employees: '员工',
    branches: '分店',
    users: '用户'
  }
  return labels[resourceType] || resourceType
}

const getSeverityLabel = (severity) => {
  const labels = {
    info: '信息',
    warning: '警告',
    error: '错误',
    critical: '严重'
  }
  return labels[severity] || severity
}

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  return new Intl.NumberFormat('zh-TW').format(num)
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-TW')
}

const formatJSON = (obj) => {
  if (!obj) return ''
  try {
    const parsed = typeof obj === 'string' ? JSON.parse(obj) : obj
    return JSON.stringify(parsed, null, 2)
  } catch {
    return obj
  }
}

const truncate = (str, length) => {
  if (!str) return ''
  return str.length > length ? str.substring(0, length) + '...' : str
}

onMounted(() => {
  loadStats()
  loadLogs()
})
</script>

<style scoped>
.audit-logs-page {
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

.filters {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}

.filter-group label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.filter-group select,
.filter-group input {
  padding: 6px 12px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  padding: 16px;
}

.stat-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #333;
}

.stat-value.success {
  color: #34c759;
}

.stat-value.error {
  color: #ff3b30;
}

.table-container {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  overflow: hidden;
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

.data-table tr:last-child td {
  border-bottom: none;
}

.timestamp {
  font-size: 13px;
  color: #666;
}

.resource-id,
.ip-address {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #666;
}

.action-badge,
.severity-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.action-create {
  background: #d4edda;
  color: #155724;
}

.action-update {
  background: #d1ecf1;
  color: #0c5460;
}

.action-delete {
  background: #f8d7da;
  color: #721c24;
}

.action-login,
.action-logout {
  background: #e2e3e5;
  color: #383d41;
}

.severity-info {
  background: #d1ecf1;
  color: #0c5460;
}

.severity-warning {
  background: #fff3cd;
  color: #856404;
}

.severity-error,
.severity-critical {
  background: #f8d7da;
  color: #721c24;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-text {
  background: none;
  border: none;
  color: #0071e3;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.btn-text:hover {
  text-decoration: underline;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 16px;
}

.btn-pagination {
  padding: 6px 12px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.btn-pagination:hover:not(:disabled) {
  background: #e2e6ea;
}

.btn-pagination:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 14px;
  color: #666;
}

.loading,
.error,
.empty-state {
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

/* Detail Modal */
.log-detail {
  max-height: 600px;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  margin: 0 0 12px 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.detail-item label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}

.detail-item div {
  font-size: 14px;
  color: #333;
}

.monospace {
  font-family: 'Courier New', monospace;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.json-view {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
}
</style>
