<script setup lang="ts">
/**
 * Workouts List Page
 * View workout history
 */

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { workouts, totalWorkouts, isLoading, fetchWorkouts, fetchStats, stats } = useWorkouts()

// Period selection for stats
const selectedPeriod = ref<'week' | 'month'>('week')

// Load workouts on mount
onMounted(async () => {
  await Promise.all([
    fetchWorkouts({ limit: 20 }),
    fetchStats(selectedPeriod.value),
  ])
})

// Watch period changes
watch(selectedPeriod, async (newPeriod) => {
  await fetchStats(newPeriod)
})

const navigateToWorkout = (workout: { id: string }) => {
  router.push(`/fitness/workouts/${workout.id}`)
}

const navigateToNew = () => {
  router.push('/fitness/workouts/new')
}
</script>

<template>
  <div class="workouts-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">運動紀錄</h1>
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
          class="period-btn"
          :class="{ active: selectedPeriod === 'week' }"
          @click="selectedPeriod = 'week'"
        >
          本週
        </button>
        <button
          class="period-btn"
          :class="{ active: selectedPeriod === 'month' }"
          @click="selectedPeriod = 'month'"
        >
          本月
        </button>
      </div>

      <!-- Stats Cards -->
      <div v-if="stats" class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">{{ stats.total_workouts }}</span>
          <span class="stat-label">運動次數</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ stats.workout_days }}</span>
          <span class="stat-label">運動天數</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ stats.total_duration }}</span>
          <span class="stat-label">總時長 (分鐘)</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ stats.total_calories }}</span>
          <span class="stat-label">消耗卡路里</span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="workouts.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
        </svg>
        <h3>還沒有運動紀錄</h3>
        <p>開始記錄你的每次運動</p>
        <button class="btn-primary" @click="navigateToNew">
          記錄第一次運動
        </button>
      </div>

      <!-- Workouts List -->
      <section v-else class="section">
        <h2 class="section-title">
          歷史紀錄
          <span class="total-count">共 {{ totalWorkouts }} 筆</span>
        </h2>
        <div class="workouts-list">
          <WorkoutCard
            v-for="workout in workouts"
            :key="workout.id"
            :workout="workout"
            @click="navigateToWorkout"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.workouts-page {
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px;
}

.total-count {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-secondary);
}

.workouts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
