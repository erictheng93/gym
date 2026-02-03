<script setup lang="ts">
/**
 * Goals List Page
 * Displays all member's fitness goals
 */
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { isLoading, fetchGoals, activeGoals, achievedGoals, abandonedGoals } = useGoals()

// Tab state
const activeTab = ref<'active' | 'achieved' | 'abandoned'>('active')

// Load goals on mount
onMounted(async () => {
  await fetchGoals()
})

const displayedGoals = computed(() => {
  switch (activeTab.value) {
    case 'active':
      return activeGoals.value
    case 'achieved':
      return achievedGoals.value
    case 'abandoned':
      return abandonedGoals.value
    default:
      return activeGoals.value
  }
})

const navigateToGoal = (goal: { id: string }) => {
  router.push(`/fitness/goals/${goal.id}`)
}

const navigateToNew = () => {
  router.push('/fitness/goals/new')
}
</script>

<template>
  <div class="goals-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">健身目標</h1>
      <button class="add-btn" @click="navigateToNew">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'active' }"
        @click="activeTab = 'active'"
      >
        進行中
        <span v-if="activeGoals.length > 0" class="tab-badge">{{ activeGoals.length }}</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'achieved' }"
        @click="activeTab = 'achieved'"
      >
        已達成
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'abandoned' }"
        @click="activeTab = 'abandoned'"
      >
        已放棄
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner" />
      <p>載入中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedGoals.length === 0" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <h3>
        {{ activeTab === 'active' ? '沒有進行中的目標' : activeTab === 'achieved' ? '還沒有達成的目標' : '沒有放棄的目標' }}
      </h3>
      <p v-if="activeTab === 'active'">設定一個健身目標，開始追蹤進度</p>
      <button v-if="activeTab === 'active'" class="btn-primary" @click="navigateToNew">
        設定目標
      </button>
    </div>

    <!-- Goals List -->
    <div v-else class="goals-list">
      <GoalCard
        v-for="goal in displayedGoals"
        :key="goal.id"
        :goal="goal"
        @click="navigateToGoal"
      />
    </div>
  </div>
</template>

<style scoped>
.goals-page {
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

.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab.active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

.tab:not(.active) .tab-badge {
  background-color: var(--color-primary);
  color: white;
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
  transition: background-color 0.2s;
}

.btn-primary:active {
  background-color: #059669;
}

.goals-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
