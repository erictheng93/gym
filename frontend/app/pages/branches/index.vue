<script setup lang="ts">
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'

const { branches, isLoading, fetchBranches } = useBranches()

onMounted(() => {
  fetchBranches()
})

const branchTypeLabel = (type: string) => {
  return type === 'HEADQUARTER' ? LABELS.BRANCH_TYPE.HEADQUARTER : LABELS.BRANCH_TYPE.BRANCH
}
</script>

<template>
  <div class="branches-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <h1>{{ PAGES.BRANCHES.TITLE }}</h1>
        <p>{{ PAGES.BRANCHES.DESCRIPTION }}</p>
      </div>
      <NuxtLink to="/branches/new" class="btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"/><path d="M12 5v14"/>
        </svg>
        {{ PAGES.BRANCHES.ADD_BRANCH }}
      </NuxtLink>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ branches.length }}</span>
          <span class="stat-label">{{ PAGES.BRANCHES.TOTAL_BRANCHES }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ branches.filter(b => b.type === 'HEADQUARTER').length }}</span>
          <span class="stat-label">{{ PAGES.BRANCHES.HEADQUARTERS }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ branches.filter(b => b.status === 'active').length }}</span>
          <span class="stat-label">{{ STATUS.OPERATING }}</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="branches.length === 0" class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <h3>{{ PAGES.BRANCHES.NO_BRANCHES }}</h3>
      <p>{{ PAGES.BRANCHES.NO_BRANCHES_HINT }}</p>
      <NuxtLink to="/branches/new" class="btn-primary">{{ PAGES.BRANCHES.ADD_BRANCH }}</NuxtLink>
    </div>

    <!-- Branches Grid -->
    <div v-else class="branches-grid">
      <div v-for="branch in branches" :key="branch.id" class="branch-card" :class="{ archived: branch.status === 'archived' }">
        <div class="branch-header">
          <div class="branch-icon" :class="branch.type === 'HEADQUARTER' ? 'hq' : 'branch'">
            <svg v-if="branch.type === 'HEADQUARTER'" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div class="branch-badges">
            <span class="type-badge" :class="branch.type === 'HEADQUARTER' ? 'hq' : 'branch'">
              {{ branchTypeLabel(branch.type) }}
            </span>
            <span v-if="branch.status === 'archived'" class="status-badge archived">{{ STATUS.DISABLED }}</span>
            <span v-else class="status-badge active">{{ STATUS.OPERATING }}</span>
          </div>
        </div>

        <h3 class="branch-name">{{ branch.name }}</h3>

        <div class="branch-details">
          <div v-if="branch.address" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span>{{ branch.address }}</span>
          </div>

          <div v-if="branch.phone" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>{{ branch.phone }}</span>
          </div>

          <div v-if="branch.tax_id" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
            </svg>
            <span>{{ PAGES.BRANCHES.TAX_ID_PREFIX }}{{ branch.tax_id }}</span>
          </div>
        </div>

        <div class="branch-actions">
          <NuxtLink :to="`/branches/${branch.id}/edit`" class="btn-secondary">{{ MESSAGES.FORM.EDIT }}</NuxtLink>
          <NuxtLink :to="`/branches/${branch.id}`" class="btn-secondary">{{ MESSAGES.ACTIONS.VIEW_DETAILS }}</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.branches-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.header-content p {
  color: var(--color-text-secondary);
  margin: 0;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-primary:hover {
  background: var(--color-accent-hover);
  transform: scale(1.02);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.blue {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-accent);
}

.stat-icon.orange {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.stat-icon.green {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: var(--space-xs);
}

.branches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-lg);
}

.branch-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
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

.type-badge,
.status-badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.type-badge.hq {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.type-badge.branch {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-accent);
}

.status-badge.active {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.status-badge.archived {
  background: rgba(142, 142, 147, 0.1);
  color: var(--color-text-tertiary);
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

.btn-secondary {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-secondary:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.loading-state p,
.empty-state h3 {
  margin: var(--space-md) 0 var(--space-sm) 0;
  color: var(--color-text-primary);
}

.empty-state p {
  color: var(--color-text-tertiary);
  margin: 0 0 var(--space-lg) 0;
}

.empty-state svg {
  color: var(--color-text-quaternary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .branches-grid {
    grid-template-columns: 1fr;
  }
}
</style>
