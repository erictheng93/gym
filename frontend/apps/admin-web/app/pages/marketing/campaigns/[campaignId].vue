<script setup lang="ts">
/**
 * 行銷活動詳情頁面
 */
import { MESSAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()

const campaignId = computed(() => route.params.campaignId as string)

const {
  currentCampaign,
  campaignMetrics,
  isLoading,
  fetchCampaign,
  fetchCampaignMetrics,
  updateCampaign,
  deleteCampaign,
  getStatusLabel,
  getStatusVariant,
  getTypeLabel
} = useCampaigns()

const isEditing = ref(false)
type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
const editForm = ref({
  name: '',
  description: '',
  status: 'DRAFT' as CampaignStatus,
  budget: null as number | null
})

// Load data
onMounted(async () => {
  await Promise.all([
    fetchCampaign(campaignId.value),
    fetchCampaignMetrics(campaignId.value)
  ])
  if (currentCampaign.value) {
    editForm.value = {
      name: currentCampaign.value.name,
      description: currentCampaign.value.description || '',
      status: currentCampaign.value.status,
      budget: currentCampaign.value.budget
    }
  }
})

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(amount)
}

// Status options
const statusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'SCHEDULED', label: '已排程' },
  { value: 'ACTIVE', label: '進行中' },
  { value: 'PAUSED', label: '已暫停' },
  { value: 'ENDED', label: '已結束' }
]

// Save edits
const saveEdits = async () => {
  try {
    await updateCampaign(campaignId.value, editForm.value)
    toast.success('活動更新成功')
    isEditing.value = false
    await fetchCampaign(campaignId.value)
  } catch (error) {
    console.error('Failed to update campaign:', error)
    toast.error('更新失敗')
  }
}

// Delete campaign
const handleDelete = async () => {
  const confirmed = await confirm({
    title: '封存活動',
    message: '確定要封存此活動嗎？封存後無法復原。',
    confirmText: '確定封存',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  try {
    await deleteCampaign(campaignId.value)
    toast.success('活動已封存')
    navigateTo('/marketing/campaigns')
  } catch (error) {
    console.error('Failed to delete campaign:', error)
    toast.error('封存失敗')
  }
}

// Calculated ROI
const roi = computed(() => {
  if (!campaignMetrics.value || !currentCampaign.value?.budget) return null
  const budget = currentCampaign.value.budget
  const revenue = campaignMetrics.value.total_revenue || 0
  return ((revenue - budget) / budget * 100).toFixed(1)
})
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="currentCampaign?.name || '載入中...'"
      description="活動詳情與成效分析"
      back-to="/marketing/campaigns"
    >
      <template #actions>
        <button
          v-if="!isEditing"
          class="btn btn-secondary"
          @click="isEditing = true"
        >
          編輯
        </button>
        <button
          v-if="!isEditing && currentCampaign?.status !== 'ENDED'"
          class="btn btn-danger"
          @click="handleDelete"
        >
          封存
        </button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" />

    <template v-else-if="currentCampaign">
      <!-- Metrics Cards -->
      <section v-if="campaignMetrics" class="metrics-section">
        <div class="metric-card">
          <div class="metric-icon conversions">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div class="metric-content">
            <span class="metric-label">轉換人數</span>
            <span class="metric-value">{{ campaignMetrics.conversions || 0 }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon revenue">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div class="metric-content">
            <span class="metric-label">總營收</span>
            <span class="metric-value">{{ formatCurrency(campaignMetrics.total_revenue || 0) }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon coupons">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
              <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
            </svg>
          </div>
          <div class="metric-content">
            <span class="metric-label">優惠券使用</span>
            <span class="metric-value">{{ campaignMetrics.coupon_usages || 0 }}</span>
          </div>
        </div>

        <div class="metric-card highlight">
          <div class="metric-icon roi">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div class="metric-content">
            <span class="metric-label">ROI</span>
            <span v-if="roi !== null" class="metric-value" :class="{ positive: Number(roi) >= 0, negative: Number(roi) < 0 }">
              {{ roi }}%
            </span>
            <span v-else class="metric-value text-tertiary">—</span>
          </div>
        </div>
      </section>

      <!-- Campaign Details -->
      <div class="details-grid">
        <!-- Info Card -->
        <div class="detail-card">
          <h3 class="card-title">活動資訊</h3>

          <template v-if="isEditing">
            <FormInput
              v-model="editForm.name"
              label="活動名稱"
            />
            <FormTextarea
              v-model="editForm.description"
              label="活動說明"
              :rows="3"
            />
            <FormSelect
              v-model="editForm.status"
              label="狀態"
              :options="statusOptions"
            />
            <FormInput
              v-model="editForm.budget"
              label="預算"
              type="number"
            />
            <div class="edit-actions">
              <button class="btn btn-secondary" @click="isEditing = false">取消</button>
              <button class="btn btn-primary" @click="saveEdits">儲存</button>
            </div>
          </template>

          <template v-else>
            <div class="info-row">
              <span class="info-label">類型</span>
              <span class="type-badge" :class="`type-${currentCampaign.type?.toLowerCase()}`">
                {{ getTypeLabel(currentCampaign.type) }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">狀態</span>
              <AppBadge
                :label="getStatusLabel(currentCampaign.status)"
                :variant="getStatusVariant(currentCampaign.status)"
              />
            </div>
            <div class="info-row">
              <span class="info-label">活動期間</span>
              <span class="info-value">
                {{ formatDate(currentCampaign.start_date) }} ~ {{ formatDate(currentCampaign.end_date) }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">預算</span>
              <span class="info-value">
                {{ currentCampaign.budget ? formatCurrency(currentCampaign.budget) : '—' }}
              </span>
            </div>
            <div v-if="currentCampaign.description" class="info-row full-width">
              <span class="info-label">說明</span>
              <span class="info-value">{{ currentCampaign.description }}</span>
            </div>
          </template>
        </div>

        <!-- Associated Coupons -->
        <div class="detail-card">
          <h3 class="card-title">關聯優惠券</h3>
          <div v-if="currentCampaign.associated_coupons?.length" class="coupon-list">
            <div
              v-for="coupon in currentCampaign.associated_coupons"
              :key="coupon.id"
              class="coupon-item"
            >
              <span class="coupon-name">{{ coupon.name }}</span>
              <span class="coupon-code">{{ coupon.code }}</span>
            </div>
          </div>
          <EmptyState
            v-else
            title="無關聯優惠券"
            description="此活動尚未關聯任何優惠券"
            icon="ticket"
          />
        </div>
      </div>
    </template>

    <EmptyState
      v-else
      title="找不到活動"
      description="此活動不存在或已被刪除"
      icon="alert-circle"
      action-label="返回列表"
      action-to="/marketing/campaigns"
    />
  </PageContainer>
</template>

<style scoped>
/* Metrics Section */
.metrics-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.metric-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.metric-card.highlight {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.05), rgba(88, 86, 214, 0.05));
  border-color: var(--color-accent);
}

.metric-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.metric-icon.conversions { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.metric-icon.revenue { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.metric-icon.coupons { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.metric-icon.roi { background: rgba(175, 82, 222, 0.1); color: #af52de; }

.metric-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.metric-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.metric-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.metric-value.positive { color: #34c759; }
.metric-value.negative { color: #ff3b30; }

/* Details Grid */
.details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
}

.detail-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.info-row.full-width {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
}

.info-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.info-value {
  font-size: 14px;
  color: var(--color-text-primary);
  font-weight: 500;
}

/* Type Badge */
.type-badge {
  display: inline-flex;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.type-promotion { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.type-seasonal { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.type-referral { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.type-retention { background: rgba(175, 82, 222, 0.1); color: #af52de; }

/* Coupon List */
.coupon-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.coupon-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.coupon-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.coupon-code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-accent);
  background: rgba(0, 122, 255, 0.1);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

/* Responsive */
@media (max-width: 1024px) {
  .metrics-section {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-section {
    grid-template-columns: 1fr;
  }

  .details-grid {
    grid-template-columns: 1fr;
  }
}
</style>
