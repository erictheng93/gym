<script setup lang="ts">
/**
 * 方案管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 */
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const { plans, isLoading, fetchPlans, deletePlan } = usePlans()

// Filter state
const statusFilter = ref<'all' | 'active' | 'archived'>('all')
const typeFilter = ref<'all' | 'TIME_BASED' | 'COUNT_BASED'>('all')

// Delete modal state
const showDeleteConfirm = ref(false)
const planToDelete = ref<string | null>(null)

// Stats config
const statsConfig = computed(() => [
  { label: PAGES.PLANS.ENABLED_PLANS, value: plans.value.filter(p => p.status === 'active').length, icon: 'check' as const, variant: 'success' as const },
  { label: PAGES.PLANS.TIME_BASED_PLANS, value: plans.value.filter(p => p.plan_type === 'TIME_BASED').length, icon: 'calendar' as const, variant: 'default' as const },
  { label: PAGES.PLANS.COUNT_BASED_PLANS, value: plans.value.filter(p => p.plan_type === 'COUNT_BASED').length, icon: 'users' as const, variant: 'warning' as const }
])

// Filtered plans
const filteredPlans = computed(() => {
  return plans.value.filter(plan => {
    const matchStatus = statusFilter.value === 'all' || plan.status === statusFilter.value
    const matchType = typeFilter.value === 'all' || plan.plan_type === typeFilter.value
    return matchStatus && matchType
  })
})

// Helper functions
const planTypeLabel = (type: string) => {
  return type === 'TIME_BASED' ? LABELS.CONTRACT_TYPE.TIME_BASED : LABELS.CONTRACT_TYPE.COUNT_BASED
}

// Delete handlers
const confirmDelete = (planId: string) => {
  planToDelete.value = planId
  showDeleteConfirm.value = true
}

const handleDelete = async () => {
  if (!planToDelete.value) return
  try {
    await deletePlan(planToDelete.value)
    useToast().success(MESSAGES.SUCCESS.PLAN_DELETED)
    await fetchPlans({ status: '' })
  } catch (error) {
    console.error('Failed to delete plan:', error)
    useToast().error(MESSAGES.ERRORS.PLAN_DELETE_FAILED)
  } finally {
    showDeleteConfirm.value = false
    planToDelete.value = null
  }
}

// Initial load
onMounted(() => {
  fetchPlans({ status: '' })
})
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.PLANS.TITLE"
      :description="PAGES.PLANS.DESCRIPTION"
      :action-label="PAGES.PLANS.ADD_PLAN"
      action-to="/plans/new"
      action-icon="plus"
    />

    <!-- Stats Grid -->
    <StatsGrid :stats="statsConfig" />

    <!-- Filters -->
    <div class="filters-bar glass-card">
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

    <!-- Loading State -->
    <LoadingState v-if="isLoading" :message="MESSAGES.ACTIONS.LOADING" />

    <!-- Empty State -->
    <div v-else-if="filteredPlans.length === 0" class="card">
      <EmptyState
        :title="PAGES.PLANS.NO_PLANS"
        :description="PAGES.PLANS.NO_PLANS_HINT"
        icon="files"
        :action-label="PAGES.PLANS.ADD_PLAN"
        action-to="/plans/new"
      />
    </div>

    <!-- Plans Grid -->
    <div v-else class="plans-grid">
      <div
        v-for="plan in filteredPlans"
        :key="plan.id"
        class="plan-card card"
        :class="{ archived: plan.status === 'archived' }"
      >
        <div class="plan-header">
          <AppBadge
            :label="planTypeLabel(plan.plan_type)"
            :variant="plan.plan_type === 'TIME_BASED' ? 'info' : 'warning'"
          />
          <AppBadge
            v-if="plan.status === 'archived'"
            :label="PAGES.PLANS.ARCHIVED"
            variant="default"
          />
        </div>

        <h3 class="plan-name">{{ plan.name }}</h3>
        <p class="plan-price">{{ formatCurrency(plan.price) }}</p>

        <div class="plan-details">
          <div v-if="plan.plan_type === 'TIME_BASED'" class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            <span>{{ plan.duration_months }} {{ PAGES.PLANS.MONTHS }}</span>
          </div>
          <div v-else class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            </svg>
            <span>{{ plan.class_counts }} {{ PAGES.PLANS.CLASSES }}</span>
          </div>

          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <span>{{ plan.allow_transfer ? LABELS.TRANSFERABLE : LABELS.NON_TRANSFERABLE }}</span>
          </div>

          <div class="detail-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            <span>{{ plan.allow_pause ? LABELS.PAUSABLE : LABELS.NON_PAUSABLE }}</span>
          </div>
        </div>

        <p v-if="plan.description" class="plan-description">{{ plan.description }}</p>

        <div class="plan-actions">
          <NuxtLink :to="`/plans/${plan.id}/edit`" class="btn btn-secondary btn-small">
            {{ PAGES.PLANS.EDIT }}
          </NuxtLink>
          <button class="btn-icon btn-icon--danger" @click="confirmDelete(plan.id)">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <AppModal v-model="showDeleteConfirm" max-width="sm">
      <template #header>
        <div class="modal-icon modal-icon--danger">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
        </div>
      </template>

      <div class="text-center">
        <h3 class="modal-title">{{ MESSAGES.CONFIRM.DELETE_TITLE }}</h3>
        <p class="modal-description">{{ MESSAGES.CONFIRM.DELETE_WARNING }}</p>
      </div>

      <template #footer>
        <button class="btn btn-ghost" @click="showDeleteConfirm = false">
          {{ MESSAGES.FORM.CANCEL }}
        </button>
        <button class="btn btn-danger" @click="handleDelete">
          {{ MESSAGES.CONFIRM.CONFIRM_DELETE }}
        </button>
      </template>
    </AppModal>
  </PageContainer>
</template>

<style scoped>
/* Filters Bar */
.filters-bar {
  display: flex;
  gap: var(--space-xl);
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-xl);
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

/* Plans Grid */
.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-lg);
}

.plan-card {
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
  font-family: var(--font-mono);
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

.plan-actions .btn {
  flex: 1;
}

/* Icon Button */
.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-icon--danger:hover {
  background: rgba(255, 59, 48, 0.1);
  border-color: var(--color-error);
  color: var(--color-error);
}

/* Modal */
.modal-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-icon--danger {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: var(--space-lg) 0 var(--space-sm) 0;
}

.modal-description {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0;
}

.btn-danger {
  background: var(--color-error);
  border: none;
  color: white;
}

.btn-danger:hover {
  background: #e53935;
}

/* Responsive */
@media (max-width: 768px) {
  .filters-bar {
    flex-direction: column;
    gap: var(--space-md);
  }

  .filter-group {
    flex-direction: column;
    align-items: flex-start;
  }

  .plans-grid {
    grid-template-columns: 1fr;
  }
}
</style>
