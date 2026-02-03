<script setup lang="ts">
/**
 * 薪資明細頁面
 */
import { usePayroll } from '~/composables/hr'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()

const recordId = computed(() => route.params.recordId as string)

const {
  currentSalaryRecord,
  isLoading,
  fetchSalaryRecord,
  updateSalaryRecord,
  approveSalary,
  markAsPaid,
  getStatusLabel,
  getStatusVariant,
  formatCurrency
} = usePayroll()

const isEditing = ref(false)
const editForm = ref({
  overtime_hours: 0,
  bonus: 0,
  deductions: 0,
  notes: ''
})

// Load data
onMounted(async () => {
  await fetchSalaryRecord(recordId.value)
  if (currentSalaryRecord.value) {
    editForm.value = {
      overtime_hours: currentSalaryRecord.value.overtime_hours || 0,
      bonus: currentSalaryRecord.value.bonus || 0,
      deductions: currentSalaryRecord.value.deductions || 0,
      notes: currentSalaryRecord.value.notes || ''
    }
  }
})


// Calculate net salary preview
const netSalaryPreview = computed(() => {
  if (!currentSalaryRecord.value) return 0
  const base = currentSalaryRecord.value.base_salary || 0
  const overtime = (editForm.value.overtime_hours || 0) * (currentSalaryRecord.value.hourly_rate || 0) * 1.5
  const bonus = editForm.value.bonus || 0
  const deductions = editForm.value.deductions || 0
  return base + overtime + bonus - deductions
})

// Save edits
const saveEdits = async () => {
  try {
    await updateSalaryRecord(recordId.value, editForm.value)
    toast.success('薪資明細已更新')
    isEditing.value = false
    await fetchSalaryRecord(recordId.value)
  } catch (error) {
    console.error('Failed to update salary record:', error)
    toast.error('更新失敗')
  }
}

// Approve salary
const handleApprove = async () => {
  const confirmed = await confirm({
    title: '核准薪資',
    message: '確定要核准此薪資紀錄嗎？',
    confirmText: '確定核准',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    await approveSalary(recordId.value)
    toast.success('薪資已核准')
    await fetchSalaryRecord(recordId.value)
  } catch (error) {
    console.error('Failed to approve salary:', error)
    toast.error('核准失敗')
  }
}

// Mark as paid
const handlePaid = async () => {
  const confirmed = await confirm({
    title: '標記已發放',
    message: '確定要將此薪資標記為已發放嗎？',
    confirmText: '確定',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    await markAsPaid(recordId.value)
    toast.success('已標記為已發放')
    await fetchSalaryRecord(recordId.value)
  } catch (error) {
    console.error('Failed to mark as paid:', error)
    toast.error('操作失敗')
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="currentSalaryRecord?.employee?.full_name ? `${currentSalaryRecord.employee.full_name} - ${currentSalaryRecord.period}` : '載入中...'"
      description="薪資明細與調整"
      back-to="/hr/payroll"
    >
      <template #actions>
        <template v-if="currentSalaryRecord?.status === 'PENDING'">
          <button class="btn btn-secondary" @click="isEditing = !isEditing">
            {{ isEditing ? '取消' : '調整' }}
          </button>
          <button class="btn btn-primary" @click="handleApprove">
            核准
          </button>
        </template>
        <template v-else-if="currentSalaryRecord?.status === 'APPROVED'">
          <button class="btn btn-primary" @click="handlePaid">
            標記已發放
          </button>
        </template>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" />

    <template v-else-if="currentSalaryRecord">
      <div class="salary-grid">
        <!-- Employee Info -->
        <div class="info-card">
          <div class="employee-header">
            <AppAvatar :name="currentSalaryRecord.employee?.full_name || '?'" size="lg" variant="blue" />
            <div class="employee-details">
              <span class="employee-name">{{ currentSalaryRecord.employee?.full_name }}</span>
              <span class="employee-code">{{ currentSalaryRecord.employee?.employee_code }}</span>
            </div>
            <AppBadge
              :label="getStatusLabel(currentSalaryRecord.status)"
              :variant="getStatusVariant(currentSalaryRecord.status)"
            />
          </div>

          <div class="info-list">
            <div class="info-row">
              <span class="info-label">薪資期間</span>
              <span class="info-value">{{ currentSalaryRecord.period }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">職稱</span>
              <span class="info-value">{{ currentSalaryRecord.employee?.job_title?.name || '—' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">分店</span>
              <span class="info-value">{{ currentSalaryRecord.employee?.branch?.name || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Net Salary Card -->
        <div class="net-card">
          <span class="net-label">實發金額</span>
          <span class="net-value">
            {{ formatCurrency(isEditing ? netSalaryPreview : currentSalaryRecord.net_salary || 0) }}
          </span>
          <span v-if="isEditing" class="net-hint">預覽金額</span>
        </div>

        <!-- Salary Breakdown -->
        <div class="breakdown-card">
          <h3 class="card-title">薪資明細</h3>

          <div class="breakdown-section">
            <h4 class="section-title">收入</h4>
            <div class="breakdown-row">
              <span class="row-label">底薪</span>
              <span class="row-value">{{ formatCurrency(currentSalaryRecord.base_salary || 0) }}</span>
            </div>
            <div class="breakdown-row">
              <span class="row-label">
                加班費
                <template v-if="!isEditing">
                  ({{ currentSalaryRecord.overtime_hours || 0 }} 小時)
                </template>
              </span>
              <template v-if="isEditing">
                <FormInput
                  v-model="editForm.overtime_hours"
                  type="number"
                  :min="0"
                  class="inline-input"
                />
              </template>
              <span v-else class="row-value">{{ formatCurrency(currentSalaryRecord.overtime_pay || 0) }}</span>
            </div>
            <div class="breakdown-row">
              <span class="row-label">業績獎金</span>
              <span class="row-value">{{ formatCurrency(currentSalaryRecord.commission || 0) }}</span>
            </div>
            <div class="breakdown-row">
              <span class="row-label">其他獎金</span>
              <template v-if="isEditing">
                <FormInput
                  v-model="editForm.bonus"
                  type="number"
                  :min="0"
                  class="inline-input"
                />
              </template>
              <span v-else class="row-value">{{ formatCurrency(currentSalaryRecord.bonus || 0) }}</span>
            </div>
          </div>

          <div class="breakdown-section">
            <h4 class="section-title">扣款</h4>
            <div class="breakdown-row">
              <span class="row-label">扣款項目</span>
              <template v-if="isEditing">
                <FormInput
                  v-model="editForm.deductions"
                  type="number"
                  :min="0"
                  class="inline-input"
                />
              </template>
              <span v-else class="row-value deduction">-{{ formatCurrency(currentSalaryRecord.deductions || 0) }}</span>
            </div>
          </div>

          <div class="breakdown-total">
            <span class="total-label">實發金額</span>
            <span class="total-value">{{ formatCurrency(isEditing ? netSalaryPreview : currentSalaryRecord.net_salary || 0) }}</span>
          </div>
        </div>

        <!-- Notes -->
        <div class="notes-card">
          <h3 class="card-title">備註</h3>
          <template v-if="isEditing">
            <FormTextarea
              v-model="editForm.notes"
              :rows="3"
              placeholder="輸入備註..."
            />
          </template>
          <template v-else>
            <p v-if="currentSalaryRecord.notes" class="notes-text">
              {{ currentSalaryRecord.notes }}
            </p>
            <p v-else class="notes-empty">無備註</p>
          </template>
        </div>

        <!-- Edit Actions -->
        <div v-if="isEditing" class="edit-actions">
          <button class="btn btn-secondary" @click="isEditing = false">取消</button>
          <button class="btn btn-primary" @click="saveEdits">儲存變更</button>
        </div>
      </div>
    </template>

    <EmptyState
      v-else
      title="找不到薪資紀錄"
      description="此薪資紀錄不存在或已被刪除"
      icon="dollar-sign"
      action-label="返回列表"
      action-to="/hr/payroll"
    />
  </PageContainer>
</template>

<style scoped>
.salary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
}

/* Cards */
.info-card,
.net-card,
.breakdown-card,
.notes-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
}

/* Employee Header */
.employee-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
}

.employee-details {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.employee-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.employee-code {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Info List */
.info-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) 0;
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

/* Net Card */
.net-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.05), rgba(48, 209, 88, 0.1));
  border-color: #34c759;
}

.net-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.net-value {
  font-size: 36px;
  font-weight: 700;
  color: #34c759;
  margin: var(--space-sm) 0;
}

.net-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* Breakdown Card */
.breakdown-card {
  grid-column: span 2;
}

.breakdown-section {
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 var(--space-md) 0;
}

.breakdown-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) 0;
}

.row-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.row-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.row-value.deduction {
  color: #ff3b30;
}

.inline-input {
  width: 120px;
}

.breakdown-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-md);
}

.total-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.total-value {
  font-size: 24px;
  font-weight: 700;
  color: #34c759;
}

/* Notes Card */
.notes-card {
  grid-column: span 2;
}

.notes-text {
  font-size: 14px;
  color: var(--color-text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.notes-empty {
  font-size: 14px;
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* Edit Actions */
.edit-actions {
  grid-column: span 2;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
}

/* Responsive */
@media (max-width: 768px) {
  .salary-grid {
    grid-template-columns: 1fr;
  }

  .breakdown-card,
  .notes-card,
  .edit-actions {
    grid-column: span 1;
  }

  .net-value {
    font-size: 28px;
  }
}
</style>
