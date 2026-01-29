<script setup lang="ts">
/**
 * Measurements List Page
 * View body measurement history and trends
 */

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { measurements, isLoading, fetchMeasurements, fetchStats, stats, formatDate, deleteMeasurement } = useMeasurements()
const toast = useToast()

// Period selection
const selectedPeriod = ref<string>('30')

// Load measurements on mount
onMounted(async () => {
  await Promise.all([
    fetchMeasurements({ limit: 50 }),
    fetchStats(selectedPeriod.value),
  ])
})

// Watch period changes
watch(selectedPeriod, async (newPeriod) => {
  await fetchStats(newPeriod)
})

const navigateToNew = () => {
  router.push('/fitness/measurements/new')
}

const handleDelete = async (id: string) => {
  if (!confirm('確定要刪除此記錄嗎？')) return

  const result = await deleteMeasurement(id)
  if (result.success) {
    toast.success('記錄已刪除')
  } else {
    toast.error(result.message)
  }
}
</script>

<template>
  <div class="measurements-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">體態記錄</h1>
      <button class="add-btn" @click="navigateToNew">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner" />
      <p>載入中...</p>
    </div>

    <template v-else>
      <!-- Period Selector -->
      <div class="period-selector">
        <button
          v-for="(label, days) in { '7': '7天', '30': '30天', '90': '90天' }"
          :key="days"
          class="period-btn"
          :class="{ active: selectedPeriod === days }"
          @click="selectedPeriod = days"
        >
          {{ label }}
        </button>
      </div>

      <!-- Charts Section -->
      <div v-if="measurements.length > 0" class="charts-section">
        <MeasurementChart
          v-if="measurements.some(m => m.weight)"
          :measurements="measurements"
          metric="weight"
          label="體重"
          unit="kg"
        />
        <MeasurementChart
          v-if="measurements.some(m => m.body_fat)"
          :measurements="measurements"
          metric="body_fat"
          label="體脂率"
          unit="%"
        />
        <MeasurementChart
          v-if="measurements.some(m => m.muscle_mass)"
          :measurements="measurements"
          metric="muscle_mass"
          label="肌肉量"
          unit="kg"
        />
      </div>

      <!-- Empty State -->
      <div v-if="measurements.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <h3>還沒有體態記錄</h3>
        <p>開始追蹤你的體態變化</p>
        <button class="btn-primary" @click="navigateToNew">
          記錄第一筆數據
        </button>
      </div>

      <!-- History List -->
      <section v-else class="section">
        <h2 class="section-title">歷史記錄</h2>
        <div class="history-list">
          <div
            v-for="m in measurements"
            :key="m.id"
            class="history-item"
          >
            <div class="history-header">
              <span class="history-date">{{ formatDate(m.date) }}</span>
              <button class="delete-btn" @click="handleDelete(m.id)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
            <div class="history-values">
              <div v-if="m.weight" class="history-value">
                <span class="value-label">體重</span>
                <span class="value-text">{{ m.weight }} kg</span>
              </div>
              <div v-if="m.body_fat" class="history-value">
                <span class="value-label">體脂</span>
                <span class="value-text">{{ m.body_fat }}%</span>
              </div>
              <div v-if="m.muscle_mass" class="history-value">
                <span class="value-label">肌肉</span>
                <span class="value-text">{{ m.muscle_mass }} kg</span>
              </div>
              <div v-if="m.bmi" class="history-value">
                <span class="value-label">BMI</span>
                <span class="value-text">{{ m.bmi }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.measurements-page {
  padding: 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--color-text);
  transition: background-color 0.2s;
}

.back-btn:active {
  background-color: var(--color-border);
}

.page-title {
  flex: 1;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: var(--color-primary);
  border: none;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
}

.add-btn:active {
  background-color: #059669;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--color-text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.period-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.period-btn {
  flex: 1;
  padding: 10px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.period-btn.active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.charts-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;
}

.empty-state svg {
  color: var(--color-text-tertiary);
}

.empty-state h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.empty-state p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.btn-primary {
  margin-top: 8px;
  padding: 12px 24px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  cursor: pointer;
}

.btn-primary:active {
  background-color: #059669;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-item {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 16px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.history-date {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.delete-btn:active {
  background-color: var(--color-border);
  color: var(--color-error);
}

.history-values {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.history-value {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.value-label {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.value-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}
</style>
