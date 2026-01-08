<script setup lang="ts">
interface Props {
  membersPercent?: number
  employeesPercent?: number
  branchesPercent?: number
}

const props = defineProps<Props>()

const health = computed(() => {
  const maxPercent = Math.max(
    props.membersPercent || 0,
    props.employeesPercent || 0,
    props.branchesPercent || 0
  )

  if (maxPercent >= 90) {
    return { label: '危險', color: 'error', icon: '⚠️' }
  }
  if (maxPercent >= 80) {
    return { label: '警告', color: 'warning', icon: '⚡' }
  }
  if (maxPercent >= 50) {
    return { label: '良好', color: 'info', icon: '📊' }
  }
  return { label: '健康', color: 'success', icon: '✓' }
})
</script>

<template>
  <div class="health-badge" :class="`health-${health.color}`">
    <span class="health-icon">{{ health.icon }}</span>
    <span class="health-label">{{ health.label }}</span>
  </div>
</template>

<style scoped>
.health-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.health-success {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.health-info {
  background: rgba(0, 122, 255, 0.15);
  color: #007aff;
}

.health-warning {
  background: rgba(255, 204, 0, 0.15);
  color: #ff9500;
}

.health-error {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
}

.health-icon {
  font-size: 14px;
  line-height: 1;
}

.health-label {
  font-size: 12px;
}
</style>
