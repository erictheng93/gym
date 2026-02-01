<script setup lang="ts">
/**
 * StatsGrid - 統計卡片網格組件
 *
 * 用於顯示多個統計數字的 Bento Grid 佈局
 *
 * @example
 * <StatsGrid :stats="[
 *   { label: '有效合約', value: 120, icon: 'check', variant: 'success' },
 *   { label: '已過期', value: 15, icon: 'alert', variant: 'error' },
 *   { label: '草稿', value: 5, icon: 'file', variant: 'default' }
 * ]" />
 */

interface StatItem {
  /** 統計標籤 */
  label: string
  /** 統計數值 */
  value: number
  /** 圖標類型 */
  icon?: 'check' | 'alert' | 'file' | 'dollar' | 'users' | 'calendar'
  /** 顏色變體 */
  variant?: 'default' | 'success' | 'warning' | 'error'
}

interface Props {
  /** 統計項目列表 */
  stats: StatItem[]
}

defineProps<Props>()

// 圖標 SVG 定義
const icons: Record<string, { paths: string[] }> = {
  check: {
    paths: [
      'M22 11.08V12a10 10 0 1 1-5.93-9.14',
      'M22 4 12 14.01l-3-3'
    ]
  },
  alert: {
    paths: [
      'M12 12a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
      'M12 8v4',
      'M12 16h.01'
    ]
  },
  file: {
    paths: [
      'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z',
      'M14 2v6h6'
    ]
  },
  dollar: {
    paths: [
      'M12 2v20',
      'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'
    ]
  },
  users: {
    paths: [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      'M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
      'M22 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75'
    ]
  },
  calendar: {
    paths: [
      'M8 2v4',
      'M16 2v4',
      'M3 10h18',
      'M21 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'
    ]
  }
}

// Helper function to get icon paths safely
const getIconPaths = (iconName: string | undefined) => {
  if (!iconName) return []
  return icons[iconName]?.paths ?? []
}
</script>

<template>
  <div class="stats-grid">
    <div
      v-for="(stat, index) in stats"
      :key="index"
      :class="['stat-card', 'glass-card', `stat-${stat.variant || 'default'}`]"
    >
      <div class="stat-icon">
        <svg
          v-if="stat.icon && icons[stat.icon]"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path v-for="(d, i) in getIconPaths(stat.icon)" :key="i" :d="d" />
        </svg>
      </div>
      <div class="stat-content">
        <span class="stat-number">{{ stat.value }}</span>
        <span class="stat-label">{{ stat.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-xl);
  animation: statAppear 0.6s var(--ease-out) backwards;
}

.stat-card:nth-child(1) { animation-delay: 0.1s; }
.stat-card:nth-child(2) { animation-delay: 0.15s; }
.stat-card:nth-child(3) { animation-delay: 0.2s; }
.stat-card:nth-child(4) { animation-delay: 0.25s; }

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-default .stat-icon {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.stat-success .stat-icon {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.stat-warning .stat-icon {
  background: rgba(255, 159, 10, 0.15);
  color: var(--color-warning);
}

.stat-error .stat-icon {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.stat-number {
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

@keyframes statAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

/* Responsive */
@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .stat-card {
    padding: var(--space-lg);
  }

  .stat-number {
    font-size: 24px;
  }
}
</style>
