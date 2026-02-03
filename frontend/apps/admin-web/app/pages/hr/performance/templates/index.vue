<script setup lang="ts">
/**
 * KPI 範本管理頁面
 */
import { usePerformance } from '~/composables/hr'

definePageMeta({
  middleware: 'auth'
})

const { confirm } = useConfirm()
const toast = useToast()

const {
  kpiTemplates,
  isLoading,
  fetchKPITemplates,
  createKPITemplate,
  deleteKPITemplate
} = usePerformance()

const showCreateModal = ref(false)
const newTemplate = ref({
  name: '',
  description: '',
  kpis: [
    { id: 'kpi_1', name: '', weight: 25, target: 0 }
  ]
})

onMounted(fetchKPITemplates)

// Add KPI item
const addKPI = () => {
  const id = `kpi_${newTemplate.value.kpis.length + 1}`
  newTemplate.value.kpis.push({ id, name: '', weight: 0, target: 0 })
}

// Remove KPI item
const removeKPI = (index: number) => {
  if (newTemplate.value.kpis.length > 1) {
    newTemplate.value.kpis.splice(index, 1)
  }
}

// Calculate total weight
const totalWeight = computed(() => {
  return newTemplate.value.kpis.reduce((sum, kpi) => sum + (kpi.weight || 0), 0)
})

// Create template
const handleCreate = async () => {
  if (!newTemplate.value.name.trim()) {
    toast.warning('請輸入範本名稱')
    return
  }

  if (totalWeight.value !== 100) {
    toast.warning('KPI 權重總和必須為 100%')
    return
  }

  const hasEmptyKPI = newTemplate.value.kpis.some(kpi => !kpi.name.trim())
  if (hasEmptyKPI) {
    toast.warning('請填寫所有 KPI 名稱')
    return
  }

  try {
    await createKPITemplate({
      name: newTemplate.value.name,
      description: newTemplate.value.description,
      kpis: newTemplate.value.kpis
    })
    toast.success('範本建立成功')
    showCreateModal.value = false
    resetForm()
    await fetchKPITemplates()
  } catch (error) {
    console.error('Failed to create template:', error)
    toast.error('建立失敗')
  }
}

// Reset form
const resetForm = () => {
  newTemplate.value = {
    name: '',
    description: '',
    kpis: [{ id: 'kpi_1', name: '', weight: 25, target: 0 }]
  }
}

// Delete template
const handleDelete = async (templateId: string) => {
  const confirmed = await confirm({
    title: '刪除範本',
    message: '確定要刪除此 KPI 範本嗎？此操作無法復原。',
    confirmText: '確定刪除',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  try {
    await deleteKPITemplate(templateId)
    toast.success('範本已刪除')
    await fetchKPITemplates()
  } catch (error) {
    console.error('Failed to delete template:', error)
    toast.error('刪除失敗')
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="KPI 範本管理"
      description="建立與管理績效考核 KPI 範本"
      back-to="/hr/performance"
    >
      <template #actions>
        <button class="btn btn-primary" @click="showCreateModal = true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          新增範本
        </button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" />

    <div v-else-if="kpiTemplates.length" class="templates-grid">
      <div v-for="template in kpiTemplates" :key="template.id" class="template-card">
        <div class="template-header">
          <h3 class="template-name">{{ template.name }}</h3>
          <button class="btn-icon delete" @click="handleDelete(template.id)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>

        <p v-if="template.description" class="template-desc">{{ template.description }}</p>

        <div class="kpi-list">
          <div v-for="kpi in template.kpis" :key="kpi.id" class="kpi-item">
            <span class="kpi-name">{{ kpi.name }}</span>
            <div class="kpi-meta">
              <span class="kpi-weight">{{ kpi.weight }}%</span>
              <span v-if="kpi.target" class="kpi-target">目標: {{ kpi.target }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <EmptyState
      v-else
      title="尚無 KPI 範本"
      description="點擊上方按鈕建立第一個範本"
      icon="file-text"
    />

    <!-- Create Modal -->
    <AppModal
      v-model="showCreateModal"
      title="新增 KPI 範本"
      max-width="lg"
    >
      <div class="modal-form">
        <FormInput
          v-model="newTemplate.name"
          label="範本名稱"
          placeholder="例：業務人員 KPI"
          required
        />

        <FormTextarea
          v-model="newTemplate.description"
          label="說明"
          placeholder="範本說明（選填）"
          :rows="2"
        />

        <div class="kpi-section">
          <div class="kpi-header">
            <span class="section-title">KPI 項目</span>
            <span :class="['weight-total', { valid: totalWeight === 100 }]">
              權重總計: {{ totalWeight }}%
            </span>
          </div>

          <div v-for="(kpi, index) in newTemplate.kpis" :key="kpi.id" class="kpi-form-row">
            <FormInput
              v-model="kpi.name"
              placeholder="KPI 名稱"
              class="kpi-name-input"
            />
            <FormInput
              v-model="kpi.weight"
              type="number"
              placeholder="權重"
              :min="0"
              :max="100"
              class="kpi-weight-input"
            >
              <template #suffix>%</template>
            </FormInput>
            <FormInput
              v-model="kpi.target"
              type="number"
              placeholder="目標值"
              :min="0"
              class="kpi-target-input"
            />
            <button
              type="button"
              class="btn-icon remove"
              :disabled="newTemplate.kpis.length === 1"
              @click="removeKPI(index)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>

          <button type="button" class="btn btn-secondary btn-sm" @click="addKPI">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14" /><path d="M5 12h14" />
            </svg>
            新增 KPI
          </button>
        </div>
      </div>

      <template #footer>
        <button class="btn btn-secondary" @click="showCreateModal = false">取消</button>
        <button class="btn btn-primary" @click="handleCreate">建立範本</button>
      </template>
    </AppModal>
  </PageContainer>
</template>

<style scoped>
/* Templates Grid */
.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-lg);
}

.template-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-sm);
}

.template-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.template-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-lg) 0;
}

/* KPI List */
.kpi-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.kpi-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.kpi-name {
  font-size: 14px;
  color: var(--color-text-primary);
}

.kpi-meta {
  display: flex;
  gap: var(--space-md);
}

.kpi-weight {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.kpi-target {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* Button Icons */
.btn-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast);
}

.btn-icon:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.btn-icon.delete:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.btn-icon.remove:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Modal Form */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.kpi-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.weight-total {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.weight-total.valid {
  color: #34c759;
  font-weight: 500;
}

.kpi-form-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px 32px;
  gap: var(--space-sm);
  align-items: flex-start;
}

.btn-sm {
  padding: var(--space-sm) var(--space-md);
  font-size: 13px;
}
</style>
