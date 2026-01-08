<template>
  <div class="invoice-detail">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="invoice" class="content">
      <!-- Header -->
      <div class="page-header">
        <div>
          <NuxtLink to="/admin/invoices" class="back-link">
            ← 返回账单列表
          </NuxtLink>
          <h1>账单详情</h1>
        </div>
        <div class="actions">
          <a
            :href="`${apiBaseUrl}/gym/billing/invoices/${invoice.id}/pdf`"
            target="_blank"
            class="btn-secondary"
          >
            下载 PDF
          </a>
          <button
            v-if="invoice.status === 'open'"
            @click="markAsPaid"
            class="btn-primary"
          >
            标记已付款
          </button>
        </div>
      </div>

      <!-- Invoice Header Info -->
      <div class="invoice-card">
        <div class="invoice-header">
          <div class="invoice-info">
            <h2 class="invoice-number">{{ invoice.invoice_number }}</h2>
            <span :class="`status-badge status-${invoice.status}`">
              {{ getStatusLabel(invoice.status) }}
            </span>
          </div>
          <div class="invoice-amount">
            <div class="amount-label">总计</div>
            <div class="amount-value">{{ formatCurrency(invoice.amount_total) }}</div>
          </div>
        </div>

        <div class="invoice-body">
          <div class="info-grid">
            <div class="info-section">
              <h3>账单信息</h3>
              <div class="info-item">
                <label>账单编号</label>
                <div>{{ invoice.invoice_number }}</div>
              </div>
              <div class="info-item">
                <label>创建日期</label>
                <div>{{ formatDate(invoice.date_created) }}</div>
              </div>
              <div class="info-item">
                <label>到期日</label>
                <div :class="{'text-danger': isOverdue}">
                  {{ formatDate(invoice.due_date) }}
                  <span v-if="isOverdue" class="overdue-badge">逾期</span>
                </div>
              </div>
              <div class="info-item">
                <label>计费周期</label>
                <div>
                  {{ formatDate(invoice.period_start) }} -
                  {{ formatDate(invoice.period_end) }}
                </div>
              </div>
            </div>

            <div class="info-section">
              <h3>付款信息</h3>
              <div class="info-item">
                <label>状态</label>
                <div>
                  <span :class="`status-badge status-${invoice.status}`">
                    {{ getStatusLabel(invoice.status) }}
                  </span>
                </div>
              </div>
              <div v-if="invoice.paid_at" class="info-item">
                <label>付款日期</label>
                <div>{{ formatDate(invoice.paid_at) }}</div>
              </div>
              <div v-if="invoice.payment_method" class="info-item">
                <label>付款方式</label>
                <div>{{ invoice.payment_method }}</div>
              </div>
              <div v-if="invoice.payment_transaction_id" class="info-item">
                <label>交易ID</label>
                <div class="transaction-id">{{ invoice.payment_transaction_id }}</div>
              </div>
            </div>

            <div class="info-section">
              <h3>客户信息</h3>
              <div class="info-item">
                <label>租户名称</label>
                <div>{{ invoice.tenant_name || '-' }}</div>
              </div>
              <div v-if="invoice.plan_type" class="info-item">
                <label>套餐类型</label>
                <div>
                  <span :class="`plan-badge plan-${invoice.plan_type}`">
                    {{ getPlanLabel(invoice.plan_type) }}
                  </span>
                </div>
              </div>
              <div v-if="invoice.billing_cycle" class="info-item">
                <label>计费周期</label>
                <div>{{ invoice.billing_cycle === 'monthly' ? '月付' : '年付' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Line Items -->
      <div class="card">
        <div class="card-header">
          <h2>账单明细</h2>
        </div>
        <div class="card-body">
          <div v-if="lineItems.length === 0" class="empty-mini">
            无明细项目
          </div>
          <div v-else class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>项目说明</th>
                  <th class="text-right">数量</th>
                  <th class="text-right">单价</th>
                  <th class="text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in lineItems" :key="index">
                  <td>{{ item.description || '-' }}</td>
                  <td class="text-right">{{ item.quantity || 1 }}</td>
                  <td class="text-right">{{ formatCurrency(item.unit_price) }}</td>
                  <td class="text-right">{{ formatCurrency(item.amount) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="subtotal-row">
                  <td colspan="3" class="text-right"><strong>小计</strong></td>
                  <td class="text-right">{{ formatCurrency(invoice.amount_subtotal) }}</td>
                </tr>
                <tr class="tax-row">
                  <td colspan="3" class="text-right">税费</td>
                  <td class="text-right">{{ formatCurrency(invoice.amount_tax) }}</td>
                </tr>
                <tr class="total-row">
                  <td colspan="3" class="text-right"><strong>总计</strong></td>
                  <td class="text-right"><strong>{{ formatCurrency(invoice.amount_total) }}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Payment Transactions -->
      <div v-if="transactions.length > 0" class="card">
        <div class="card-header">
          <h2>支付记录</h2>
        </div>
        <div class="card-body">
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>交易时间</th>
                  <th>支付网关</th>
                  <th>交易ID</th>
                  <th>金额</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="tx in transactions" :key="tx.id">
                  <td>{{ formatDateTime(tx.date_created) }}</td>
                  <td>{{ tx.gateway }}</td>
                  <td class="transaction-id">{{ tx.payment_id }}</td>
                  <td>{{ formatCurrency(tx.amount) }}</td>
                  <td>
                    <span :class="`status-badge status-${tx.status}`">
                      {{ tx.status }}
                    </span>
                  </td>
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
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useRuntimeConfig } from '#app'

const route = useRoute()
const router = useRouter()
const { apiCall } = useAuth()
const config = useRuntimeConfig()

const invoiceId = computed(() => route.params.invoiceId)
const apiBaseUrl = computed(() => config.public.apiBase || '')

const invoice = ref(null)
const transactions = ref([])
const loading = ref(false)
const error = ref(null)

const lineItems = computed(() => {
  if (!invoice.value?.line_items) return []
  try {
    return typeof invoice.value.line_items === 'string'
      ? JSON.parse(invoice.value.line_items)
      : invoice.value.line_items
  } catch {
    return []
  }
})

const isOverdue = computed(() => {
  if (!invoice.value || invoice.value.status !== 'open') return false
  if (!invoice.value.due_date) return false
  return new Date(invoice.value.due_date) < new Date()
})

const loadInvoice = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await apiCall(`/gym/billing/invoices?invoice_id=${invoiceId.value}`)
    if (response.success && response.data.invoices.length > 0) {
      invoice.value = response.data.invoices[0]
      loadTransactions()
    } else {
      error.value = '账单不存在'
    }
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const loadTransactions = async () => {
  try {
    const response = await apiCall(`/gym/payment/transactions?invoice_id=${invoiceId.value}`)
    if (response.success) {
      transactions.value = response.data.transactions || []
    }
  } catch (err) {
    console.error('Failed to load transactions:', err)
  }
}

const markAsPaid = async () => {
  if (!confirm('确定要标记此账单为已付款吗？')) return

  try {
    const response = await apiCall(`/gym/billing/invoices/${invoiceId.value}/pay`, {
      method: 'PATCH',
      body: JSON.stringify({
        payment_method: 'manual'
      })
    })

    if (response.success) {
      await loadInvoice()
    } else {
      alert(response.message || '操作失败')
    }
  } catch (err) {
    alert(err.message || '操作失败')
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

onMounted(() => {
  loadInvoice()
})
</script>

<style scoped>
.invoice-detail {
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

.actions {
  display: flex;
  gap: 8px;
}

.invoice-card {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  margin-bottom: 24px;
}

.invoice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 2px solid #0071e3;
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
}

.invoice-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.invoice-number {
  font-size: 28px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  margin: 0;
  color: #333;
}

.invoice-amount {
  text-align: right;
}

.amount-label {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 4px;
}

.amount-value {
  font-size: 32px;
  font-weight: 700;
  color: #0071e3;
}

.invoice-body {
  padding: 24px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.info-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
}

.info-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  margin: 0 0 16px 0;
  letter-spacing: 0.5px;
}

.info-item {
  margin-bottom: 12px;
}

.info-item:last-child {
  margin-bottom: 0;
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
  font-weight: 500;
}

.transaction-id {
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.text-danger {
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

.card {
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  margin-bottom: 24px;
}

.card-header {
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

.text-right {
  text-align: right;
}

.data-table tfoot td {
  border-top: 2px solid #dee2e6;
  border-bottom: none;
  padding: 12px;
}

.subtotal-row td,
.tax-row td {
  color: #666;
}

.total-row td {
  font-size: 16px;
  padding-top: 16px;
  color: #0071e3;
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

.status-pending {
  background: #fff3cd;
  color: #856404;
}

.status-completed {
  background: #d4edda;
  color: #155724;
}

.status-failed {
  background: #f8d7da;
  color: #721c24;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  text-decoration: none;
  display: inline-block;
}

.btn-primary {
  background: #0071e3;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #f8f9fa;
  color: #333;
  border: 1px solid #dee2e6;
}

.btn-secondary:hover {
  background: #e2e6ea;
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

.empty-mini {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
