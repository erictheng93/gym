<script setup lang="ts">
/**
 * KPI Card Component
 * 單一 KPI 指標卡片
 */

interface Props {
  title: string
  value: string | number
  subtitle?: string
  change?: number
  changeLabel?: string
  icon?: 'revenue' | 'members' | 'contracts' | 'checkin' | 'alert'
  variant?: 'default' | 'success' | 'warning' | 'error'
  loading?: boolean
  live?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  loading: false,
  live: false
})

const iconComponents = {
  revenue: `<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />`,
  members: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
  contracts: `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />`,
  checkin: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />`,
  alert: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />`
}

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return new Intl.NumberFormat('zh-TW').format(props.value)
  }
  return props.value
})

const changeClass = computed(() => {
  if (!props.change) return ''
  return props.change > 0 ? 'positive' : props.change < 0 ? 'negative' : ''
})
</script>

<template>
  <div :class="['kpi-card', `kpi-card--${variant}`, { 'kpi-card--loading': loading }]">
    <div class="kpi-header">
      <div v-if="icon" :class="['kpi-icon', `kpi-icon--${icon}`]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="iconComponents[icon]"
        />
      </div>
      <div class="kpi-title-wrapper">
        <span class="kpi-title">{{ title }}</span>
        <span v-if="live" class="kpi-live-badge">
          <span class="live-dot" />
          LIVE
        </span>
      </div>
    </div>

    <div v-if="loading" class="kpi-loading">
      <div class="loading-skeleton" />
    </div>
    <div v-else class="kpi-body">
      <div class="kpi-value">{{ formattedValue }}</div>
      <div v-if="subtitle || change !== undefined" class="kpi-footer">
        <span v-if="change !== undefined" :class="['kpi-change', changeClass]">
          <svg
            v-if="change !== 0"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path v-if="change > 0" d="m5 12 7-7 7 7" />
            <path v-else d="m19 12-7 7-7-7" />
          </svg>
          {{ change > 0 ? '+' : '' }}{{ change }}%
        </span>
        <span v-if="subtitle" class="kpi-subtitle">{{ changeLabel || subtitle }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.kpi-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.kpi-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon--revenue {
  background: rgba(255, 159, 10, 0.1);
  color: #ff9f0a;
}

.kpi-icon--members {
  background: rgba(0, 113, 227, 0.1);
  color: #0071e3;
}

.kpi-icon--contracts {
  background: rgba(88, 86, 214, 0.1);
  color: #5856d6;
}

.kpi-icon--checkin {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.kpi-icon--alert {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.kpi-title-wrapper {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.kpi-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.kpi-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-success);
  background: rgba(52, 199, 89, 0.1);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.live-dot {
  width: 6px;
  height: 6px;
  background: var(--color-success);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.kpi-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.kpi-value {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--color-text-primary);
}

.kpi-footer {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.kpi-change {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: 500;
}

.kpi-change.positive {
  color: var(--color-success);
}

.kpi-change.negative {
  color: var(--color-error);
}

.kpi-subtitle {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Loading state */
.kpi-card--loading .kpi-loading {
  height: 48px;
}

.loading-skeleton {
  height: 36px;
  background: linear-gradient(
    90deg,
    var(--color-bg-tertiary) 25%,
    var(--color-bg-secondary) 50%,
    var(--color-bg-tertiary) 75%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Variants */
.kpi-card--success {
  border-left: 3px solid var(--color-success);
}

.kpi-card--warning {
  border-left: 3px solid var(--color-warning);
}

.kpi-card--error {
  border-left: 3px solid var(--color-error);
}

/* Responsive */
@media (max-width: 768px) {
  .kpi-value {
    font-size: 28px;
  }

  .kpi-icon {
    width: 36px;
    height: 36px;
  }

  .kpi-icon svg {
    width: 20px;
    height: 20px;
  }
}
</style>
