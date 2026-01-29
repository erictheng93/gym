<script setup lang="ts">
/**
 * New Measurement Page
 * Record a new body measurement
 */

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const toast = useToast()
const { createMeasurement } = useMeasurements()

// Form state
const form = reactive({
  date: new Date().toISOString().split('T')[0],
  weight: null as number | null,
  body_fat: null as number | null,
  muscle_mass: null as number | null,
  bmi: null as number | null,
})
const isSubmitting = ref(false)

// Submit handler
const handleSubmit = async () => {
  // Validation
  if (!form.weight && !form.body_fat && !form.muscle_mass && !form.bmi) {
    toast.error('請至少輸入一項數據')
    return
  }

  isSubmitting.value = true

  try {
    const result = await createMeasurement({
      date: form.date,
      weight: form.weight,
      body_fat: form.body_fat,
      muscle_mass: form.muscle_mass,
      bmi: form.bmi,
      source: 'MANUAL',
    })

    if (result.success) {
      toast.success('數據已記錄')
      router.replace('/fitness/measurements')
    } else {
      toast.error(result.message)
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="new-measurement-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness/measurements" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">記錄體態</h1>
      <div class="header-spacer" />
    </div>

    <!-- Form -->
    <form class="measurement-form" @submit.prevent="handleSubmit">
      <!-- Date -->
      <div class="form-group">
        <label for="date" class="form-label">日期</label>
        <input
          id="date"
          v-model="form.date"
          type="date"
          class="form-input"
          :max="new Date().toISOString().split('T')[0]"
        >
      </div>

      <!-- Weight -->
      <div class="form-group">
        <label for="weight" class="form-label">
          體重
          <span class="unit">(kg)</span>
        </label>
        <input
          id="weight"
          v-model.number="form.weight"
          type="number"
          class="form-input"
          inputmode="decimal"
          step="0.1"
          min="20"
          max="300"
          placeholder="例如：65.5"
        >
      </div>

      <!-- Body Fat -->
      <div class="form-group">
        <label for="body_fat" class="form-label">
          體脂率
          <span class="unit">(%)</span>
        </label>
        <input
          id="body_fat"
          v-model.number="form.body_fat"
          type="number"
          class="form-input"
          inputmode="decimal"
          step="0.1"
          min="1"
          max="60"
          placeholder="例如：18.5"
        >
      </div>

      <!-- Muscle Mass -->
      <div class="form-group">
        <label for="muscle_mass" class="form-label">
          肌肉量
          <span class="unit">(kg)</span>
        </label>
        <input
          id="muscle_mass"
          v-model.number="form.muscle_mass"
          type="number"
          class="form-input"
          inputmode="decimal"
          step="0.1"
          min="10"
          max="150"
          placeholder="例如：28.0"
        >
      </div>

      <!-- BMI -->
      <div class="form-group">
        <label for="bmi" class="form-label">
          BMI
          <span class="unit">(選填，會自動計算)</span>
        </label>
        <input
          id="bmi"
          v-model.number="form.bmi"
          type="number"
          class="form-input"
          inputmode="decimal"
          step="0.1"
          min="10"
          max="50"
          placeholder="例如：22.5"
        >
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="submit-btn"
        :disabled="isSubmitting"
      >
        <span v-if="!isSubmitting">儲存記錄</span>
        <span v-else class="loading-spinner" />
      </button>
    </form>

    <!-- Tip -->
    <p class="tip">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      建議每週固定時間測量，以獲得更準確的趨勢數據
    </p>
  </div>
</template>

<style scoped>
.new-measurement-page {
  padding: 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
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

.header-spacer {
  width: 36px;
}

.measurement-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.unit {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-secondary);
}

.form-input {
  padding: 14px 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 16px;
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.form-input::placeholder {
  color: var(--color-text-tertiary);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 8px;
}

.submit-btn:active:not(:disabled) {
  background-color: #059669;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  font-size: 13px;
  color: var(--color-text-tertiary);
}
</style>
