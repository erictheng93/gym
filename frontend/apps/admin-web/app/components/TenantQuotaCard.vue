<script setup lang="ts">
import { useTenant } from '~/composables/useTenant'

const {
  tenantInfo,
  tenantQuota,
  isLoading,
  fetchTenantInfo,
  fetchTenantQuota,
  isTrialExpired,
  tenantStatusText,
  planTypeText,
  getQuotaUsagePercent,
  isQuotaNearLimit
} = useTenant()

// 加載租戶信息
onMounted(async () => {
  await fetchTenantInfo()
  await fetchTenantQuota()
})

// 定期刷新配額信息（每5分鐘）
const refreshInterval = 5 * 60 * 1000
onMounted(() => {
  const interval = setInterval(() => {
    fetchTenantQuota()
  }, refreshInterval)

  onUnmounted(() => clearInterval(interval))
})

// 獲取配額進度條顏色
const getQuotaColor = (resource: 'members' | 'employees' | 'branches' | 'storage') => {
  const percent = getQuotaUsagePercent(resource)
  if (percent >= 90) return 'error'
  if (percent >= 80) return 'warning'
  return 'success'
}

// 格式化數字
const formatNumber = (num: number) => {
  return new Intl.NumberFormat('zh-TW').format(num)
}
</script>

<template>
  <div class="tenant-quota-card">
    <!-- 租戶信息 -->
    <div v-if="tenantInfo" class="tenant-header">
      <div class="tenant-info">
        <h3 class="tenant-name">{{ tenantInfo.name }}</h3>
        <div class="tenant-meta">
          <span class="tenant-plan">{{ planTypeText }}</span>
          <span class="tenant-status" :class="`status-${tenantInfo.status}`">
            {{ tenantStatusText }}
          </span>
        </div>
      </div>

      <!-- 試用期提示 -->
      <div v-if="tenantInfo.status === 'trial' && tenantInfo.trialEndsAt" class="trial-notice">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
        <span v-if="isTrialExpired">試用期已過期</span>
        <span v-else>
          試用至 {{ new Date(tenantInfo.trialEndsAt).toLocaleDateString('zh-TW') }}
        </span>
      </div>
    </div>

    <!-- 配額使用情況 -->
    <div v-if="tenantQuota" class="quota-list">
      <!-- 會員配額 -->
      <div class="quota-item">
        <div class="quota-header">
          <span class="quota-label">會員數</span>
          <span class="quota-value">
            {{ formatNumber(tenantQuota.members.current) }} / {{ formatNumber(tenantQuota.members.limit) }}
          </span>
        </div>
        <div class="quota-bar">
          <div
            class="quota-progress"
            :class="`progress-${getQuotaColor('members')}`"
            :style="{ width: `${getQuotaUsagePercent('members')}%` }"
          />
        </div>
        <div v-if="isQuotaNearLimit('members')" class="quota-warning">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
          <span>配額即將用完</span>
        </div>
      </div>

      <!-- 員工配額 -->
      <div class="quota-item">
        <div class="quota-header">
          <span class="quota-label">員工數</span>
          <span class="quota-value">
            {{ formatNumber(tenantQuota.employees.current) }} / {{ formatNumber(tenantQuota.employees.limit) }}
          </span>
        </div>
        <div class="quota-bar">
          <div
            class="quota-progress"
            :class="`progress-${getQuotaColor('employees')}`"
            :style="{ width: `${getQuotaUsagePercent('employees')}%` }"
          />
        </div>
        <div v-if="isQuotaNearLimit('employees')" class="quota-warning">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
          <span>配額即將用完</span>
        </div>
      </div>

      <!-- 分店配額 -->
      <div class="quota-item">
        <div class="quota-header">
          <span class="quota-label">分店數</span>
          <span class="quota-value">
            {{ formatNumber(tenantQuota.branches.current) }} / {{ formatNumber(tenantQuota.branches.limit) }}
          </span>
        </div>
        <div class="quota-bar">
          <div
            class="quota-progress"
            :class="`progress-${getQuotaColor('branches')}`"
            :style="{ width: `${getQuotaUsagePercent('branches')}%` }"
          />
        </div>
        <div v-if="isQuotaNearLimit('branches')" class="quota-warning">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
          <span>配額即將用完</span>
        </div>
      </div>
    </div>

    <!-- 加載狀態 -->
    <div v-else-if="isLoading" class="loading-state">
      <div class="spinner" />
      <p>載入配額資訊中...</p>
    </div>

    <!-- 錯誤狀態 -->
    <div v-else class="error-state">
      <p>無法載入配額資訊</p>
    </div>
  </div>
</template>

<style scoped>
.tenant-quota-card {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* 租戶信息 */
.tenant-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-bottom: var(--space-md);
  border-bottom: 0.5px solid var(--color-divider);
}

.tenant-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.tenant-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.tenant-plan {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.tenant-status {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.tenant-status.status-trial {
  background: rgba(255, 204, 0, 0.1);
  color: #ff9500;
}

.tenant-status.status-active {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.tenant-status.status-suspended {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.trial-notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: rgba(255, 204, 0, 0.1);
  border-radius: var(--radius-md);
  color: #ff9500;
  font-size: 13px;
  font-weight: 500;
}

/* 配額列表 */
.quota-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.quota-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.quota-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quota-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.quota-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.quota-bar {
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.quota-progress {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.3s var(--ease-out);
}

.quota-progress.progress-success {
  background: linear-gradient(90deg, #34c759, #30d158);
}

.quota-progress.progress-warning {
  background: linear-gradient(90deg, #ff9500, #ffcc00);
}

.quota-progress.progress-error {
  background: linear-gradient(90deg, #ff3b30, #ff6961);
}

.quota-warning {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 12px;
  font-weight: 500;
  color: #ff9500;
  margin-top: 2px;
}

/* 加載和錯誤狀態 */
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  gap: var(--space-md);
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-bg-tertiary);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
