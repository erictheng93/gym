<script setup lang="ts">
/**
 * Branch Comparison Component
 * 分店比較表格 (HQ Only)
 */

import type { DashboardKPIs, RevenueTarget } from '~/composables/useDashboard'

interface Props {
  kpis: DashboardKPIs | null
  targets?: RevenueTarget[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const { formatCurrency } = useCharts()

// 合併分店數據
const branchData = computed(() => {
  if (!props.kpis) return []

  const revenueMap = new Map(
    props.kpis.revenue.by_branch.map(b => [b.branch_id, b])
  )
  const memberMap = new Map(
    props.kpis.members.by_branch.map(b => [b.branch_id, b])
  )
  const checkinMap = new Map(
    props.kpis.operations.by_branch.map(b => [b.branch_id, b])
  )
  const targetMap = new Map(
    (props.targets || []).map(t => [t.branch_id, t])
  )

  // 使用營收數據作為基準
  return props.kpis.revenue.by_branch.map(branch => {
    const revenue = revenueMap.get(branch.branch_id)
    const members = memberMap.get(branch.branch_id)
    const checkins = checkinMap.get(branch.branch_id)
    const target = targetMap.get(branch.branch_id)

    const mtdRevenue = parseFloat(revenue?.revenue as any) || 0
    const targetAmount = target?.target_amount || 0
    const achievement = targetAmount > 0 ? (mtdRevenue / targetAmount) * 100 : 0

    return {
      branch_id: branch.branch_id,
      branch_name: branch.branch_name,
      revenue: mtdRevenue,
      transactions: revenue?.transactions || 0,
      members: members?.total || 0,
      active_members: members?.active || 0,
      checkins: checkins?.today_checkins || 0,
      target: targetAmount,
      achievement: achievement.toFixed(1)
    }
  }).sort((a, b) => b.revenue - a.revenue)
})

// 計算總計
const totals = computed(() => {
  return branchData.value.reduce((acc, branch) => ({
    revenue: acc.revenue + branch.revenue,
    transactions: acc.transactions + branch.transactions,
    members: acc.members + branch.members,
    active_members: acc.active_members + branch.active_members,
    checkins: acc.checkins + branch.checkins
  }), {
    revenue: 0,
    transactions: 0,
    members: 0,
    active_members: 0,
    checkins: 0
  })
})

const getAchievementClass = (achievement: string) => {
  const value = parseFloat(achievement)
  if (value >= 100) return 'achievement-success'
  if (value >= 80) return 'achievement-warning'
  return 'achievement-low'
}
</script>

<template>
  <div class="branch-comparison-container">
    <div class="table-header">
      <h3 class="table-title">分店比較</h3>
      <span class="table-subtitle">各分店績效對比</span>
    </div>

    <div v-if="loading" class="table-loading">
      <div class="loading-spinner" />
      <span>載入中...</span>
    </div>

    <div v-else-if="branchData.length === 0" class="table-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
      </svg>
      <span>暫無分店數據</span>
    </div>

    <div v-else class="table-wrapper">
      <table class="comparison-table">
        <thead>
          <tr>
            <th class="col-branch">分店</th>
            <th class="col-number">營收</th>
            <th class="col-number">會員數</th>
            <th class="col-number">今日入場</th>
            <th class="col-number">達成率</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="branch in branchData"
            :key="branch.branch_id"
            class="data-row"
          >
            <td class="col-branch">
              <span class="branch-name">{{ branch.branch_name }}</span>
            </td>
            <td class="col-number">
              <span class="revenue-value">{{ formatCurrency(branch.revenue) }}</span>
            </td>
            <td class="col-number">
              <span class="member-count">{{ branch.members }}</span>
              <span class="active-count">({{ branch.active_members }} 活躍)</span>
            </td>
            <td class="col-number">
              <span class="checkin-count">{{ branch.checkins }}</span>
            </td>
            <td class="col-number">
              <div class="achievement-cell">
                <div class="achievement-bar">
                  <div
                    class="achievement-fill"
                    :style="{ width: `${Math.min(parseFloat(branch.achievement), 100)}%` }"
                    :class="getAchievementClass(branch.achievement)"
                  />
                </div>
                <span :class="['achievement-text', getAchievementClass(branch.achievement)]">
                  {{ branch.achievement }}%
                </span>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td class="col-branch">
              <span class="total-label">總計</span>
            </td>
            <td class="col-number">
              <span class="revenue-value total">{{ formatCurrency(totals.revenue) }}</span>
            </td>
            <td class="col-number">
              <span class="member-count total">{{ totals.members }}</span>
            </td>
            <td class="col-number">
              <span class="checkin-count total">{{ totals.checkins }}</span>
            </td>
            <td class="col-number">
              <span class="total-label">—</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.branch-comparison-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
}

.table-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.table-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.table-subtitle {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.table-wrapper {
  overflow-x: auto;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
}

.comparison-table th,
.comparison-table td {
  padding: var(--space-md);
  text-align: left;
  border-bottom: 1px solid var(--color-divider);
}

.comparison-table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.col-branch {
  min-width: 120px;
}

.col-number {
  text-align: right;
  min-width: 100px;
}

.data-row:hover {
  background: var(--color-bg-tertiary);
}

.branch-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.revenue-value {
  font-weight: 600;
  color: var(--color-text-primary);
}

.member-count {
  color: var(--color-text-primary);
}

.active-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-left: 4px;
}

.checkin-count {
  color: var(--color-text-primary);
}

.achievement-cell {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  justify-content: flex-end;
}

.achievement-bar {
  width: 60px;
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.achievement-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.achievement-fill.achievement-success {
  background: var(--color-success);
}

.achievement-fill.achievement-warning {
  background: var(--color-warning);
}

.achievement-fill.achievement-low {
  background: var(--color-error);
}

.achievement-text {
  font-size: 13px;
  font-weight: 500;
  min-width: 45px;
  text-align: right;
}

.achievement-text.achievement-success {
  color: var(--color-success);
}

.achievement-text.achievement-warning {
  color: var(--color-warning);
}

.achievement-text.achievement-low {
  color: var(--color-error);
}

.total-row {
  background: var(--color-bg-tertiary);
}

.total-row td {
  border-bottom: none;
}

.total-label {
  font-weight: 600;
  color: var(--color-text-primary);
}

.revenue-value.total,
.member-count.total,
.checkin-count.total {
  font-weight: 700;
  color: var(--color-accent);
}

.table-loading,
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  color: var(--color-text-tertiary);
  padding: var(--space-2xl);
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

.table-empty svg {
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 768px) {
  .comparison-table th,
  .comparison-table td {
    padding: var(--space-sm);
    font-size: 13px;
  }

  .active-count {
    display: none;
  }

  .achievement-bar {
    display: none;
  }
}
</style>
