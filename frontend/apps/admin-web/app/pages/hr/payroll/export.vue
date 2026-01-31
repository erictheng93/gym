<script setup lang="ts">
/**
 * 薪資匯出頁面
 */
definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const { exportPayroll, isLoading } = usePayroll()
const { branches, fetchBranches } = useBranches()

const exportForm = ref({
  period: getCurrentPeriod(),
  branch_id: '',
  format: 'csv',
  include_details: true
})

// Get current period
function getCurrentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Generate period options
const periodOptions = computed(() => {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
    options.push({ value, label })
  }
  return options
})

const formatOptions = [
  { value: 'csv', label: 'CSV (Excel 相容)' },
  { value: 'pdf', label: 'PDF 報表' }
]

onMounted(fetchBranches)

// Handle export
const handleExport = async () => {
  try {
    const blob = await exportPayroll({
      period: exportForm.value.period,
      branch_id: exportForm.value.branch_id || undefined,
      format: exportForm.value.format,
      include_details: exportForm.value.include_details
    })

    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const ext = exportForm.value.format === 'pdf' ? 'pdf' : 'csv'
    link.download = `payroll_${exportForm.value.period}.${ext}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.success('匯出成功')
  } catch (error) {
    console.error('Export failed:', error)
    toast.error('匯出失敗')
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="匯出薪資報表"
      description="匯出薪資資料供會計或人資使用"
      back-to="/hr/payroll"
    />

    <div class="export-container">
      <div class="export-card">
        <h2 class="card-title">匯出設定</h2>

        <FormSelect
          v-model="exportForm.period"
          label="薪資期間"
          required
        >
          <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </FormSelect>

        <FormSelect
          v-model="exportForm.branch_id"
          label="分店"
        >
          <option value="">全部分店</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </FormSelect>

        <FormSelect
          v-model="exportForm.format"
          label="檔案格式"
          :options="formatOptions"
        />

        <FormCheckbox
          v-model="exportForm.include_details"
          label="包含詳細明細"
          description="勾選後將包含加班、獎金、扣款等詳細資訊"
        />

        <div class="export-actions">
          <button
            class="btn btn-primary btn-lg"
            :disabled="isLoading"
            @click="handleExport"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            {{ isLoading ? '匯出中...' : '匯出報表' }}
          </button>
        </div>
      </div>

      <!-- Export Info -->
      <div class="info-card">
        <h3 class="info-title">匯出說明</h3>
        <ul class="info-list">
          <li>
            <strong>CSV 格式：</strong>
            可直接用 Excel 開啟，適合進一步處理或匯入其他系統
          </li>
          <li>
            <strong>PDF 格式：</strong>
            標準報表格式，適合列印存檔或簽核
          </li>
          <li>
            <strong>詳細明細：</strong>
            包含加班時數、加班費、業績獎金、扣款項目等
          </li>
        </ul>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.export-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
  max-width: 1000px;
}

.export-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.export-actions {
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border-light);
}

.btn-lg {
  width: 100%;
  padding: var(--space-md) var(--space-xl);
  font-size: 16px;
  gap: var(--space-sm);
}

/* Info Card */
.info-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  height: fit-content;
}

.info-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
}

.info-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.info-list li {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.info-list li strong {
  color: var(--color-text-primary);
}

/* Responsive */
@media (max-width: 768px) {
  .export-container {
    grid-template-columns: 1fr;
  }
}
</style>
