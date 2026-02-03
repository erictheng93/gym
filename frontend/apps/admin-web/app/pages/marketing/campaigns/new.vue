<script setup lang="ts">
/**
 * 新增行銷活動頁面
 */
import { MESSAGES } from '~/constants'
import { campaignSchema } from '~/schemas/campaign.schema'
import { useZodFormValidation } from '~/composables/core/useZodFormValidation'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const router = useRouter()
const { createCampaign, isLoading } = useCampaigns()
const { coupons, fetchCoupons } = useCoupons()
const { branches, fetchBranches } = useBranches()

const {
  formData,
  errors,
  validateField,
  validate
} = useZodFormValidation(campaignSchema, {
  name: '',
  description: '',
  type: 'PROMOTION' as const,
  start_date: '',
  end_date: '',
  budget: null
})

// Additional form fields not in schema
const additionalData = ref({
  status: 'DRAFT' as 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED',
  target_segment: '',
  associated_coupons: [] as string[],
  target_branches: [] as string[]
})

const typeOptions = [
  { value: 'PROMOTION', label: '促銷活動' },
  { value: 'SEASONAL', label: '季節活動' },
  { value: 'REFERRAL', label: '推薦活動' },
  { value: 'RETENTION', label: '留存活動' }
]

const segmentOptions = [
  { value: '', label: '全部會員' },
  { value: 'CHAMPIONS', label: '冠軍會員' },
  { value: 'LOYAL', label: '忠誠會員' },
  { value: 'AT_RISK', label: '風險會員' },
  { value: 'LOST', label: '流失會員' }
]

onMounted(async () => {
  await Promise.all([fetchCoupons({ limit: 100 }), fetchBranches()])
})

const handleSubmit = async () => {
  if (!validate()) {
    toast.error(MESSAGES.COMMON.VALIDATION_ERROR)
    return
  }

  try {
    // Cast is needed because Campaign type expects associated_coupons as objects,
    // but API accepts string IDs for creation
    const result = await createCampaign({
      ...formData,
      status: additionalData.value.status,
      target_segment: additionalData.value.target_segment,
      target_branches: additionalData.value.target_branches,
      budget: formData.budget ? Number(formData.budget) : null
    } as Parameters<typeof createCampaign>[0])
    if (!result) {
      throw new Error('建立活動失敗')
    }
    toast.success('活動建立成功')
    navigateTo(`/marketing/campaigns/${result.id}`)
  } catch (error) {
    console.error('Failed to create campaign:', error)
    toast.error('建立活動失敗')
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="新增行銷活動"
      description="建立新的行銷活動"
      back-to="/marketing/campaigns"
    />

    <form class="form-container" @submit.prevent="handleSubmit">
      <div class="form-card">
        <h2 class="form-section-title">基本資訊</h2>

        <FormInput
          v-model="formData.name"
          label="活動名稱"
          placeholder="例：2024 新年促銷"
          required
          :error="errors.name"
          @blur="validateField('name')"
        />

        <FormTextarea
          :model-value="formData.description ?? undefined"
          label="活動說明"
          placeholder="活動詳細說明..."
          :rows="3"
          :error="errors.description"
          @update:model-value="formData.description = $event ?? null"
          @blur="validateField('description')"
        />

        <FormSelect
          v-model="formData.type"
          label="活動類型"
          :options="typeOptions"
          required
          :error="errors.type"
          @blur="validateField('type')"
        />

        <div class="form-row">
          <FormDatePicker
            v-model="formData.start_date"
            label="開始日期"
            required
            :error="errors.start_date"
            @blur="validateField('start_date')"
          />

          <FormDatePicker
            v-model="formData.end_date"
            label="結束日期"
            required
            :error="errors.end_date"
            @blur="validateField('end_date')"
          />
        </div>

        <FormInput
          v-model="formData.budget"
          label="活動預算"
          type="number"
          placeholder="0"
          :error="errors.budget"
          @blur="validateField('budget')"
        >
          <template #prefix>NT$</template>
        </FormInput>
      </div>

      <div class="form-card">
        <h2 class="form-section-title">目標設定</h2>

        <FormSelect
          v-model="additionalData.target_segment"
          label="目標會員分群"
          :options="segmentOptions"
        />

        <div class="form-field">
          <label class="form-label">適用分店</label>
          <div class="checkbox-group">
            <label v-for="branch in branches" :key="branch.id" class="checkbox-item">
              <input
                v-model="additionalData.target_branches"
                type="checkbox"
                :value="branch.id"
              />
              <span>{{ branch.name }}</span>
            </label>
          </div>
          <p class="form-hint">不選則適用全部分店</p>
        </div>
      </div>

      <div class="form-card">
        <h2 class="form-section-title">關聯優惠券</h2>

        <div class="form-field">
          <label class="form-label">選擇優惠券</label>
          <div class="checkbox-group">
            <label v-for="coupon in coupons" :key="coupon.id" class="checkbox-item">
              <input
                v-model="additionalData.associated_coupons"
                type="checkbox"
                :value="coupon.id"
              />
              <span>{{ coupon.name }} ({{ coupon.code }})</span>
            </label>
          </div>
          <p v-if="coupons.length === 0" class="form-hint">暫無可用優惠券</p>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="router.back()">
          取消
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          {{ isLoading ? '建立中...' : '建立活動' }}
        </button>
      </div>
    </form>
  </PageContainer>
</template>

<style scoped>
.form-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  max-width: 800px;
}

.form-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.form-section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.checkbox-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
}

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
