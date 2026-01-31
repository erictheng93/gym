<script setup lang="ts">
/**
 * Live Feed Component
 * 即時動態顯示（打卡、交易等）
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
    minute: '2-digit'
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
          即時動態
        </span>
      </div>
      <span class="last-update">更新於 {{ lastUpdate }}</span>
    </div>

    <div v-if="loading" class="feed-loading">
      <div class="loading-spinner" />
      <span>連線中...</span>
    </div>

    <div v-else-if="!metrics" class="feed-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="m22 8-6 4 6 4V8Z" />
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
      </svg>
      <span>等待即時數據...</span>
    </div>

    <div v-else class="feed-content">
      <!-- 即時統計 -->
      <div class="live-stats">
        <div class="live-stat">
          <div class="stat-icon checkin">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ metrics.today_checkins }}</span>
            <span class="stat-label">今日入場</span>
          </div>
        </div>

        <div class="live-stat">
          <div class="stat-icon revenue">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ formatCurrency(metrics.today_revenue) }}</span>
            <span class="stat-label">今日營收</span>
          </div>
        </div>
      </div>

      <!-- 最近活動 -->
      <div v-if="metrics.recent_checkins.length > 0" class="recent-activity">
        <h4 class="section-title">最近入場</h4>
        <ul class="activity-list">
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
            <span class="activity-time">{{ formatTime(checkin.time) }}</span>
          </li>
        </ul>
      </div>

      <div v-else class="no-activity">
        <span>暫無最近入場紀錄</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-feed-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
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
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.live-dot {
  width: 8px;
  height: 8px;
  background: var(--color-success);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.9);
  }
}

.last-update {
  font-size: 12px;
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
  padding: var(--space-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.checkin {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.stat-icon.revenue {
  background: rgba(255, 159, 10, 0.1);
  color: #ff9f0a;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.recent-activity {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-md) 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-divider);
  animation: slideIn 0.3s ease;
}

.activity-item:last-child {
  border-bottom: none;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.activity-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.activity-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-branch {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.activity-time {
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.no-activity {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.feed-loading,
.feed-empty {
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

.feed-empty svg {
  opacity: 0.5;
}
</style>
