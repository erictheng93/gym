<script setup lang="ts">
/**
 * NoEmployeeWarning Component
 *
 * Displays a warning banner when the logged-in user doesn't have an associated
 * employee record or their employee record is inactive.
 */
import type { EmployeeStatus } from '~/composables/usePermissions'

const props = defineProps<{
  status: EmployeeStatus
}>()

const message = computed(() => {
  switch (props.status) {
    case 'no_employee':
      return '您的帳號尚未關聯員工資料，請聯繫管理員設定。'
    case 'inactive':
      return '您的員工帳號已停用，請聯繫管理員了解詳情。'
    default:
      return ''
  }
})

const title = computed(() => {
  switch (props.status) {
    case 'no_employee':
      return '帳號未設定'
    case 'inactive':
      return '帳號已停用'
    default:
      return ''
  }
})
</script>

<template>
  <div
    v-if="status === 'no_employee' || status === 'inactive'"
    class="employee-warning"
    role="alert"
  >
    <div class="warning-icon">
      <svg
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
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
    <div class="warning-content">
      <h4 class="warning-title">{{ title }}</h4>
      <p class="warning-message">{{ message }}</p>
    </div>
  </div>
</template>

<style scoped>
.employee-warning {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background-color: var(--color-warning-bg, #fef3c7);
  border: 1px solid var(--color-warning-border, #f59e0b);
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.warning-icon {
  flex-shrink: 0;
  color: var(--color-warning-icon, #d97706);
}

.warning-content {
  flex: 1;
  min-width: 0;
}

.warning-title {
  margin: 0 0 0.25rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-warning-title, #92400e);
}

.warning-message {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-warning-text, #a16207);
  line-height: 1.5;
}

/* Dark mode support */
:root.dark .employee-warning {
  --color-warning-bg: rgba(251, 191, 36, 0.1);
  --color-warning-border: rgba(251, 191, 36, 0.3);
  --color-warning-icon: #fbbf24;
  --color-warning-title: #fcd34d;
  --color-warning-text: #fde68a;
}
</style>
