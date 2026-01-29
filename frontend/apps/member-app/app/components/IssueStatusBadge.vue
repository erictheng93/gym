<script setup lang="ts">
/**
 * Issue Status Badge Component
 * Displays issue status with appropriate color
 */
import type { IssueStatus } from '../schemas/issue.schema'

const props = defineProps<{
  status: IssueStatus
}>()

const { getStatusLabel, getStatusColor } = useIssues()
</script>

<template>
  <span
    class="status-badge"
    :class="`status-${getStatusColor(props.status)}`"
  >
    {{ getStatusLabel(props.status) }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.status-warning {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.status-primary {
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.status-success {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-muted {
  background-color: var(--color-border);
  color: var(--color-text-secondary);
}
</style>
