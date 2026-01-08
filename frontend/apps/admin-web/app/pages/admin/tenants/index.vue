<script setup lang="ts">
/**
 * Admin Tenant Dashboard - MVP
 * 租戶管理儀表板
 */

definePageMeta({
  middleware: 'auth'
})

const directus = useDirectus()

interface TenantStats {
  totalTenants: number
  activeTenants: number
  trialTenants: number
  suspendedTenants: number
  tenantsAtRisk: number
  totalMembers: number
  totalEmployees: number
  totalBranches: number
}

interface Tenant {
  id: string
  name: string
  slug: string
  email: string
  plan_type: string
  tenant_status: string
  max_members: number
  max_employees: number
  max_branches: number
  current_members: number
  current_employees: number
  current_branches: number
  members_usage_percent: number
  employees_usage_percent: number
  branches_usage_percent: number
  active_contracts: number
  trial_ends_at: string | null
  date_created: string
}

const stats = ref<TenantStats>({
  totalTenants: 0,
  activeTenants: 0,
  trialTenants: 0,
  suspendedTenants: 0,
  tenantsAtRisk: 0,
  totalMembers: 0,
  totalEmployees: 0,
  totalBranches: 0
})

const tenants = ref<Tenant[]>([])
const isLoading = ref(true)
const sortBy = ref<'name' | 'usage' | 'created'>('name')
const filterStatus = ref<string>('all')

// Fetch tenant data
const fetchTenants = async () => {
  isLoading.value = true
  try {
    const response = await directus.request({
      method: 'GET',
      path: '/gym/admin/tenants'
    })

    if (response.success) {
      stats.value = response.stats
      tenants.value = response.tenants
    }
  } catch (error) {
    console.error('Failed to fetch tenants:', error)
    useToast().error('載入租戶資料失敗')
  } finally {
    isLoading.value = false
  }
}

// Computed filtered and sorted tenants
const filteredTenants = computed(() => {
  let filtered = tenants.value

  // Filter by status
  if (filterStatus.value !== 'all') {
    filtered = filtered.filter(t => t.tenant_status === filterStatus.value)
  }

  // Sort
  return filtered.sort((a, b) => {
    if (sortBy.value === 'name') {
      return a.name.localeCompare(b.name, 'zh-TW')
    } else if (sortBy.value === 'usage') {
      const aMax = Math.max(a.members_usage_percent, a.employees_usage_percent)
      const bMax = Math.max(b.members_usage_percent, b.employees_usage_percent)
      return bMax - aMax
    } else {
      return new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
    }
  })
})

// Status badge helper
const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    active: { label: '正常', class: 'badge-success' },
    trial: { label: '試用中', class: 'badge-warning' },
    suspended: { label: '已暫停', class: 'badge-error' },
    cancelled: { label: '已取消', class: 'badge-default' }
  }
  return map[status] || { label: status, class: 'badge-default' }
}

// Plan type helper
const getPlanLabel = (planType: string) => {
  const map: Record<string, string> = {
    starter: '入門版',
    professional: '專業版',
    enterprise: '企業版',
    custom: '自訂版'
  }
  return map[planType] || planType
}

// Format date
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

// Load data on mount
onMounted(() => {
  fetchTenants()
})
</script>

<template>
  <div class="admin-dashboard">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="text-headline">租戶管理</h1>
        <p class="text-body text-secondary">監控和管理所有租戶的使用情況</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="fetchTenants">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          重新載入
        </button>
        <NuxtLink to="/admin/tenants/new" class="btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          創建租戶
        </NuxtLink>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="spinner" />
      <p>載入租戶資料中...</p>
    </div>

    <template v-else>
      <!-- KPI Cards -->
      <section class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon kpi-icon--blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </div>
          <div class="kpi-content">
            <p class="kpi-label">總租戶數</p>
            <p class="kpi-value">{{ stats.totalTenants }}</p>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon kpi-icon--green">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div class="kpi-content">
            <p class="kpi-label">活躍租戶</p>
            <p class="kpi-value">{{ stats.activeTenants }}</p>
            <p class="kpi-subtext">{{ stats.trialTenants }} 試用中</p>
          </div>
        </div>

        <div class="kpi-card" :class="{ warning: stats.tenantsAtRisk > 0 }">
          <div class="kpi-icon kpi-icon--orange">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div class="kpi-content">
            <p class="kpi-label">配額警告</p>
            <p class="kpi-value">{{ stats.tenantsAtRisk }}</p>
            <p class="kpi-subtext">超過 90% 配額</p>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon kpi-icon--purple">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div class="kpi-content">
            <p class="kpi-label">總會員數</p>
            <p class="kpi-value">{{ stats.totalMembers }}</p>
            <p class="kpi-subtext">{{ stats.totalEmployees }} 員工</p>
          </div>
        </div>
      </section>

      <!-- Filters -->
      <section class="filters-bar">
        <div class="filter-group">
          <label>排序</label>
          <select v-model="sortBy" class="filter-select">
            <option value="name">名稱</option>
            <option value="usage">配額使用率</option>
            <option value="created">建立時間</option>
          </select>
        </div>

        <div class="filter-group">
          <label>狀態</label>
          <select v-model="filterStatus" class="filter-select">
            <option value="all">全部</option>
            <option value="active">正常</option>
            <option value="trial">試用中</option>
            <option value="suspended">已暫停</option>
          </select>
        </div>

        <div class="filter-info">
          顯示 {{ filteredTenants.length }} / {{ tenants.length }} 個租戶
        </div>
      </section>

      <!-- Tenant Table -->
      <section class="tenant-table-section">
        <div class="table-container">
          <table class="tenant-table">
            <thead>
              <tr>
                <th>租戶名稱</th>
                <th>套餐</th>
                <th>狀態</th>
                <th>會員配額</th>
                <th>員工配額</th>
                <th>分店配額</th>
                <th>健康度</th>
                <th>建立日期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tenant in filteredTenants" :key="tenant.id" class="tenant-row">
                <td>
                  <div class="tenant-cell">
                    <div class="tenant-avatar">{{ tenant.name[0] }}</div>
                    <div class="tenant-info">
                      <p class="tenant-name">{{ tenant.name }}</p>
                      <p class="tenant-email">{{ tenant.email }}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="plan-badge">{{ getPlanLabel(tenant.plan_type) }}</span>
                </td>
                <td>
                  <span class="status-badge" :class="getStatusBadge(tenant.tenant_status).class">
                    {{ getStatusBadge(tenant.tenant_status).label }}
                  </span>
                </td>
                <td>
                  <QuotaBar
                    :current="tenant.current_members"
                    :limit="tenant.max_members"
                    compact
                  />
                </td>
                <td>
                  <QuotaBar
                    :current="tenant.current_employees"
                    :limit="tenant.max_employees"
                    compact
                  />
                </td>
                <td>
                  <QuotaBar
                    :current="tenant.current_branches"
                    :limit="tenant.max_branches"
                    compact
                  />
                </td>
                <td>
                  <HealthBadge
                    :members-percent="tenant.members_usage_percent"
                    :employees-percent="tenant.employees_usage_percent"
                    :branches-percent="tenant.branches_usage_percent"
                  />
                </td>
                <td>
                  <span class="date-text">{{ formatDate(tenant.date_created) }}</span>
                </td>
                <td>
                  <NuxtLink :to="`/admin/tenants/${tenant.id}`" class="btn-link">
                    查看詳情 →
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Empty State -->
          <div v-if="filteredTenants.length === 0" class="empty-state">
            <p>沒有找到租戶</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-dashboard {
  max-width: 1600px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-2xl);
}

.header-content h1 {
  margin: 0 0 var(--space-xs);
}

.header-content p {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn-primary,
.btn-secondary {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 12px 20px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  text-decoration: none;
  border: none;
}

.btn-primary {
  background: linear-gradient(180deg, #0077ed 0%, #0071e3 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3);
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-border);
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
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

/* KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.kpi-card {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  display: flex;
  gap: var(--space-md);
}

.kpi-card.warning {
  border-color: rgba(255, 204, 0, 0.3);
  background: rgba(255, 204, 0, 0.05);
}

.kpi-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon--blue {
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
}

.kpi-icon--green {
  background: linear-gradient(135deg, #34c759, #30d158);
  color: white;
}

.kpi-icon--orange {
  background: linear-gradient(135deg, #ff9500, #ffcc00);
  color: white;
}

.kpi-icon--purple {
  background: linear-gradient(135deg, #af52de, #5856d6);
  color: white;
}

.kpi-content {
  flex: 1;
}

.kpi-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0 0 4px;
}

.kpi-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1;
}

.kpi-subtext {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 4px 0 0;
}

/* Filters */
.filters-bar {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-glass);
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-md);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.filter-group label {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.filter-select {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 14px;
  cursor: pointer;
}

.filter-info {
  margin-left: auto;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Table */
.tenant-table-section {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-container {
  overflow-x: auto;
}

.tenant-table {
  width: 100%;
  border-collapse: collapse;
}

.tenant-table thead {
  background: var(--color-bg-tertiary);
}

.tenant-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.tenant-row {
  border-bottom: 0.5px solid var(--color-divider);
  transition: background var(--duration-fast) var(--ease-out);
}

.tenant-row:hover {
  background: var(--color-bg-tertiary);
}

.tenant-table td {
  padding: 16px;
  font-size: 14px;
}

.tenant-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.tenant-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.tenant-info {
  min-width: 0;
}

.tenant-name {
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 2px;
}

.tenant-email {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
}

.plan-badge {
  display: inline-block;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}

.badge-success {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.badge-warning {
  background: rgba(255, 204, 0, 0.15);
  color: #ff9500;
}

.badge-error {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
}

.badge-default {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.date-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.btn-link {
  color: var(--color-accent);
  font-weight: 600;
  text-decoration: none;
  font-size: 13px;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.btn-link:hover {
  opacity: 0.7;
}

/* Empty State */
.empty-state {
  padding: var(--space-3xl);
  text-align: center;
  color: var(--color-text-tertiary);
}
</style>
