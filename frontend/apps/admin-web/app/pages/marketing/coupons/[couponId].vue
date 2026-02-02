<script setup lang="ts">
/**
 * 優惠券詳情頁面
 */
import { MESSAGES } from '~/constants'
import { validateUUIDParam } from '~/utils/validation'

definePageMeta({
  middleware: 'auth',
  validate: validateUUIDParam('couponId')
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const {
  getCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponUsages,
  getDiscountTypeLabel,
  getStatusLabel,
  getStatusVariant
} = useCoupons()

const coupon = ref<Awaited<ReturnType<typeof getCoupon>> | null>(null)
const usages = ref<Awaited<ReturnType<typeof getCouponUsages>>>({ data: [], total: 0 })
const isLoading = ref(true)

const couponId = computed(() => route.params.couponId as string)

const loadCoupon = async () => {
  isLoading.value = true
  try {
    coupon.value = await getCoupon(couponId.value)
    usages.value = await getCouponUsages(couponId.value)
  } catch (error) {
    console.error('Failed to load coupon:', error)
    toast.error('載入優惠券資料失敗')
  } finally {
    isLoading.value = false
  }
}

onMounted(loadCoupon)

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0
  }).format(amount)
}

// Format discount
const formatDiscount = computed(() => {
  if (!coupon.value) return ''
  if (coupon.value.discount_type === 'PERCENTAGE') {
    return `${coupon.value.discount_value}% 折扣`
  }
  return `折 ${formatCurrency(coupon.value.discount_value)}`
})

// Toggle status
const handleToggleStatus = async () => {
  if (!coupon.value) return

  const newStatus = coupon.value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
  const actionText = newStatus === 'ACTIVE' ? '啟用' : '停用'

  const confirmed = await confirm({
    title: `${actionText}優惠券`,
    message: `確定要${actionText}此優惠券嗎？`,
    confirmText: `確定${actionText}`,
    confirmVariant: newStatus === 'ACTIVE' ? 'primary' : 'danger'
  })

  if (!confirmed) return

  try {
    await updateCoupon(couponId.value, { status: newStatus })
    toast.success(`優惠券已${actionText}`)
    await loadCoupon()
  } catch (error) {
    console.error('Failed to update status:', error)
    toast.error(`${actionText}失敗`)
  }
}

// Delete
const handleDelete = async () => {
  const confirmed = await confirm({
    title: '刪除優惠券',
    message: '確定要刪除此優惠券嗎？此操作無法復原。',
    confirmText: '確定刪除',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  try {
    await deleteCoupon(couponId.value)
    toast.success('優惠券已刪除')
    router.push('/marketing/coupons')
  } catch (error) {
    console.error('Failed to delete coupon:', error)
    toast.error('刪除失敗')
  }
}

// Usage percentage
const usagePercentage = computed(() => {
  if (!coupon.value?.usage_limit) return null
  return Math.min((coupon.value.used_count / coupon.value.usage_limit) * 100, 100)
})
</script>

<template>
  <div class="coupon-detail-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <template v-else-if="coupon">
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <div class="header-actions">
          <button
            class="btn"
            :class="coupon.status === 'ACTIVE' ? 'btn-secondary' : 'btn-primary'"
            @click="handleToggleStatus"
          >
            {{ coupon.status === 'ACTIVE' ? '停用' : '啟用' }}
          </button>
          <button class="btn btn-ghost btn-danger" @click="handleDelete">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            刪除
          </button>
        </div>
      </header>

      <!-- Coupon Hero -->
      <section class="coupon-hero glass-card">
        <div class="coupon-visual">
          <div class="coupon-ticket">
            <div class="ticket-left">
              <code class="coupon-code">{{ coupon.code }}</code>
              <h1 class="coupon-name">{{ coupon.name }}</h1>
            </div>
            <div class="ticket-divider"></div>
            <div class="ticket-right">
              <span class="discount-value">{{ formatDiscount }}</span>
            </div>
          </div>
        </div>
        <div class="coupon-meta">
          <AppBadge
            :label="getStatusLabel(coupon.status)"
            :variant="getStatusVariant(coupon.status)"
            size="lg"
          />
          <span class="meta-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4" /><path d="M16 2v4" />
              <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
            </svg>
            {{ formatDate(coupon.start_date) }} ~ {{ formatDate(coupon.end_date) }}
          </span>
        </div>
      </section>

      <!-- Content Grid -->
      <div class="content-grid">
        <!-- Usage Stats -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            使用統計
          </h3>
          <div class="usage-stats">
            <div class="usage-main">
              <span class="usage-count">{{ coupon.used_count || 0 }}</span>
              <span class="usage-limit">/ {{ coupon.usage_limit || '∞' }}</span>
            </div>
            <div v-if="usagePercentage !== null" class="usage-bar-large">
              <div class="usage-fill" :style="{ width: `${usagePercentage}%` }"></div>
            </div>
            <span class="usage-label">已使用次數</span>
          </div>
        </section>

        <!-- Discount Details -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="M9 9h.01" />
              <path d="M15 15h.01" />
            </svg>
            折扣詳情
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>折扣類型</label>
              <span>{{ getDiscountTypeLabel(coupon.discount_type) }}</span>
            </div>
            <div class="info-item">
              <label>折扣值</label>
              <span>{{ coupon.discount_type === 'PERCENTAGE' ? `${coupon.discount_value}%` : formatCurrency(coupon.discount_value) }}</span>
            </div>
            <div class="info-item">
              <label>最低消費</label>
              <span>{{ coupon.min_purchase > 0 ? formatCurrency(coupon.min_purchase) : '無門檻' }}</span>
            </div>
            <div v-if="coupon.max_discount" class="info-item">
              <label>折扣上限</label>
              <span>{{ formatCurrency(coupon.max_discount) }}</span>
            </div>
          </div>
        </section>

        <!-- Restrictions -->
        <section class="detail-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            </svg>
            使用限制
          </h3>
          <div class="info-grid">
            <div class="info-item">
              <label>總使用上限</label>
              <span>{{ coupon.usage_limit || '無限制' }}</span>
            </div>
            <div class="info-item">
              <label>每人使用上限</label>
              <span>{{ coupon.usage_per_member }} 次</span>
            </div>
          </div>
          <div v-if="coupon.applicable_plans && coupon.applicable_plans.length > 0" class="applicable-plans">
            <label>適用方案</label>
            <div class="plans-tags">
              <span v-for="planId in coupon.applicable_plans" :key="planId" class="plan-tag">
                {{ planId }}
              </span>
            </div>
          </div>
        </section>
      </div>

      <!-- Usage History -->
      <section class="usage-history">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          使用紀錄
        </h2>

        <div v-if="usages.data.length > 0" class="usage-list">
          <div
            v-for="usage in usages.data"
            :key="usage.id"
            class="usage-item"
          >
            <div class="usage-member">
              <AppAvatar :name="usage.member_name || '?'" size="sm" variant="blue" />
              <span>{{ usage.member_name }}</span>
            </div>
            <div class="usage-contract">
              {{ usage.contract_no || '—' }}
            </div>
            <div class="usage-amount">
              折抵 {{ formatCurrency(usage.discount_amount || 0) }}
            </div>
            <div class="usage-time">
              {{ formatDateTime(usage.used_at) }}
            </div>
          </div>
        </div>
        <EmptyState
          v-else
          title="尚無使用紀錄"
          icon="clock"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.coupon-detail-page {
  max-width: 1000px;
  margin: 0 auto;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
  animation: fadeIn 0.6s var(--ease-out) backwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
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

.header-actions {
  display: flex;
  gap: var(--space-md);
}

.btn-danger {
  color: var(--color-error);
}

.btn-danger:hover {
  background: rgba(255, 59, 48, 0.1);
}

/* Coupon Hero */
.coupon-hero {
  padding: var(--space-2xl);
  margin-bottom: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.coupon-ticket {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #34c759, #30d158);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  color: white;
  margin-bottom: var(--space-xl);
}

.ticket-left {
  flex: 1;
}

.coupon-code {
  display: inline-block;
  padding: var(--space-xs) var(--space-md);
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 2px;
  margin-bottom: var(--space-sm);
}

.coupon-name {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.ticket-divider {
  width: 1px;
  height: 60px;
  background: rgba(255, 255, 255, 0.3);
  margin: 0 var(--space-xl);
}

.ticket-right {
  text-align: center;
}

.discount-value {
  font-size: 28px;
  font-weight: 700;
}

.coupon-meta {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.detail-card {
  padding: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.detail-card:nth-child(1) { animation-delay: 0.15s; }
.detail-card:nth-child(2) { animation-delay: 0.2s; }
.detail-card:nth-child(3) { animation-delay: 0.25s; }

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: var(--space-lg);
}

.card-title svg {
  color: var(--color-accent);
}

/* Usage Stats */
.usage-stats {
  text-align: center;
}

.usage-main {
  margin-bottom: var(--space-md);
}

.usage-count {
  font-size: 48px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.usage-limit {
  font-size: 24px;
  color: var(--color-text-tertiary);
}

.usage-bar-large {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--space-md);
}

.usage-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  transition: width 0.5s var(--ease-out);
}

.usage-label {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.info-item label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-item span {
  font-size: 15px;
  color: var(--color-text-primary);
  font-weight: 500;
}

/* Applicable Plans */
.applicable-plans {
  margin-top: var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

.applicable-plans label {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-sm);
}

.plans-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.plan-tag {
  padding: var(--space-xs) var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  font-size: 13px;
}

/* Usage History */
.usage-history {
  animation: fadeUp 0.6s var(--ease-out) 0.3s backwards;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 20px;
  font-weight: 600;
  margin-bottom: var(--space-xl);
}

.section-title svg {
  color: var(--color-accent);
}

.usage-list {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.usage-item {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-divider);
  transition: background var(--duration-fast);
}

.usage-item:last-child {
  border-bottom: none;
}

.usage-item:hover {
  background: var(--color-bg-secondary);
}

.usage-member {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-weight: 500;
}

.usage-contract {
  color: var(--color-text-secondary);
}

.usage-amount {
  color: var(--color-success);
  font-weight: 500;
}

.usage-time {
  color: var(--color-text-tertiary);
  font-size: 13px;
  text-align: right;
}

/* Responsive */
@media (max-width: 1024px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .coupon-ticket {
    flex-direction: column;
    text-align: center;
  }

  .ticket-divider {
    width: 80%;
    height: 1px;
    margin: var(--space-lg) 0;
  }

  .usage-item {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
