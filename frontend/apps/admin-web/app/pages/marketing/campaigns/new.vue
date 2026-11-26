<script lang="ts">
const typeOptions = [
  { value: 'PROMOTION', label: '促銷活動' },
  { value: 'REFERRAL', label: '推薦活動' },
  { value: 'SEASONAL', label: '季節活動' },
  { value: 'MEMBERSHIP', label: '會籍活動' },
  { value: 'EVENT', label: '線下活動' },
  { value: 'OTHER', label: '其他' }
]

const segmentOptions = [
  { value: '', label: '全部會員' },
  { value: 'CHAMPIONS', label: '冠軍會員' },
  { value: 'LOYAL', label: '忠誠會員' },
  { value: 'AT_RISK', label: '風險會員' },
  { value: 'LOST', label: '流失會員' }
]
</script>

<script setup lang="ts">
/**
 * 新增行銷活動頁面
 */
import { MESSAGES } from '~/constants'
import { campaignSchema, type CampaignFormInput } from '~/schemas/campaign.schema'
import { useZodFormValidation } from '~/composables/core/useZodFormValidation'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const router = useRouter()
const { createCampaign } = useCampaigns()
const { branches, fetchBranches } = useBranches()

const initialData: CampaignFormInput = {
  name: '',
  description: '',
  campaignType: 'PROMOTION',
  startDate: '',
  endDate: '',
  budget: null
}

const {
  formData,
  errors,
  validateField,
  validate
} = useZodFormValidation(campaignSchema, initialData)

// Fields outside the validation schema
const additionalData = ref({
  isActive: true,
  targetAudience: '',
  branchId: ''
})

const isSubmitting = ref(false)

onMounted(async () => {
  await fetchBranches()
})

const handleSubmit = async () => {
  if (isSubmitting.value) return
  if (!validate()) {
    toast.error(MESSAGES.COMMON.VALIDATION_ERROR)
    return
  }

  isSubmitting.value = true
  try {
    // createCampaign shows the backend's error itself and returns null on failure
    const result = await createCampaign({
      name: formData.name,
      campaignType: formData.campaignType,
      startDate: formData.startDate,
      endDate: formData.endDate,
      description: formData.description || undefined,
      budget: formData.budget ? Number(formData.budget) : undefined,
      targetAudience: additionalData.value.targetAudience || undefined,
      branchId: additionalData.value.branchId || undefined,
      isActive: additionalData.value.isActive
    })
    if (!result) return
    toast.success('活動建立成功')
    await navigateTo(`/marketing/campaigns/${result.id}`)
  } finally {
    isSubmitting.value = false
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
          @update:model-value="formData.description = $event ?? undefined"
          @blur="validateField('description')"
        />

        <FormSelect
          v-model="formData.campaignType"
          label="活動類型"
          :options="typeOptions"
          required
          :error="errors.campaignType"
          @blur="validateField('campaignType')"
        />

        <div class="form-row">
          <FormDatePicker
            v-model="formData.startDate"
            label="開始日期"
            required
            :error="errors.startDate"
            @blur="validateField('startDate')"
          />

          <FormDatePicker
            v-model="formData.endDate"
            label="結束日期"
            required
            :error="errors.endDate"
            @blur="validateField('endDate')"
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
          v-model="additionalData.targetAudience"
          label="目標會員分群"
          :options="segmentOptions"
        />

        <div class="form-field">
          <label class="form-label">適用分店</label>
          <select v-model="additionalData.branchId" class="input">
            <option value="">全部分店</option>
            <option v-for="branch in branches" :key="branch.id" :value="branch.id">
              {{ branch.name }}
            </option>
          </select>
        </div>

        <label class="checkbox-item">
          <input v-model="additionalData.isActive" type="checkbox" />
          <span>建立後立即啟用</span>
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="router.back()">
          取消
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSubmitting">
          {{ isSubmitting ? '建立中...' : '建立活動' }}
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
