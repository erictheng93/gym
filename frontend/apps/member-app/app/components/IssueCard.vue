<script setup lang="ts">
/**
 * Issue Card Component
 * Displays an issue summary in a card format
 */
import type { Issue } from '../composables/useIssues'

const props = defineProps<{
  issue: Issue
}>()

const { getTypeLabel, getTypeIcon, formatDate } = useIssues()

const emit = defineEmits<{
  click: [issue: Issue]
}>()

const handleClick = () => {
  emit('click', props.issue)
}
</script>

<template>
  <div class="issue-card" @click="handleClick">
    <div class="issue-header">
      <span class="issue-type">
        <svg
          v-if="getTypeIcon(issue.type) === 'tool'"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <svg
          v-else-if="getTypeIcon(issue.type) === 'users'"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <svg
          v-else-if="getTypeIcon(issue.type) === 'lightbulb'"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="9" y1="18" x2="15" y2="18" />
          <line x1="10" y1="22" x2="14" y2="22" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
        </svg>
        <svg
          v-else
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {{ getTypeLabel(issue.type) }}
      </span>
      <IssueStatusBadge :status="issue.status" />
    </div>
    <h3 class="issue-title">{{ issue.title }}</h3>
    <div class="issue-footer">
      <span class="issue-date">{{ formatDate(issue.created_at) }}</span>
      <svg
        class="arrow-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.issue-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.issue-card:active {
  background-color: var(--color-border);
}

.issue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.issue-type {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.issue-type svg {
  color: var(--color-primary);
}

.issue-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.issue-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.issue-date {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.arrow-icon {
  color: var(--color-text-tertiary);
}
</style>
