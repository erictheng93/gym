<script setup lang="ts">
/**
 * StatsBar - 統計列組件
 *
 * 顯示單一統計數字
 *
 * @example
 * <StatsBar :count="totalCount" label="符合條件" />
 */

interface Props {
  /** 數量 */
  count: number
  /** 標籤文字 */
  label?: string
}

withDefaults(defineProps<Props>(), {
  label: '符合條件'
})
</script>

<template>
  <div class="stats-bar">
    <div class="stat-item">
      <span class="stat-number">{{ count }}</span>
      <span class="stat-label text-caption text-secondary">{{ label }}</span>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.stats-bar {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-lg);
  padding: 0 var(--space-sm);
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.stat-number {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}
</style>
