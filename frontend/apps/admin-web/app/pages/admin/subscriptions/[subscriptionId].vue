<template>
  <div class="subscription-detail">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="subscription" class="content">
      <!-- Header -->
      <div class="page-header">
        <div>
          <NuxtLink to="/admin/subscriptions" class="back-link">
            ← 返回订阅列表
          </NuxtLink>
          <h1>订阅详情</h1>
        </div>
        <div class="actions">
          <button
            v-if="subscription.status === 'active'"
            class="btn-danger"
            @click="cancelSubscription"
          >
            取消订阅
          </button>
        </div>
      </div>

      <!-- Subscription Info -->
      <div class="card">
        <div class="card-header">
          <h2>订阅信息</h2>
          <span :class="`status-badge status-${subscription.status}`">
            {{ getStatusLabel(subscription.status) }}
          </span>
        </div>
        <div class="card-body">
          <div class="info-grid">
            <div class="info-item">
              <label>租户</label>
              <div>{{ subscription.tenant_name }}</div>
            </div>
            <div class="info-item">
              <label>套餐类型</label>
              <div>
                <span :class="`plan-badge plan-${subscription.plan_type}`">
                  {{ getPlanLabel(subscription.plan_type) }}
                </span>
              </div>
            </div>
            <div class="info-item">
              <label>计费周期</label>
              <div>{{ subscription.billing_cycle === 'monthly' ? '月付' : '年付' }}</div>
            </div>
            <div class="info-item">
              <label>当前周期开始</label>
              <div>{{ formatDate(subscription.current_period_start) }}</div>
            </div>
            <div class="info-item">
              <label>当前周期结束</label>
              <div>{{ formatDate(subscription.current_period_end) }}</div>
            </div>
            <div class="info-item">
              <label>周期结束时取消</label>
              <div>{{ subscription.cancel_at_period_end ? '是' : '否' }}</div>
            </div>
            <div class="info-item">
              <label>月度价格</label>
              <div>{{ formatCurrency(subscription.monthly_price) }}</div>
            </div>
            <div class="info-item">
              <label>年度价格</label>
              <div>{{ formatCurrency(subscription.yearly_price) }}</div>
            </div>
            <div class="info-item">
              <label>创建时间</label>
              <div>{{ formatDateTime(subscription.date_created) }}</div>
            </div>
            <div class="info-item">
              <label>更新时间</label>
              <div>{{ formatDateTime(subscription.date_updated) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Invoices -->
      <div class="card">
        <div class="card-header">
          <h2>相关账单</h2>
        </div>
        <div class="card-body">
          <div v-if="loadingInvoices" class="loading-mini">加载中...</div>
          <div v-else-if="invoices.length === 0" class="empty-mini">
            暂无账单记录
          </div>
          <div v-else class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>账单编号</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>到期日</th>
                  <th>付款日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="invoice in invoices" :key="invoice.id">
                  <td>{{ invoice.invoice_number }}</td>
                  <td>{{ formatCurrency(invoice.amount_total) }}</td>
                  <td>
                    <span :class="`status-badge status-${invoice.status}`">
                      {{ getInvoiceStatusLabel(invoice.status) }}
                    </span>
                  </td>
                  <td>{{ formatDate(invoice.due_date) }}</td>
                  <td>{{ invoice.paid_at ? formatDate(invoice.paid_at) : '-' }}</td>
                  <td class="actions">
                    <NuxtLink
                      :to="`/admin/invoices/${invoice.id}`"
                      class="btn-text"
                    >
                      查看
                    </NuxtLink>
                    <a
                      :href="`${apiBaseUrl}/gym/billing/invoices/${invoice.id}/pdf`"
                      target="_blank"
                      class="btn-text"
                    >
                      下载
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Usage Records -->
      <div class="card">
        <div class="card-header">
          <h2>使用量记录</h2>
        </div>
        <div class="card-body">
          <div v-if="loadingUsage" class="loading-mini">加载中...</div>
          <div v-else-if="usageRecords.length === 0" class="empty-mini">
            暂无使用量记录
          </div>
          <div v-else class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>会员数</th>
                  <th>员工数</th>
                  <th>门店数</th>
                  <th>活跃合约数</th>
                  <th>存储空间 (MB)</th>
                  <th>日收入</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in usageRecords" :key="record.id">
                  <td>{{ formatDate(record.record_date) }}</td>
                  <td>{{ record.members_count || 0 }}</td>
                  <td>{{ record.employees_count || 0 }}</td>
                  <td>{{ record.branches_count || 0 }}</td>
                  <td>{{ record.active_contracts_count || 0 }}</td>
                  <td>{{ (record.storage_mb || 0).toFixed(2) }}</td>
                  <td>{{ formatCurrency(record.daily_revenue) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useRuntimeConfig } from '#app'

const route = useRoute()
const { apiCall } = useAuth()
const config = useRuntimeConfig()

const subscriptionId = computed(() => route.params.subscriptionId)
const apiBaseUrl = computed(() => config.public.apiBaseUrl || '')

const subscription = ref(null)
const invoices = ref([])
const usageRecords = ref([])
const loading = ref(false)
const loadingInvoices = ref(false)
const loadingUsage = ref(false)
const error = ref(null)

const loadSubscription = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await apiCall(`/gym/billing/subscriptions?subscription_id=${subscriptionId.value}`)
    if (response.success && response.data.subscriptions.length > 0) {
      subscription.value = response.data.subscriptions[0]
    } else {
      error.value = '订阅不存在'
    }
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const loadInvoices = async () => {
  loadingInvoices.value = true
  try {
    const tenantId = subscription.value?.tenant_id
    if (!tenantId) return

    const response = await apiCall(`/gym/billing/invoices?tenant_id=${tenantId}`)
    if (response.success) {
      // Filter invoices for this subscription
      invoices.value = response.data.invoices.filter(
        inv => inv.subscription_id === subscriptionId.value
      )
    }
  } catch (err) {
    console.error('Failed to load invoices:', err)
  } finally {
    loadingInvoices.value = false
  }
}

const loadUsageRecords = async () => {
  loadingUsage.value = true
  try {
    const tenantId = subscription.value?.tenant_id
    if (!tenantId) return

    const response = await apiCall(`/gym/billing/usage-records?tenant_id=${tenantId}&limit=30`)
    if (response.success) {
      usageRecords.value = response.data.records
    }
  } catch (err) {
    console.error('Failed to load usage records:', err)
  } finally {
    loadingUsage.value = false
  }
}

const cancelSubscription = async () => {
  if (!confirm('确定要取消此订阅吗？订阅将在当前周期结束后停止。')) return

  try {
    const response = await apiCall(`/gym/billing/subscriptions/${subscriptionId.value}/cancel`, {
      method: 'PATCH'
    })

    if (response.success) {
      await loadSubscription()
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

const getInvoiceStatusLabel = (status) => {
  const labels = {
    draft: '草稿',
    open: '待付款',
    paid: '已付款',
    void: '作废',
    uncollectible: '无法收款'
  }
  return labels[status] || status
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-TW')
}

const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD'
  }).format(amount)
}

onMounted(async () => {
  await loadSubscription()
  if (subscription.value) {
    loadInvoices()
    loadUsageRecords()
  }
})
</script>

<style scoped>
.subscription-detail {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.back-link {
  display: inline-block;
  color: #0071e3;
  text-decoration: none;
  font-size: 14px;
  margin-bottom: 8px;
}

.back-link:hover {
  text-decoration: underline;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.card {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #dee2e6;
}

.card-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.card-body {
  padding: 20px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.info-item label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}

.info-item div {
  font-size: 14px;
  color: #333;
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

.status-open {
  background: #fff3cd;
  color: #856404;
}

.status-paid {
  background: #d4edda;
  color: #155724;
}

.table-container {
  overflow-x: auto;
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

.btn-danger {
  padding: 8px 16px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-danger:hover {
  background: #c82333;
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

.loading-mini,
.empty-mini {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
