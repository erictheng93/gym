<script setup lang="ts">
/**
 * Fitness Dashboard Page
 * Overview of goals, measurements, and workouts
 */

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { activeGoals, fetchGoals, isLoading: goalsLoading } = useGoals()
const { latestMeasurement, fetchLatestMeasurement, stats, fetchStats, isLoading: measurementsLoading } = useMeasurements()
const { stats: workoutStats, fetchStats: fetchWorkoutStats, hasWorkoutToday, isLoading: workoutsLoading } = useWorkouts()

// Load data on mount
onMounted(async () => {
  await Promise.all([
    fetchGoals({ status: 'IN_PROGRESS', limit: 3 }),
    fetchLatestMeasurement(),
    fetchStats('30'),
    fetchWorkoutStats('week'),
  ])
})

const isLoading = computed(() => goalsLoading.value || measurementsLoading.value || workoutsLoading.value)
</script>

<template>
  <div class="fitness-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/profile" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">健身追蹤</h1>
      <div class="header-spacer" />
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner" />
      <p>載入中...</p>
    </div>

    <template v-else>
      <!-- Quick Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </span>
          <div class="stat-content">
            <span class="stat-value">{{ workoutStats?.total_workouts || 0 }}</span>
            <span class="stat-label">本週運動</span>
          </div>
        </div>
        <div class="stat-card" :class="{ highlight: hasWorkoutToday }">
          <span class="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div class="stat-content">
            <span class="stat-value">{{ hasWorkoutToday ? '已完成' : '未完成' }}</span>
            <span class="stat-label">今日運動</span>
          </div>
        </div>
      </div>

      <!-- Goals Section -->
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">進行中的目標</h2>
          <NuxtLink to="/fitness/goals" class="section-link">
            查看全部
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </NuxtLink>
        </div>

        <div v-if="activeGoals.length > 0" class="goals-list">
          <GoalCard
            v-for="goal in activeGoals.slice(0, 2)"
            :key="goal.id"
            :goal="goal"
            @click="router.push(`/fitness/goals/${goal.id}`)"
          />
        </div>
        <div v-else class="empty-section">
          <p>還沒有設定目標</p>
          <NuxtLink to="/fitness/goals/new" class="btn-link">設定第一個目標</NuxtLink>
        </div>
      </section>

      <!-- Body Measurements Section -->
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">體態數據</h2>
          <NuxtLink to="/fitness/measurements" class="section-link">
            查看更多
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </NuxtLink>
        </div>

        <div v-if="latestMeasurement" class="measurement-summary">
          <div v-if="latestMeasurement.weight" class="measurement-item">
            <span class="measurement-label">體重</span>
            <span class="measurement-value">{{ latestMeasurement.weight }} kg</span>
            <span v-if="stats?.weight?.change" class="measurement-change" :class="stats.weight.change < 0 ? 'text-success' : 'text-warning'">
              {{ stats.weight.change > 0 ? '+' : '' }}{{ stats.weight.change }} kg
            </span>
          </div>
          <div v-if="latestMeasurement.body_fat" class="measurement-item">
            <span class="measurement-label">體脂率</span>
            <span class="measurement-value">{{ latestMeasurement.body_fat }}%</span>
            <span v-if="stats?.body_fat?.change" class="measurement-change" :class="stats.body_fat.change < 0 ? 'text-success' : 'text-warning'">
              {{ stats.body_fat.change > 0 ? '+' : '' }}{{ stats.body_fat.change }}%
            </span>
          </div>
          <div v-if="latestMeasurement.muscle_mass" class="measurement-item">
            <span class="measurement-label">肌肉量</span>
            <span class="measurement-value">{{ latestMeasurement.muscle_mass }} kg</span>
            <span v-if="stats?.muscle_mass?.change" class="measurement-change" :class="stats.muscle_mass.change > 0 ? 'text-success' : 'text-warning'">
              {{ stats.muscle_mass.change > 0 ? '+' : '' }}{{ stats.muscle_mass.change }} kg
            </span>
          </div>
        </div>
        <div v-else class="empty-section">
          <p>還沒有體態記錄</p>
          <NuxtLink to="/fitness/measurements/new" class="btn-link">記錄第一筆數據</NuxtLink>
        </div>
      </section>

      <!-- Workouts Section -->
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">運動紀錄</h2>
          <NuxtLink to="/fitness/workouts" class="section-link">
            查看全部
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </NuxtLink>
        </div>

        <div v-if="workoutStats && workoutStats.total_workouts > 0" class="workout-summary">
          <div class="summary-row">
            <span class="summary-label">本週運動天數</span>
            <span class="summary-value">{{ workoutStats.workout_days }} 天</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">總運動時間</span>
            <span class="summary-value">{{ workoutStats.total_duration }} 分鐘</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">總消耗熱量</span>
            <span class="summary-value">{{ workoutStats.total_calories }} 大卡</span>
          </div>
        </div>
        <div v-else class="empty-section">
          <p>本週還沒有運動記錄</p>
          <NuxtLink to="/fitness/workouts/new" class="btn-link">記錄今天的運動</NuxtLink>
        </div>
      </section>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <NuxtLink to="/fitness/workouts/new" class="action-btn primary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          記錄運動
        </NuxtLink>
        <NuxtLink to="/fitness/measurements/new" class="action-btn secondary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          記錄體態
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fitness-page {
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

.header-spacer {
  width: 36px;
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
}

.stat-card.highlight {
  background-color: rgba(16, 185, 129, 0.05);
  border-color: rgba(16, 185, 129, 0.3);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: rgba(16, 185, 129, 0.1);
  border-radius: 12px;
  color: var(--color-primary);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.section-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--color-primary);
  text-decoration: none;
}

.goals-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
}

.empty-section p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.btn-link {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-primary);
  text-decoration: none;
}

.measurement-summary {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
}

.measurement-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
}

.measurement-item:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.measurement-label {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.measurement-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-right: 12px;
}

.measurement-change {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.text-success {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.text-warning {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.workout-summary {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
}

.summary-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.summary-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.summary-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.action-btn.primary {
  background-color: var(--color-primary);
  color: white;
}

.action-btn.primary:active {
  background-color: #059669;
}

.action-btn.secondary {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.action-btn.secondary:active {
  background-color: var(--color-border);
}
</style>
