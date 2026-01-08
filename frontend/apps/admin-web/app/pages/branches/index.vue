<script setup lang="ts">
/**
 * 分店管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 */
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const { branches, isLoading, fetchBranches } = useBranches()

// Computed stats
const statsConfig = computed(() => [
  { label: PAGES.BRANCHES.TOTAL_BRANCHES, value: branches.value.length, icon: 'calendar' as const, variant: 'default' as const },
  { label: PAGES.BRANCHES.HEADQUARTERS, value: branches.value.filter(b => b.type === 'HEADQUARTER').length, icon: 'dollar' as const, variant: 'warning' as const },
  { label: STATUS.OPERATING, value: branches.value.filter(b => b.status === 'active').length, icon: 'check' as const, variant: 'success' as const }
])

// Initial load
onMounted(() => {
  fetchBranches()
})

// Helper functions
const branchTypeLabel = (type: string) => {
  return type === 'HEADQUARTER' ? LABELS.BRANCH_TYPE.HEADQUARTER : LABELS.BRANCH_TYPE.BRANCH
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.BRANCHES.TITLE"
      :description="PAGES.BRANCHES.DESCRIPTION"
      :action-label="PAGES.BRANCHES.ADD_BRANCH"
      action-to="/branches/new"
      action-icon="plus"
    />

    <!-- Stats Grid -->
    <StatsGrid :stats="statsConfig" />

    <!-- Loading State -->
    <LoadingState v-if="isLoading" :message="MESSAGES.ACTIONS.LOADING" />

    <!-- Empty State -->
    <div v-else-if="branches.length === 0" class="card">
      <EmptyState
        :title="PAGES.BRANCHES.NO_BRANCHES"
        :description="PAGES.BRANCHES.NO_BRANCHES_HINT"
        icon="calendar"
        :action-label="PAGES.BRANCHES.ADD_BRANCH"
        action-to="/branches/new"
      />
    </div>

    <!-- Branches Grid -->
    <div v-else class="branches-grid">
      <div
        v-for="branch in branches"
        :key="branch.id"
        class="branch-card card"
        :class="{ archived: branch.status === 'archived' }"
      >
        <div class="branch-header">
          <div class="branch-icon" :class="branch.type === 'HEADQUARTER' ? 'hq' : 'branch'">
            <svg v-if="branch.type === 'HEADQUARTER'" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" /><path d="M12 3v6" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div class="branch-badges">
            <AppBadge
              :label="branchTypeLabel(branch.type)"
              :variant="branch.type === 'HEADQUARTER' ? 'warning' : 'info'"
            />
            <AppBadge
              :label="branch.status === 'archived' ? STATUS.DISABLED : STATUS.OPERATING"
              :variant="branch.status === 'archived' ? 'default' : 'success'"
            />
          </div>
        </div>

        <h3 class="branch-name">{{ branch.name }}</h3>

        <div class="branch-details">
          <div v-if="branch.address" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <span>{{ branch.address }}</span>
          </div>

          <div v-if="branch.phone" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span>{{ branch.phone }}</span>
          </div>

          <div v-if="branch.tax_id" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <span>{{ PAGES.BRANCHES.TAX_ID_PREFIX }}{{ branch.tax_id }}</span>
          </div>
        </div>

        <div class="branch-actions">
          <NuxtLink :to="`/branches/${branch.id}/edit`" class="btn btn-secondary btn-small">
            {{ MESSAGES.FORM.EDIT }}
          </NuxtLink>
          <NuxtLink :to="`/branches/${branch.id}`" class="btn btn-secondary btn-small">
            {{ MESSAGES.ACTIONS.VIEW_DETAILS }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
/* Branches Grid */
.branches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-lg);
}

.branch-card {
  padding: var(--space-lg);
  transition: all var(--duration-fast) var(--ease-out);
}

.branch-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-lg);
}

.branch-card.archived {
  opacity: 0.6;
}

.branch-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-md);
}

.branch-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.branch-icon.hq {
  background: linear-gradient(135deg, #ff9500, #ff5e3a);
  color: white;
}

.branch-icon.branch {
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
}

.branch-badges {
  display: flex;
  gap: var(--space-xs);
}

.branch-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-md) 0;
}

.branch-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.detail-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  font-size: 14px;
  color: var(--color-text-secondary);
}

.detail-item svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.branch-actions {
  display: flex;
  gap: var(--space-sm);
}

.branch-actions .btn {
  flex: 1;
}

/* Responsive */
@media (max-width: 768px) {
  .branches-grid {
    grid-template-columns: 1fr;
  }
}
</style>
