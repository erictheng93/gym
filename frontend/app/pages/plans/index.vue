<script setup lang="ts">
import { MESSAGES, PAGES, LABELS } from '~/constants'

const { plans, isLoading, fetchPlans } = usePlans()

onMounted(() => {
  fetchPlans()
})

const planTypeLabel = (type: string) => {
  return type === 'TIME_BASED' ? LABELS.CONTRACT_TYPE.TIME_BASED : LABELS.CONTRACT_TYPE.COUNT_BASED
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(price)
}
</script>

<template>
  <div class="plans-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <h1>{{ PAGES.PLANS.TITLE }}</h1>
        <p>{{ PAGES.PLANS.DESCRIPTION }}</p>
      </div>
      <NuxtLink to="/plans/new" class="btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"/><path d="M12 5v14"/>
        </svg>
        {{ PAGES.PLANS.ADD_PLAN }}
      </NuxtLink>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ plans.filter(p => p.status === 'active').length }}</span>
          <span class="stat-label">{{ PAGES.PLANS.ENABLED_PLANS }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ plans.filter(p => p.plan_type === 'TIME_BASED').length }}</span>
          <span class="stat-label">{{ PAGES.PLANS.TIME_BASED_PLANS }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ plans.filter(p => p.plan_type === 'COUNT_BASED').length }}</span>
          <span class="stat-label">{{ PAGES.PLANS.COUNT_BASED_PLANS }}</span>
        </div>
      </div>
    </div>

    <!-- Plans Grid -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <div v-else-if="plans.length === 0" class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
      </svg>
      <h3>{{ PAGES.PLANS.NO_PLANS }}</h3>
      <p>{{ PAGES.PLANS.NO_PLANS_HINT }}</p>
      <NuxtLink to="/plans/new" class="btn-primary">{{ PAGES.PLANS.ADD_PLAN }}</NuxtLink>
    </div>

    <div v-else class="plans-grid">
      <div v-for="plan in plans" :key="plan.id" class="plan-card" :class="{ archived: plan.status === 'archived' }">
        <div class="plan-header">
          <div class="plan-type-badge" :class="plan.plan_type === 'TIME_BASED' ? 'time' : 'count'">
            {{ planTypeLabel(plan.plan_type) }}
          </div>
          <div v-if="plan.status === 'archived'" class="archived-badge">{{ PAGES.PLANS.ARCHIVED }}</div>
        </div>

        <h3 class="plan-name">{{ plan.name }}</h3>
        <p class="plan-price">{{ formatPrice(plan.price) }}</p>

        <div class="plan-details">
          <div v-if="plan.plan_type === 'TIME_BASED'" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            <span>{{ plan.duration_months }} {{ PAGES.PLANS.MONTHS }}</span>
          </div>
          <div v-else class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <span>{{ plan.class_counts }} {{ PAGES.PLANS.CLASSES }}</span>
          </div>

          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            <span>{{ plan.allow_transfer ? LABELS.TRANSFERABLE : LABELS.NON_TRANSFERABLE }}</span>
          </div>

          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
            </svg>
            <span>{{ plan.allow_pause ? LABELS.PAUSABLE : LABELS.NON_PAUSABLE }}</span>
          </div>
        </div>

        <p v-if="plan.description" class="plan-description">{{ plan.description }}</p>

        <div class="plan-actions">
          <NuxtLink :to="`/plans/${plan.id}/edit`" class="btn-secondary">{{ PAGES.PLANS.EDIT }}</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plans-page {
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

.stat-icon.green {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.stat-icon.purple {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
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

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-lg);
}

.plan-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
  transition: all var(--duration-fast) var(--ease-out);
}

.plan-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-lg);
}

.plan-card.archived {
  opacity: 0.6;
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.plan-type-badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.plan-type-badge.time {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-accent);
}

.plan-type-badge.count {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.archived-badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  background: rgba(142, 142, 147, 0.1);
  color: var(--color-text-tertiary);
}

.plan-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-sm) 0;
}

.plan-price {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-accent);
  margin: 0 0 var(--space-lg) 0;
}

.plan-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.detail-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
  color: var(--color-text-secondary);
}

.plan-description {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: 0 0 var(--space-lg) 0;
  line-height: 1.5;
}

.plan-actions {
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
}
</style>
