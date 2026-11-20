<script setup lang="ts">
/**
 * KPI Card Component (Awwwards Grade)
 * 總部戰情室單一 KPI 指標卡片
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
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="iconComponents[icon]"
        />
      </div>
      <div class="kpi-title-wrapper">
        <span class="kpi-title uppercase-label tracking-wide">{{ title }}</span>
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
      <div class="kpi-value tabular-nums">{{ formattedValue }}</div>
      <div v-if="subtitle || change !== undefined" class="kpi-footer">
        <span v-if="change !== undefined" :class="['kpi-change', 'tabular-nums', changeClass]">
          <svg
            v-if="change !== 0"
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
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
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm), inset 0 1px 0 var(--color-border-specular);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  transition: transform var(--duration-normal) var(--ease-spring),
              box-shadow var(--duration-normal) var(--ease-spring),
              border-color var(--duration-normal) ease;
  position: relative;
  overflow: hidden;
}

.kpi-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md), 0 0 24px -4px var(--color-accent-glow);
  border-color: var(--color-border-focus);
}

.kpi-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.kpi-icon {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.kpi-icon--revenue {
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
  border-color: rgba(255, 159, 10, 0.25);
}

.kpi-icon--members {
  background: rgba(0, 113, 227, 0.12);
  color: var(--color-accent);
  border-color: rgba(0, 113, 227, 0.25);
}

.kpi-icon--contracts {
  background: rgba(88, 86, 214, 0.12);
  color: #5856d6;
  border-color: rgba(88, 86, 214, 0.25);
}

.kpi-icon--checkin {
  background: rgba(52, 199, 89, 0.12);
  color: var(--color-success);
  border-color: rgba(52, 199, 89, 0.25);
}

.kpi-icon--alert {
  background: rgba(255, 59, 48, 0.12);
  color: var(--color-error);
  border-color: rgba(255, 59, 48, 0.25);
}

.kpi-title-wrapper {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.kpi-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.kpi-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-success);
  background: rgba(52, 199, 89, 0.12);
  border: 1px solid rgba(52, 199, 89, 0.3);
  padding: 2px 7px;
  border-radius: var(--radius-full);
}

.live-dot {
  width: 5px;
  height: 5px;
  background: var(--color-success);
  border-radius: 50%;
  box-shadow: 0 0 6px var(--color-success);
  animation: livePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes livePulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.3;
    transform: scale(1.3);
  }
}

.kpi-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.kpi-value {
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--color-text-primary);
}

.kpi-footer {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: 2px;
}

.kpi-change {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.kpi-change.positive {
  color: var(--color-success);
  background: rgba(52, 199, 89, 0.1);
}

.kpi-change.negative {
  color: var(--color-error);
  background: rgba(255, 59, 48, 0.1);
}

.kpi-subtitle {
  font-size: 12px;
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
  border-radius: var(--radius-md);
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
    font-size: 26px;
  }

  .kpi-icon {
    width: 36px;
    height: 36px;
  }
}
</style>
