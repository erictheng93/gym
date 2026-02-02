<script setup lang="ts">
/**
 * Tenant Detail Page
 * 租戶詳情頁面
 */

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const apiBaseUrl = config.public?.apiBaseUrl || 'http://localhost:8056'

const tenantId = route.params.tenantId as string

const tenant = ref<any>(null)
const isLoading = ref(true)
const isEditing = ref(false)
const isSaving = ref(false)
const isChangingStatus = ref(false)
const showStatusDialog = ref(false)
const newStatus = ref<string>('')

// Edit form
const editForm = ref({
  name: '',
  email: '',
  phone: '',
  max_members: 0,
  max_employees: 0,
  max_branches: 0,
  billing_cycle: 'monthly'
})

// Fetch tenant details
const fetchTenantDetails = async () => {
  isLoading.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const result = await response.json()

    if (result.success) {
      tenant.value = result.tenant
    }
  } catch (error) {
    console.error('Failed to fetch tenant details:', error)
    useToast().error('載入租戶詳情失敗')
    router.push('/admin/tenants')
  } finally {
    isLoading.value = false
  }
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

// Format date
const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format number
const formatNumber = (num: number) => {
  return new Intl.NumberFormat('zh-TW').format(num)
}

// Check if trial is expiring soon
const isTrialExpiringSoon = computed(() => {
  if (!tenant.value?.trial_ends_at) return false
  const daysUntilExpiry = Math.ceil(
    (new Date(tenant.value.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  return daysUntilExpiry <= 7 && daysUntilExpiry > 0
})

const isTrialExpired = computed(() => {
  if (!tenant.value?.trial_ends_at) return false
  return new Date(tenant.value.trial_ends_at) < new Date()
})

// Enable edit mode
const enableEdit = () => {
  if (!tenant.value) return

  editForm.value = {
    name: tenant.value.name,
    email: tenant.value.email,
    phone: tenant.value.phone || '',
    max_members: tenant.value.max_members,
    max_employees: tenant.value.max_employees,
    max_branches: tenant.value.max_branches,
    billing_cycle: tenant.value.billing_cycle || 'monthly'
  }

  isEditing.value = true
}

// Cancel edit
const cancelEdit = () => {
  isEditing.value = false
}

// Save edit
const saveEdit = async () => {
  isSaving.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(editForm.value),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const result = await response.json()

    if (result.success) {
      useToast().success('租户信息已更新')
      isEditing.value = false
      await fetchTenantDetails()
    } else {
      useToast().error(result.message || '更新失败')
    }
  } catch (error) {
    console.error('Failed to update tenant:', error)
    useToast().error('更新租户信息时发生错误')
  } finally {
    isSaving.value = false
  }
}

// Open status change dialog
const openStatusDialog = (status: string) => {
  newStatus.value = status
  showStatusDialog.value = true
}

// Change tenant status
const changeStatus = async () => {
  if (!newStatus.value) return

  isChangingStatus.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/tenants/${tenantId}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus.value }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const result = await response.json()

    if (result.success) {
      useToast().success('租户状态已更新')
      showStatusDialog.value = false
      await fetchTenantDetails()
    } else {
      useToast().error(result.message || '状态更新失败')
    }
  } catch (error) {
    console.error('Failed to change tenant status:', error)
    useToast().error('更新租户状态时发生错误')
  } finally {
    isChangingStatus.value = false
  }
}

// Load data on mount
onMounted(() => {
  fetchTenantDetails()
})
</script>

<template>
  <div class="tenant-detail">
    <!-- Header -->
    <header class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        返回列表
      </button>

      <!-- Action Buttons -->
      <div v-if="tenant && !isLoading" class="header-actions">
        <template v-if="isEditing">
          <button class="btn-secondary" :disabled="isSaving" @click="cancelEdit">
            取消
          </button>
          <button class="btn-primary" :disabled="isSaving" @click="saveEdit">
            <div v-if="isSaving" class="spinner-sm" />
            {{ isSaving ? '保存中...' : '保存变更' }}
          </button>
        </template>
        <template v-else>
          <button class="btn-secondary" @click="enableEdit">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            编辑
          </button>
        </template>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="spinner" />
      <p>載入租戶詳情中...</p>
    </div>

    <template v-else-if="tenant">
      <!-- Tenant Info Card -->
      <section class="info-card">
        <div class="info-header">
          <div class="tenant-avatar-large">{{ isEditing ? editForm.name[0] : tenant.name[0] }}</div>
          <div class="info-content">
            <template v-if="isEditing">
              <input
                v-model="editForm.name"
                type="text"
                class="tenant-title-input"
                placeholder="租户名称"
              />
              <div class="tenant-meta">
                <span class="tenant-slug">{{ tenant.slug }}</span>
                <input
                  v-model="editForm.email"
                  type="email"
                  class="tenant-email-input"
                  placeholder="电子邮件"
                />
              </div>
            </template>
            <template v-else>
              <h1 class="tenant-title">{{ tenant.name }}</h1>
              <div class="tenant-meta">
                <span class="tenant-slug">{{ tenant.slug }}</span>
                <span class="tenant-email">{{ tenant.email }}</span>
              </div>
            </template>
          </div>
          <div class="info-badges">
            <span class="plan-badge-large">{{ getPlanLabel(tenant.plan_type) }}</span>
            <div class="status-dropdown">
              <span class="status-badge" :class="getStatusBadge(tenant.tenant_status).class">
                {{ getStatusBadge(tenant.tenant_status).label }}
              </span>
              <div v-if="!isEditing" class="status-menu">
                <button
                  v-if="tenant.tenant_status !== 'active'"
                  class="status-option"
                  @click="openStatusDialog('active')"
                >
                  切换至正常
                </button>
                <button
                  v-if="tenant.tenant_status !== 'suspended'"
                  class="status-option"
                  @click="openStatusDialog('suspended')"
                >
                  暂停租户
                </button>
                <button
                  v-if="tenant.tenant_status !== 'trial'"
                  class="status-option"
                  @click="openStatusDialog('trial')"
                >
                  切换至试用
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Trial Warning -->
        <div v-if="isTrialExpired" class="alert alert-error">
          ⚠️ 試用期已過期
        </div>
        <div v-else-if="isTrialExpiringSoon" class="alert alert-warning">
          ⏰ 試用期即將到期: {{ formatDate(tenant.trial_ends_at) }}
        </div>

        <!-- Info Grid -->
        <div class="info-grid">
          <div class="info-item">
            <p class="info-label">建立日期</p>
            <p class="info-value">{{ formatDate(tenant.date_created) }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">電話</p>
            <template v-if="isEditing">
              <input
                v-model="editForm.phone"
                type="tel"
                class="info-input"
                placeholder="電話號碼"
              />
            </template>
            <p v-else class="info-value">{{ tenant.phone || '-' }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">計費週期</p>
            <template v-if="isEditing">
              <select v-model="editForm.billing_cycle" class="info-select">
                <option value="monthly">月付</option>
                <option value="yearly">年付</option>
              </select>
            </template>
            <p v-else class="info-value">{{ tenant.billing_cycle === 'monthly' ? '月付' : '年付' }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">活躍合約</p>
            <p class="info-value">{{ tenant.usage?.activeContracts || 0 }} 個</p>
          </div>
        </div>

        <!-- Quota Edit in Edit Mode -->
        <div v-if="isEditing" class="quota-edit-section">
          <h3 class="quota-edit-title">配額設置</h3>
          <div class="quota-edit-grid">
            <div class="quota-edit-item">
              <label class="quota-edit-label">最大會員數</label>
              <input
                v-model.number="editForm.max_members"
                type="number"
                class="quota-edit-input"
                min="1"
              />
            </div>
            <div class="quota-edit-item">
              <label class="quota-edit-label">最大員工數</label>
              <input
                v-model.number="editForm.max_employees"
                type="number"
                class="quota-edit-input"
                min="1"
              />
            </div>
            <div class="quota-edit-item">
              <label class="quota-edit-label">最大分店數</label>
              <input
                v-model.number="editForm.max_branches"
                type="number"
                class="quota-edit-input"
                min="1"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Quota Cards -->
      <section class="quota-section">
        <h2 class="section-title">配額使用情況</h2>
        <div class="quota-grid">
          <!-- Members Quota -->
          <div class="quota-card">
            <div class="quota-header">
              <div class="quota-icon quota-icon--blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 class="quota-title">會員數</h3>
            </div>
            <p class="quota-current">{{ formatNumber(tenant.usage?.members.current || 0) }}</p>
            <p class="quota-limit">/ {{ formatNumber(tenant.usage?.members.limit || 0) }}</p>
            <QuotaBar
              :current="tenant.usage?.members.current || 0"
              :limit="tenant.usage?.members.limit || 0"
            />
          </div>

          <!-- Employees Quota -->
          <div class="quota-card">
            <div class="quota-header">
              <div class="quota-icon quota-icon--green">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <h3 class="quota-title">員工數</h3>
            </div>
            <p class="quota-current">{{ formatNumber(tenant.usage?.employees.current || 0) }}</p>
            <p class="quota-limit">/ {{ formatNumber(tenant.usage?.employees.limit || 0) }}</p>
            <QuotaBar
              :current="tenant.usage?.employees.current || 0"
              :limit="tenant.usage?.employees.limit || 0"
            />
          </div>

          <!-- Branches Quota -->
          <div class="quota-card">
            <div class="quota-header">
              <div class="quota-icon quota-icon--purple">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
              <h3 class="quota-title">分店數</h3>
            </div>
            <p class="quota-current">{{ formatNumber(tenant.usage?.branches.current || 0) }}</p>
            <p class="quota-limit">/ {{ formatNumber(tenant.usage?.branches.limit || 0) }}</p>
            <QuotaBar
              :current="tenant.usage?.branches.current || 0"
              :limit="tenant.usage?.branches.limit || 0"
            />
          </div>
        </div>
      </section>

      <!-- Branches List -->
      <section v-if="tenant.branches?.length > 0" class="branches-section">
        <h2 class="section-title">分店列表</h2>
        <div class="table-card">
          <table class="simple-table">
            <thead>
              <tr>
                <th>分店名稱</th>
                <th>地址</th>
                <th>狀態</th>
                <th>建立日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="branch in tenant.branches" :key="branch.id">
                <td class="font-medium">{{ branch.name }}</td>
                <td>{{ branch.address || '-' }}</td>
                <td>
                  <span class="status-badge" :class="branch.status === 'active' ? 'badge-success' : 'badge-default'">
                    {{ branch.status === 'active' ? '活躍' : branch.status }}
                  </span>
                </td>
                <td class="text-secondary">{{ formatDate(branch.date_created) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Recent Activity -->
      <section v-if="tenant.recentActivity?.length > 0" class="activity-section">
        <h2 class="section-title">最近活動</h2>
        <div class="table-card">
          <table class="simple-table">
            <thead>
              <tr>
                <th>會員姓名</th>
                <th>會員編號</th>
                <th>分店</th>
                <th>加入日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="activity in tenant.recentActivity" :key="activity.id">
                <td class="font-medium">{{ activity.full_name }}</td>
                <td class="text-secondary">{{ activity.member_code }}</td>
                <td>{{ activity.branch_name }}</td>
                <td class="text-secondary">{{ formatDate(activity.date_created) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- Status Change Dialog -->
    <div v-if="showStatusDialog" class="dialog-overlay" @click="showStatusDialog = false">
      <div class="dialog-content" @click.stop>
        <h3 class="dialog-title">確認狀態變更</h3>
        <p class="dialog-message">
          確定要將租戶狀態切換至 <strong>{{ getStatusBadge(newStatus).label }}</strong> 嗎？
        </p>
        <div class="dialog-actions">
          <button class="btn-secondary" :disabled="isChangingStatus" @click="showStatusDialog = false">
            取消
          </button>
          <button class="btn-primary" :disabled="isChangingStatus" @click="changeStatus">
            <div v-if="isChangingStatus" class="spinner-sm" />
            {{ isChangingStatus ? '變更中...' : '確定變更' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tenant-detail {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.page-header {
  margin-bottom: var(--space-xl);
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.back-btn:hover {
  background: var(--color-accent-light);
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

/* Info Card */
.info-card {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-2xl);
  margin-bottom: var(--space-2xl);
}

.info-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.tenant-avatar-large {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 700;
  flex-shrink: 0;
}

.info-content {
  flex: 1;
}

.tenant-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 var(--space-sm);
  color: var(--color-text-primary);
}

.tenant-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.tenant-slug {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-family: monospace;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.tenant-email {
  font-size: 14px;
  color: var(--color-text-tertiary);
}

.info-badges {
  display: flex;
  gap: var(--space-sm);
}

.plan-badge-large {
  padding: 8px 16px;
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
}

.status-badge {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
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

/* Alerts */
.alert {
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: var(--space-lg);
}

.alert-warning {
  background: rgba(255, 204, 0, 0.15);
  color: #ff9500;
  border: 1.5px solid rgba(255, 204, 0, 0.3);
}

.alert-error {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
  border: 1.5px solid rgba(255, 59, 48, 0.3);
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-lg);
}

.info-item {
  padding: var(--space-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.info-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 4px;
}

.info-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

/* Quota Section */
.quota-section {
  margin-bottom: var(--space-2xl);
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 var(--space-lg);
  color: var(--color-text-primary);
}

.quota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.quota-card {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.quota-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.quota-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.quota-icon--blue {
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
}

.quota-icon--green {
  background: linear-gradient(135deg, #34c759, #30d158);
  color: white;
}

.quota-icon--purple {
  background: linear-gradient(135deg, #af52de, #5856d6);
  color: white;
}

.quota-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0;
}

.quota-current {
  font-size: 36px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1;
}

.quota-limit {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: 4px 0 var(--space-md);
}

/* Tables */
.branches-section,
.activity-section {
  margin-bottom: var(--space-2xl);
}

.table-card {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.simple-table {
  width: 100%;
  border-collapse: collapse;
}

.simple-table thead {
  background: var(--color-bg-tertiary);
}

.simple-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.simple-table td {
  padding: 14px 16px;
  font-size: 14px;
  border-top: 0.5px solid var(--color-divider);
}

.font-medium {
  font-weight: 600;
  color: var(--color-text-primary);
}

.text-secondary {
  color: var(--color-text-secondary);
}

/* Header Actions */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  border: none;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.btn-primary {
  background: linear-gradient(180deg, #0077ed 0%, #0071e3 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-border);
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Edit Mode Inputs */
.tenant-title-input {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  margin: 0 0 var(--space-sm);
  width: 100%;
}

.tenant-title-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.tenant-email-input {
  font-size: 14px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
}

.tenant-email-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.info-input,
.info-select {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}

.info-input:focus,
.info-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* Status Dropdown */
.status-dropdown {
  position: relative;
  display: inline-block;
}

.status-dropdown:hover .status-menu {
  display: block;
}

.status-menu {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 10;
  min-width: 150px;
}

.status-option {
  display: block;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.status-option:hover {
  background: var(--color-bg-tertiary);
}

/* Quota Edit Section */
.quota-edit-section {
  margin-top: var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 0.5px solid var(--color-divider);
}

.quota-edit-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--space-md);
  color: var(--color-text-primary);
}

.quota-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-md);
}

.quota-edit-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.quota-edit-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.quota-edit-input {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 600;
}

.quota-edit-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog-content {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 var(--space-md);
  color: var(--color-text-primary);
}

.dialog-message {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-xl);
  line-height: 1.5;
}

.dialog-message strong {
  color: var(--color-text-primary);
  font-weight: 600;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>
