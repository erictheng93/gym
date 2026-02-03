<template>
  <div class="invoices-page">
    <div class="page-header">
      <h1>账单管理</h1>
      <button class="btn-primary" @click="showCreateModal = true">
        创建账单
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-group">
        <label>租户</label>
        <select v-model="filters.tenantId" @change="loadInvoices">
          <option value="">全部租户</option>
          <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
            {{ tenant.name }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>状态</label>
        <select v-model="filters.status" @change="loadInvoices">
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="open">待付款</option>
          <option value="paid">已付款</option>
          <option value="void">作废</option>
          <option value="uncollectible">无法收款</option>
        </select>
      </div>
    </div>

    <!-- Invoices Table -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>账单编号</th>
            <th>租户</th>
            <th>金额</th>
            <th>状态</th>
            <th>到期日</th>
            <th>计费周期</th>
            <th>付款日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invoice in invoices" :key="invoice.id">
            <td class="invoice-number">{{ invoice.invoice_number }}</td>
            <td>{{ invoice.tenant_name || '-' }}</td>
            <td class="amount">{{ formatCurrency(invoice.amount_total) }}</td>
            <td>
              <span :class="`status-badge status-${invoice.status}`">
                {{ getStatusLabel(invoice.status) }}
              </span>
            </td>
            <td :class="{'overdue': isOverdue(invoice)}">
              {{ formatDate(invoice.due_date) }}
              <span v-if="isOverdue(invoice)" class="overdue-badge">逾期</span>
            </td>
            <td class="period">
              {{ formatDate(invoice.period_start) }} -
              {{ formatDate(invoice.period_end) }}
            </td>
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
              <button
                v-if="invoice.status === 'open'"
                class="btn-text"
                @click="markAsPaid(invoice.id)"
              >
                标记已付款
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="invoices.length === 0" class="empty-state">
        暂无账单数据
      </div>
    </div>

    <!-- Create Invoice Modal -->
    <AppModal v-if="showCreateModal" @close="showCreateModal = false">
      <template #header>创建账单</template>
      <template #default>
        <form class="form" @submit.prevent="createInvoice">
          <div class="form-group">
            <label>租户 *</label>
            <select v-model="newInvoice.tenant_id" required>
              <option value="">请选择租户</option>
              <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
                {{ tenant.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>订阅（可选）</label>
            <select v-model="newInvoice.subscription_id">
              <option value="">无关联订阅</option>
              <option
                v-for="sub in subscriptions"
                :key="sub.id"
                :value="sub.id"
                :disabled="!newInvoice.tenant_id || sub.tenant_id !== newInvoice.tenant_id"
              >
                {{ sub.plan_type }} - {{ sub.billing_cycle }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>小计金额 *</label>
            <input
              v-model.number="newInvoice.amount_subtotal"
              type="number"
              step="0.01"
              required
              placeholder="0.00"
            />
          </div>
          <div class="form-group">
            <label>税费</label>
            <input
              v-model.number="newInvoice.amount_tax"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
          </div>
          <div class="form-group">
            <label>到期日 *</label>
            <input
              v-model="newInvoice.due_date"
              type="date"
              required
            />
          </div>
          <div class="form-group">
            <label>计费周期开始</label>
            <input v-model="newInvoice.period_start" type="date" />
          </div>
          <div class="form-group">
            <label>计费周期结束</label>
            <input v-model="newInvoice.period_end" type="date" />
          </div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="showCreateModal = false">
              取消
            </button>
            <button type="submit" class="btn-primary" :disabled="creatingInvoice">
              {{ creatingInvoice ? '创建中...' : '创建账单' }}
            </button>
          </div>
        </form>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useRuntimeConfig } from '#app'

const { apiCall } = useAuth()
const config = useRuntimeConfig()

const apiBaseUrl = computed(() => config.public.apiBase || '')

const invoices = ref([])
const tenants = ref([])
const subscriptions = ref([])
const loading = ref(false)
const error = ref(null)
const showCreateModal = ref(false)
const creatingInvoice = ref(false)

const filters = ref({
  tenantId: '',
  status: ''
})

const newInvoice = ref({
  tenant_id: '',
  subscription_id: '',
  amount_subtotal: null,
  amount_tax: null,
  due_date: '',
  period_start: '',
  period_end: ''
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
  try {
    const response = await apiCall('/gym/billing/subscriptions')
    if (response.success) {
      subscriptions.value = response.data.subscriptions
    }
  } catch (err) {
    console.error('Failed to load subscriptions:', err)
  }
}

const loadInvoices = async () => {
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams()
    if (filters.value.tenantId) params.append('tenant_id', filters.value.tenantId)
    if (filters.value.status) params.append('status', filters.value.status)

    const response = await apiCall(`/gym/billing/invoices?${params.toString()}`)
    if (response.success) {
      invoices.value = response.data.invoices
    } else {
      error.value = response.message || '加载失败'
    }
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const createInvoice = async () => {
  creatingInvoice.value = true
  try {
    const response = await apiCall('/gym/billing/invoices', {
      method: 'POST',
      body: JSON.stringify(newInvoice.value)
    })

    if (response.success) {
      showCreateModal.value = false
      newInvoice.value = {
        tenant_id: '',
        subscription_id: '',
        amount_subtotal: null,
        amount_tax: null,
        due_date: '',
        period_start: '',
        period_end: ''
      }
      await loadInvoices()
    } else {
      alert(response.message || '创建失败')
    }
  } catch (err) {
    alert(err.message || '创建失败')
  } finally {
    creatingInvoice.value = false
  }
}

const markAsPaid = async (invoiceId) => {
  if (!confirm('确定要标记此账单为已付款吗？')) return

  try {
    const response = await apiCall(`/gym/billing/invoices/${invoiceId}/pay`, {
      method: 'PATCH',
      body: JSON.stringify({
        payment_method: 'manual'
      })
    })

    if (response.success) {
      await loadInvoices()
    } else {
      alert(response.message || '操作失败')
    }
  } catch (err) {
    alert(err.message || '操作失败')
  }
}

const isOverdue = (invoice) => {
  if (invoice.status !== 'open') return false
  if (!invoice.due_date) return false
  return new Date(invoice.due_date) < new Date()
}

const getStatusLabel = (status) => {
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
  loadInvoices()
})
</script>

<style scoped>
.invoices-page {
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

.invoice-number {
  font-family: 'Courier New', monospace;
  font-weight: 500;
}

.amount {
  font-weight: 500;
}

.period {
  font-size: 13px;
  color: #666;
}

.overdue {
  color: #dc3545;
}

.overdue-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 2px 6px;
  background: #f8d7da;
  color: #721c24;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-draft {
  background: #e2e3e5;
  color: #383d41;
}

.status-open {
  background: #fff3cd;
  color: #856404;
}

.status-paid {
  background: #d4edda;
  color: #155724;
}

.status-void {
  background: #f8d7da;
  color: #721c24;
}

.status-uncollectible {
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
  text-decoration: none;
  padding: 0;
}

.btn-text:hover {
  text-decoration: underline;
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
