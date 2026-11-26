<script lang="ts">
const CAMPAIGN_DATE_FORMATTER = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})

const CAMPAIGN_CURRENCY_FORMATTER = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  // date-only strings (YYYY-MM-DD) are shown as that calendar day, not shifted by the timezone
  return CAMPAIGN_DATE_FORMATTER.format(new Date(`${dateStr.slice(0, 10)}T00:00:00`))
}

const formatCurrency = (amount: number | string) => {
  return CAMPAIGN_CURRENCY_FORMATTER.format(Number(amount))
}
</script>

<script setup lang="ts">
/**
 * 行銷活動詳情頁面
 */
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()

const campaignId = computed(() => route.params.campaignId as string)

const {
  currentCampaign,
  isLoading,
  fetchCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignState,
  getStatusLabel,
  getStatusVariant,
  getTypeLabel
} = useCampaigns()

const isEditing = ref(false)
const isSaving = ref(false)
const editForm = ref({
  name: '',
  description: '',
  budget: null as number | string | null
})

const campaignState = computed(() => currentCampaign.value ? getCampaignState(currentCampaign.value) : null)

const resetEditForm = () => {
  if (!currentCampaign.value) return
  editForm.value = {
    name: currentCampaign.value.name,
    description: currentCampaign.value.description || '',
    budget: currentCampaign.value.budget !== null ? Number(currentCampaign.value.budget) : null
  }
}

const cancelEdit = () => {
  isEditing.value = false
  resetEditForm()
}

// Load data
onMounted(async () => {
  await fetchCampaign(campaignId.value)
  resetEditForm()
})

// Save edits
const saveEdits = async () => {
  if (isSaving.value) return
  isSaving.value = true
  try {
    // updateCampaign shows the backend's error itself and returns null on failure
    const result = await updateCampaign(campaignId.value, {
      name: editForm.value.name,
      description: editForm.value.description,
      budget: editForm.value.budget === null || editForm.value.budget === '' ? undefined : Number(editForm.value.budget)
    })
    if (!result) return
    toast.success('活動更新成功')
    isEditing.value = false
    await fetchCampaign(campaignId.value)
    resetEditForm()
  } finally {
    isSaving.value = false
  }
}

// Enable / disable (PATCH isActive)
const handleToggleActive = async () => {
  const campaign = currentCampaign.value
  if (!campaign) return
  const enable = campaign.isActive === false
  const actionText = enable ? '啟用' : '停用'

  const confirmed = await confirm({
    title: `${actionText}活動`,
    message: `確定要${actionText}此活動嗎？`,
    confirmText: `確定${actionText}`,
    confirmVariant: enable ? 'primary' : 'danger'
  })
  if (!confirmed) return

  const result = await updateCampaign(campaignId.value, { isActive: enable })
  if (!result) return
  toast.success(`活動已${actionText}`)
  await fetchCampaign(campaignId.value)
}

// Permanent delete (admin only)
const handleDelete = async () => {
  const confirmed = await confirm({
    title: '刪除活動',
    message: '確定要刪除此活動嗎？刪除後無法復原。',
    confirmText: '確定刪除',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  const deleted = await deleteCampaign(campaignId.value)
  if (!deleted) return
  toast.success('活動已刪除')
  await navigateTo('/marketing/campaigns')
}
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="currentCampaign?.name || '載入中...'"
      description="活動詳情"
      back-to="/marketing/campaigns"
    >
      <template #actions>
        <button
          v-if="!isEditing && currentCampaign"
          class="btn btn-secondary"
          @click="isEditing = true"
        >
          編輯
        </button>
        <button
          v-if="!isEditing && currentCampaign"
          class="btn btn-secondary"
          @click="handleToggleActive"
        >
          {{ currentCampaign.isActive === false ? '啟用' : '停用' }}
        </button>
        <button
          v-if="!isEditing && currentCampaign"
          class="btn btn-danger"
          @click="handleDelete"
        >
          刪除
        </button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" />

    <template v-else-if="currentCampaign">
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
            <FormInput
              v-model="editForm.budget"
              label="預算"
              type="number"
            />
            <div class="edit-actions">
              <button class="btn btn-secondary" :disabled="isSaving" @click="cancelEdit">取消</button>
              <button class="btn btn-primary" :disabled="isSaving" @click="saveEdits">
                {{ isSaving ? '儲存中...' : '儲存' }}
              </button>
            </div>
          </template>

          <template v-else>
            <div class="info-row">
              <span class="info-label">類型</span>
              <span class="type-badge" :class="`type-${currentCampaign.campaignType?.toLowerCase()}`">
                {{ getTypeLabel(currentCampaign.campaignType) }}
              </span>
            </div>
            <div v-if="campaignState" class="info-row">
              <span class="info-label">狀態</span>
              <AppBadge
                :label="getStatusLabel(campaignState)"
                :variant="getStatusVariant(campaignState)"
              />
            </div>
            <div class="info-row">
              <span class="info-label">活動期間</span>
              <span class="info-value">
                {{ formatDate(currentCampaign.startDate) }} ~ {{ formatDate(currentCampaign.endDate) }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">預算</span>
              <span class="info-value">
                {{ currentCampaign.budget ? formatCurrency(currentCampaign.budget) : '—' }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">適用分店</span>
              <span class="info-value">{{ currentCampaign.branch?.name || '全部分店' }}</span>
            </div>
            <div v-if="currentCampaign.targetAudience" class="info-row">
              <span class="info-label">目標會員</span>
              <span class="info-value">{{ currentCampaign.targetAudience }}</span>
            </div>
            <div v-if="currentCampaign.createdBy?.fullName" class="info-row">
              <span class="info-label">建立者</span>
              <span class="info-value">{{ currentCampaign.createdBy.fullName }}</span>
            </div>
            <div v-if="currentCampaign.description" class="info-row full-width">
              <span class="info-label">說明</span>
              <span class="info-value">{{ currentCampaign.description }}</span>
            </div>
          </template>
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
/* Details Grid */
.details-grid {
  display: grid;
  grid-template-columns: minmax(0, 720px);
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
.type-membership { background: rgba(175, 82, 222, 0.1); color: #af52de; }
.type-event { background: rgba(90, 200, 250, 0.15); color: #1a8fc4; }
.type-other { background: rgba(142, 142, 147, 0.12); color: #636366; }

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

/* Responsive */
@media (max-width: 768px) {
  .details-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
