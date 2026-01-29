<script setup lang="ts">
/**
 * Issues List Page
 * Displays member's issue reports
 */
import type { IssueStatus } from '../../../schemas/issue.schema'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { issues, isLoading, fetchIssues, pendingIssues, resolvedIssues } = useIssues()

// Tab state
const activeTab = ref<'pending' | 'resolved'>('pending')

// Load issues on mount
onMounted(async () => {
  await fetchIssues()
})

const displayedIssues = computed(() => {
  return activeTab.value === 'pending' ? pendingIssues.value : resolvedIssues.value
})

const navigateToIssue = (issue: { id: string }) => {
  router.push(`/profile/issues/${issue.id}`)
}

const navigateToNew = () => {
  router.push('/profile/issues/new')
}
</script>

<template>
  <div class="issues-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/profile" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">問題回報</h1>
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
        :class="{ active: activeTab === 'pending' }"
        @click="activeTab = 'pending'"
      >
        處理中
        <span v-if="pendingIssues.length > 0" class="tab-badge">{{ pendingIssues.length }}</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'resolved' }"
        @click="activeTab = 'resolved'"
      >
        已結案
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner" />
      <p>載入中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayedIssues.length === 0" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <h3>{{ activeTab === 'pending' ? '沒有處理中的問題' : '沒有已結案的問題' }}</h3>
      <p v-if="activeTab === 'pending'">有任何問題或建議嗎？點擊右上角提交</p>
      <button v-if="activeTab === 'pending'" class="btn-primary" @click="navigateToNew">
        提交問題
      </button>
    </div>

    <!-- Issues List -->
    <div v-else class="issues-list">
      <IssueCard
        v-for="issue in displayedIssues"
        :key="issue.id"
        :issue="issue"
        @click="navigateToIssue"
      />
    </div>
  </div>
</template>

<style scoped>
.issues-page {
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
  gap: 8px;
  margin-bottom: 16px;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 14px;
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
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 9px;
  font-size: 11px;
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

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
