<script setup lang="ts">
/**
 * KPI Grid Component
 * 4 欄 KPI 網格顯示
 */

import type { DashboardKPIs } from '~/composables/useDashboard'

interface Props {
  kpis: DashboardKPIs | null
  loading?: boolean
  showLive?: boolean
}

withDefaults(defineProps<Props>(), {
  loading: false,
  showLive: false
})

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}
</script>

<template>
  <div class="kpi-grid">
    <!-- 今日營收 -->
    <KpiCard
      title="今日營收"
      :value="kpis ? formatCurrency(kpis.revenue.today) : '--'"
      :change="kpis?.revenue.change"
      change-label="較上期"
      icon="revenue"
      :loading="loading"
      :live="showLive"
    />

    <!-- 活躍會員 -->
    <KpiCard
      title="活躍會員"
      :value="kpis?.members.active || 0"
      :subtitle="`${formatPercent(kpis?.members.active_rate || 0)} 活躍率`"
      icon="members"
      :loading="loading"
    />

    <!-- 到期合約 -->
    <KpiCard
      title="到期警示"
      :value="kpis?.contracts.expiring_7 || 0"
      subtitle="7天內到期"
      icon="alert"
      :variant="(kpis?.contracts.expiring_7 || 0) > 5 ? 'warning' : 'default'"
      :loading="loading"
    />

    <!-- 今日入場 -->
    <KpiCard
      title="今日入場"
      :value="kpis?.operations.today_checkins || 0"
      :subtitle="`尖峰時段 ${kpis?.operations.peak_hour || 0}:00`"
      icon="checkin"
      :loading="loading"
      :live="showLive"
    />
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
