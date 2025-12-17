<script setup lang="ts">
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'

const { plans, isLoading, fetchPlans, deletePlan } = usePlans()

// 篩選狀態
const statusFilter = ref<'all' | 'active' | 'archived'>('all')
const typeFilter = ref<'all' | 'TIME_BASED' | 'COUNT_BASED'>('all')

// 載入所有方案（不篩選狀態）
onMounted(() => {
  fetchPlans({ status: '' }) // 空字串表示不篩選
})

// 篩選後的方案
const filteredPlans = computed(() => {
  return plans.value.filter(plan => {
    const matchStatus = statusFilter.value === 'all' || plan.status === statusFilter.value
    const matchType = typeFilter.value === 'all' || plan.plan_type === typeFilter.value
    return matchStatus && matchType
  })
})

const planTypeLabel = (type: string) => {
  return type === 'TIME_BASED' ? LABELS.CONTRACT_TYPE.TIME_BASED : LABELS.CONTRACT_TYPE.COUNT_BASED
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(price)
}

// 刪除確認
const showDeleteConfirm = ref(false)
const planToDelete = ref<string | null>(null)

const confirmDelete = (planId: string) => {
  planToDelete.value = planId
  showDeleteConfirm.value = true
}

const handleDelete = async () => {
  if (!planToDelete.value) return

  try {
    await deletePlan(planToDelete.value)
    await fetchPlans({ status: '' })
  } catch (error) {
    console.error('Failed to delete plan:', error)
  } finally {
    showDeleteConfirm.value = false
    planToDelete.value = null
  }
}

const cancelDelete = () => {
  showDeleteConfirm.value = false
  planToDelete.value = null
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

    <!-- Filters -->
    <div class="filters-bar">
      <div class="filter-group">
        <label class="filter-label">狀態</label>
        <div class="filter-chips">
          <button
            class="filter-chip"
            :class="{ active: statusFilter === 'all' }"
            @click="statusFilter = 'all'"
          >
            全部
          </button>
          <button
            class="filter-chip"
            :class="{ active: statusFilter === 'active' }"
            @click="statusFilter = 'active'"
          >
            {{ STATUS.ENABLED }}
          </button>
          <button
            class="filter-chip"
            :class="{ active: statusFilter === 'archived' }"
            @click="statusFilter = 'archived'"
          >
            {{ STATUS.DISABLED }}
          </button>
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">類型</label>
        <div class="filter-chips">
          <button
            class="filter-chip"
            :class="{ active: typeFilter === 'all' }"
            @click="typeFilter = 'all'"
          >
            全部
          </button>
          <button
            class="filter-chip"
            :class="{ active: typeFilter === 'TIME_BASED' }"
            @click="typeFilter = 'TIME_BASED'"
          >
            {{ LABELS.CONTRACT_TYPE.TIME_BASED }}
          </button>
          <button
            class="filter-chip"
            :class="{ active: typeFilter === 'COUNT_BASED' }"
            @click="typeFilter = 'COUNT_BASED'"
          >
            {{ LABELS.CONTRACT_TYPE.COUNT_BASED }}
          </button>
        </div>
      </div>
    </div>

    <!-- Plans Grid -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <div v-else-if="filteredPlans.length === 0" class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
      </svg>
      <h3>{{ PAGES.PLANS.NO_PLANS }}</h3>
      <p>{{ PAGES.PLANS.NO_PLANS_HINT }}</p>
      <NuxtLink to="/plans/new" class="btn-primary">{{ PAGES.PLANS.ADD_PLAN }}</NuxtLink>
    </div>

    <div v-else class="plans-grid">
      <div v-for="plan in filteredPlans" :key="plan.id" class="plan-card" :class="{ archived: plan.status === 'archived' }">
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
          <button class="btn-danger-outline" @click="confirmDelete(plan.id)">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="cancelDelete">
        <div class="modal-content">
          <div class="modal-icon danger">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
            </svg>
          </div>
          <h3>{{ MESSAGES.CONFIRM.DELETE_TITLE }}</h3>
          <p>{{ MESSAGES.CONFIRM.DELETE_WARNING }}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="cancelDelete">{{ MESSAGES.FORM.CANCEL }}</button>
            <button class="btn btn-danger" @click="handleDelete">{{ MESSAGES.CONFIRM.CONFIRM_DELETE }}</button>
          </div>
        </div>
      </div>
    </Teleport>
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

/* Filters Bar */
.filters-bar {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-xl);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.filter-chips {
  display: flex;
  gap: var(--space-xs);
}

.filter-chip {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.filter-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.filter-chip.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

/* Delete Button */
.btn-danger-outline {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm);
  background: transparent;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-danger-outline:hover {
  background: rgba(255, 59, 48, 0.1);
  border-color: var(--color-error);
  color: var(--color-error);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s var(--ease-out);
}

@keyframes fadeIn {
  from { opacity: 0; }
}

.modal-content {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  padding: var(--space-2xl);
  max-width: 400px;
  width: 90%;
  text-align: center;
  animation: slideUp 0.3s var(--ease-out);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
}

.modal-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

.modal-icon.danger {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.modal-content h3 {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-sm) 0;
}

.modal-content p {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-xl) 0;
}

.modal-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
}

.btn-danger {
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-error);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-danger:hover {
  background: #e53935;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .filters-bar {
    flex-direction: column;
    gap: var(--space-md);
  }

  .filter-group {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
