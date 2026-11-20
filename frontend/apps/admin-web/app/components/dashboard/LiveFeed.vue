<script setup lang="ts">
/**
 * Live Feed Component (Awwwards Grade)
 * 即時動態流（入場與營運活動）
 */

import type { LiveMetrics } from '~/composables/useDashboard'

interface Props {
  metrics: LiveMetrics | null
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const { formatCurrency } = useCharts()

// 格式化時間
const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  return date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 最後更新時間
const lastUpdate = computed(() => {
  if (!props.metrics?.timestamp) return '--'
  return formatTime(props.metrics.timestamp)
})
</script>

<template>
  <div class="live-feed-container">
    <div class="feed-header">
      <div class="header-left">
        <span class="live-indicator">
          <span class="live-dot" />
          <span class="live-title">即時動態串流</span>
        </span>
      </div>
      <span class="last-update tabular-nums">最後同步 {{ lastUpdate }}</span>
    </div>

    <div v-if="loading" class="feed-loading">
      <div class="loading-spinner" />
      <span>串流連線中...</span>
    </div>

    <div v-else-if="!metrics" class="feed-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
        <path d="m22 8-6 4 6 4V8Z" />
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
      </svg>
      <span>等待遙測數據傳輸...</span>
    </div>

    <div v-else class="feed-content">
      <!-- 即時統計 -->
      <div class="live-stats">
        <div class="live-stat">
          <div class="stat-icon checkin">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value tabular-nums">{{ metrics.today_checkins }}</span>
            <span class="stat-label uppercase-label">今日入場人次</span>
          </div>
        </div>

        <div class="live-stat">
          <div class="stat-icon revenue">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value tabular-nums">{{ formatCurrency(metrics.today_revenue) }}</span>
            <span class="stat-label uppercase-label">即時累積營收</span>
          </div>
        </div>
      </div>

      <!-- 最近活動 -->
      <div v-if="metrics.recent_checkins.length > 0" class="recent-activity">
        <h4 class="section-title uppercase-label tracking-wide">最新入場活動</h4>
        <ul class="activity-list custom-scrollbar">
          <li
            v-for="checkin in metrics.recent_checkins"
            :key="checkin.id"
            class="activity-item"
          >
            <div class="activity-avatar">
              {{ checkin.name[0] }}
            </div>
            <div class="activity-info">
              <span class="activity-name">{{ checkin.name }}</span>
              <span class="activity-branch">{{ checkin.branch }}</span>
            </div>
            <span class="activity-time tabular-nums">{{ formatTime(checkin.time) }}</span>
          </li>
        </ul>
      </div>

      <div v-else class="no-activity">
        <span>暫無最新入場動態</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-feed-container {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm), inset 0 1px 0 var(--color-border-specular);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--color-border-subtle);
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.live-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
}

.live-dot {
  width: 7px;
  height: 7px;
  background: var(--color-success);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--color-success);
  animation: pulseBeacon 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulseBeacon {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(1.3);
  }
}

.last-update {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.feed-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.live-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.live-stat {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 12px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: inset 0 1px 0 var(--color-border-specular);
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.checkin {
  background: rgba(52, 199, 89, 0.12);
  color: var(--color-success);
  border: 1px solid rgba(52, 199, 89, 0.2);
}

.stat-icon.revenue {
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
  border: 1px solid rgba(255, 159, 10, 0.2);
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat-value {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.recent-activity {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-sm) 0;
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  transition: all var(--duration-fast) var(--ease-spring);
}

.activity-item:hover {
  border-color: var(--color-border);
  transform: translateX(2px);
  background: var(--color-bg-surface);
}

.activity-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent), #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.activity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.activity-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.activity-branch {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.activity-time {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.feed-loading,
.feed-empty,
.no-activity {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-2xl);
  color: var(--color-text-tertiary);
  font-size: 13px;
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
  to { transform: rotate(360deg); }
}
</style>
