<script setup lang="ts">
/**
 * Contract Alerts Component
 * 合約到期警示列表
 */

import type { ContractAlert, ContractAlertsResponse } from '~/composables/useDashboard'

interface Props {
  alerts: ContractAlertsResponse | null
  loading?: boolean
  limit?: number
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  limit: 10
})

const emit = defineEmits<{
  (e: 'view-contract', contractId: string): void
  (e: 'view-all'): void
}>()

// 過濾並限制數量
const displayedAlerts = computed(() => {
  if (!props.alerts?.alerts) return []
  return props.alerts.alerts.slice(0, props.limit)
})

const getUrgencyClass = (urgency: string) => {
  switch (urgency) {
    case 'URGENT': return 'urgency-urgent'
    case 'SOON': return 'urgency-soon'
    default: return 'urgency-upcoming'
  }
}

const getUrgencyLabel = (urgency: string) => {
  switch (urgency) {
    case 'URGENT': return '緊急'
    case 'SOON': return '即將'
    default: return '注意'
  }
}

const formatDays = (days: number) => {
  if (days <= 0) return '已到期'
  if (days === 1) return '明天'
  return `${days} 天後`
}
</script>

<template>
  <div class="alerts-container">
    <div class="alerts-header">
      <div class="header-left">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="alert-icon">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" x2="12" y1="9" y2="13" />
          <line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
        <h3 class="alerts-title">合約到期警示</h3>
      </div>
      <div class="header-right">
        <div v-if="alerts?.summary" class="summary-badges">
          <span class="badge badge-urgent">{{ alerts.summary.urgent }} 緊急</span>
          <span class="badge badge-soon">{{ alerts.summary.soon }} 即將</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="alerts-loading">
      <div class="loading-spinner" />
      <span>載入中...</span>
    </div>

    <div v-else-if="!alerts || displayedAlerts.length === 0" class="alerts-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="m9 11 3 3L22 4" />
      </svg>
      <span>目前無到期警示</span>
    </div>

    <ul v-else class="alerts-list">
      <li
        v-for="alert in displayedAlerts"
        :key="alert.contract_id"
        class="alert-item"
        @click="emit('view-contract', alert.contract_id)"
      >
        <div class="alert-content">
          <div class="alert-main">
            <span class="member-name">{{ alert.member_name }}</span>
            <span :class="['urgency-badge', getUrgencyClass(alert.urgency)]">
              {{ getUrgencyLabel(alert.urgency) }}
            </span>
          </div>
          <div class="alert-details">
            <span class="plan-name">{{ alert.plan_name }}</span>
            <span class="separator">|</span>
            <span class="expiry-date">{{ formatDays(alert.days_until_expiry) }}到期</span>
          </div>
        </div>
        <div class="alert-action">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </li>
    </ul>

    <button
      v-if="alerts && alerts.summary.total > limit"
      class="view-all-btn"
      @click="emit('view-all')"
    >
      查看全部 {{ alerts.summary.total }} 筆警示
    </button>
  </div>
</template>

<style scoped>
.alerts-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.alerts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.alert-icon {
  color: var(--color-warning);
}

.alerts-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.summary-badges {
  display: flex;
  gap: var(--space-sm);
}

.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.badge-urgent {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.badge-soon {
  background: rgba(255, 159, 10, 0.1);
  color: #ff9f0a;
}

.alerts-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
}

.alert-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--duration-fast) ease;
}

.alert-item:hover {
  background: var(--color-bg-tertiary);
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-main {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: 4px;
}

.member-name {
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.urgency-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.urgency-urgent {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.urgency-soon {
  background: rgba(255, 159, 10, 0.1);
  color: #ff9f0a;
}

.urgency-upcoming {
  background: rgba(0, 113, 227, 0.1);
  color: #0071e3;
}

.alert-details {
  font-size: 12px;
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.separator {
  opacity: 0.5;
}

.expiry-date {
  color: var(--color-text-secondary);
}

.alert-action {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
  margin-left: var(--space-sm);
}

.view-all-btn {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.view-all-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.alerts-loading,
.alerts-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  color: var(--color-text-tertiary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.alerts-empty svg {
  opacity: 0.5;
  color: var(--color-success);
}
</style>
