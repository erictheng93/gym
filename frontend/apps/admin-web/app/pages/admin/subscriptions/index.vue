<template>
  <div class="subscriptions-page">
    <div class="page-header">
      <h1>订阅管理</h1>
      <button @click="showCreateModal = true" class="btn-primary">
        创建订阅
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-group">
        <label>租户</label>
        <select v-model="filters.tenantId" @change="loadSubscriptions">
          <option value="">全部租户</option>
          <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
            {{ tenant.name }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>状态</label>
        <select v-model="filters.status" @change="loadSubscriptions">
          <option value="">全部状态</option>
          <option value="active">活跃</option>
          <option value="canceled">已取消</option>
          <option value="past_due">逾期</option>
        </select>
      </div>
      <div class="filter-group">
        <label>套餐类型</label>
        <select v-model="filters.planType" @change="loadSubscriptions">
          <option value="">全部套餐</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
    </div>

    <!-- Subscriptions Table -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>租户</th>
            <th>套餐类型</th>
            <th>计费周期</th>
            <th>状态</th>
            <th>当前周期</th>
            <th>月度价格</th>
            <th>年度价格</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="subscription in subscriptions" :key="subscription.id">
            <td>{{ subscription.tenant_name }}</td>
            <td>
              <span :class="`plan-badge plan-${subscription.plan_type}`">
                {{ getPlanLabel(subscription.plan_type) }}
              </span>
            </td>
            <td>{{ subscription.billing_cycle === 'monthly' ? '月付' : '年付' }}</td>
            <td>
              <span :class="`status-badge status-${subscription.status}`">
                {{ getStatusLabel(subscription.status) }}
              </span>
            </td>
            <td class="period">
              {{ formatDate(subscription.current_period_start) }} -
              {{ formatDate(subscription.current_period_end) }}
            </td>
            <td>{{ formatCurrency(subscription.monthly_price) }}</td>
            <td>{{ formatCurrency(subscription.yearly_price) }}</td>
            <td class="actions">
              <NuxtLink
                :to="`/admin/subscriptions/${subscription.id}`"
                class="btn-text"
              >
                查看
              </NuxtLink>
              <button
                v-if="subscription.status === 'active'"
                @click="cancelSubscription(subscription.id)"
                class="btn-text text-danger"
              >
                取消
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="subscriptions.length === 0" class="empty-state">
        暂无订阅数据
      </div>
    </div>

    <!-- Create Subscription Modal -->
    <AppModal v-if="showCreateModal" @close="showCreateModal = false">
      <template #header>创建订阅</template>
      <template #default>
        <form @submit.prevent="createSubscription" class="form">
          <div class="form-group">
            <label>租户 *</label>
            <select v-model="newSubscription.tenant_id" required>
              <option value="">请选择租户</option>
              <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
                {{ tenant.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>套餐类型 *</label>
            <select v-model="newSubscription.plan_type" required>
              <option value="">请选择套餐</option>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div class="form-group">
            <label>计费周期 *</label>
            <select v-model="newSubscription.billing_cycle" required>
              <option value="monthly">月付</option>
              <option value="yearly">年付</option>
            </select>
          </div>
          <div class="form-group">
            <label>月度价格</label>
            <input
              v-model.number="newSubscription.monthly_price"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
          </div>
          <div class="form-group">
            <label>年度价格</label>
            <input
              v-model.number="newSubscription.yearly_price"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
          </div>
          <div class="form-actions">
            <button type="button" @click="showCreateModal = false" class="btn-secondary">
              取消
            </button>
            <button type="submit" class="btn-primary" :disabled="creatingSubscription">
              {{ creatingSubscription ? '创建中...' : '创建订阅' }}
            </button>
          </div>
        </form>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'

const { apiCall } = useAuth()

const subscriptions = ref([])
const tenants = ref([])
const loading = ref(false)
const error = ref(null)
const showCreateModal = ref(false)
const creatingSubscription = ref(false)

const filters = ref({
  tenantId: '',
  status: '',
  planType: ''
})

const newSubscription = ref({
  tenant_id: '',
  plan_type: '',
  billing_cycle: 'monthly',
  monthly_price: null,
  yearly_price: null
})

const loadTenants = async () => {
  try {
    const response = await apiCall('/gym/admin/tenants')
    if (response.success) {
      tenants.value = response.data.tenants
    }
  } catch (err) {
    console.error('Failed to load tenants:', err)
  }
}

const loadSubscriptions = async () => {
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams()
    if (filters.value.tenantId) params.append('tenant_id', filters.value.tenantId)
    if (filters.value.status) params.append('status', filters.value.status)
    if (filters.value.planType) params.append('plan_type', filters.value.planType)

    const response = await apiCall(`/gym/billing/subscriptions?${params.toString()}`)
    if (response.success) {
      subscriptions.value = response.data.subscriptions
    } else {
      error.value = response.message || '加载失败'
    }
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const createSubscription = async () => {
  creatingSubscription.value = true
  try {
    const response = await apiCall('/gym/billing/subscriptions', {
      method: 'POST',
      body: JSON.stringify(newSubscription.value)
    })

    if (response.success) {
      showCreateModal.value = false
      newSubscription.value = {
        tenant_id: '',
        plan_type: '',
        billing_cycle: 'monthly',
        monthly_price: null,
        yearly_price: null
      }
      await loadSubscriptions()
    } else {
      alert(response.message || '创建失败')
    }
  } catch (err) {
    alert(err.message || '创建失败')
  } finally {
    creatingSubscription.value = false
  }
}

const cancelSubscription = async (subscriptionId) => {
  if (!confirm('确定要取消此订阅吗？')) return

  try {
    const response = await apiCall(`/gym/billing/subscriptions/${subscriptionId}/cancel`, {
      method: 'PATCH'
    })

    if (response.success) {
      await loadSubscriptions()
    } else {
      alert(response.message || '取消失败')
    }
  } catch (err) {
    alert(err.message || '取消失败')
  }
}

const getPlanLabel = (planType) => {
  const labels = {
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise'
  }
  return labels[planType] || planType
}

const getStatusLabel = (status) => {
  const labels = {
    active: '活跃',
    canceled: '已取消',
    past_due: '逾期'
  }
  return labels[status] || status
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD'
  }).format(amount)
}

onMounted(() => {
  loadTenants()
  loadSubscriptions()
})
</script>

<style scoped>
.subscriptions-page {
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
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-group label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.filter-group select {
  padding: 6px 12px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
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

.plan-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.plan-starter {
  background: #e3f2fd;
  color: #1976d2;
}

.plan-professional {
  background: #f3e5f5;
  color: #7b1fa2;
}

.plan-enterprise {
  background: #fff3e0;
  color: #f57c00;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-active {
  background: #d4edda;
  color: #155724;
}

.status-canceled {
  background: #f8d7da;
  color: #721c24;
}

.status-past_due {
  background: #fff3cd;
  color: #856404;
}

.period {
  font-size: 13px;
  color: #666;
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
  text-decoration: none;
  padding: 0;
}

.btn-text:hover {
  text-decoration: underline;
}

.text-danger {
  color: #dc3545;
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

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.form-group input,
.form-group select {
  padding: 8px 12px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #0071e3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f8f9fa;
  color: #333;
  border: 1px solid #dee2e6;
}

.btn-secondary:hover {
  background: #e2e6ea;
}
</style>
