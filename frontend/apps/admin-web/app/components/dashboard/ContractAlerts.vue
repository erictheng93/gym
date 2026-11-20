<script setup lang="ts">
/**
 * Contract Alerts Component (Awwwards Grade)
 * 合約到期警示列表
 */

import type { ContractAlertsResponse } from '~/composables/useDashboard'

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
  (e: 'refresh'): void
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
        <div class="alert-icon-box">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="alert-icon">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" x2="12" y1="9" y2="13" />
            <line x1="12" x2="12.01" y1="17" y2="17" />
          </svg>
        </div>
        <h3 class="alerts-title">合約到期警示</h3>
      </div>
      <div class="header-right">
        <div v-if="alerts?.summary" class="summary-badges">
          <span class="badge badge-urgent"><span class="badge-dot" />{{ alerts.summary.urgent }} 緊急</span>
          <span class="badge badge-soon"><span class="badge-dot" />{{ alerts.summary.soon }} 即將</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="alerts-loading">
      <div class="loading-spinner" />
      <span>合約數據載入中...</span>
    </div>

    <div v-else-if="!alerts || displayedAlerts.length === 0" class="alerts-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="m9 11 3 3L22 4" />
      </svg>
      <span>目前無即將到期之合約警示</span>
    </div>

    <ul v-else class="alerts-list custom-scrollbar">
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
            <span class="separator">·</span>
            <span class="expiry-date tabular-nums">{{ formatDays(alert.days_until_expiry) }}到期</span>
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
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm), inset 0 1px 0 var(--color-border-specular);
  border-radius: var(--radius-xl);
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
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--color-border-subtle);
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.alert-icon-box {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: rgba(255, 159, 10, 0.12);
  border: 1px solid rgba(255, 159, 10, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.alert-icon {
  color: #ff9f0a;
}

.alerts-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
  margin: 0;
}

.summary-badges {
  display: flex;
  gap: var(--space-xs);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.badge-urgent {
  background: rgba(255, 59, 48, 0.12);
  color: var(--color-error);
  border: 1px solid rgba(255, 59, 48, 0.25);
}

.badge-soon {
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
  border: 1px solid rgba(255, 159, 10, 0.25);
}

.alerts-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
}

.alert-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.alert-item:hover {
  background: var(--color-bg-surface);
  border-color: var(--color-border);
  transform: translateX(2px);
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-main {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: 3px;
}

.member-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.urgency-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.urgency-urgent {
  background: rgba(255, 59, 48, 0.12);
  color: var(--color-error);
}

.urgency-soon {
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
}

.urgency-upcoming {
  background: rgba(0, 113, 227, 0.12);
  color: var(--color-accent);
}

.alert-details {
  font-size: 11.5px;
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.separator {
  opacity: 0.4;
}

.expiry-date {
  color: var(--color-text-secondary);
}

.alert-action {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
  margin-left: var(--space-sm);
  transition: transform var(--duration-fast) var(--ease-spring);
}

.alert-item:hover .alert-action {
  transform: translateX(2px);
  color: var(--color-text-primary);
}

.view-all-btn {
  margin-top: var(--space-md);
  padding: 8px var(--space-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  box-shadow: inset 0 1px 0 var(--color-border-specular);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.view-all-btn:hover {
  background: var(--color-bg-primary);
  color: var(--color-accent);
  border-color: var(--color-accent);
  transform: translateY(-1px);
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
  font-size: 13px;
  padding: var(--space-2xl);
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 2px solid var(--color-border);
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
