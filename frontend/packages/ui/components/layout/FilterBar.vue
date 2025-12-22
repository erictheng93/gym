<script setup lang="ts">
/**
 * FilterBar - 篩選器列組件
 *
 * 提供統一的篩選器區域佈局
 *
 * @example
 * <FilterBar>
 *   <template #search>
 *     <input v-model="search" class="input input-search" placeholder="搜尋..." />
 *   </template>
 *   <template #filters>
 *     <select v-model="status" class="input">...</select>
 *   </template>
 * </FilterBar>
 */

interface Props {
  /** 是否顯示搜尋框插槽 */
  showSearch?: boolean
}

withDefaults(defineProps<Props>(), {
  showSearch: true
})
</script>

<template>
  <div class="filter-bar glass-card-flat">
    <div v-if="showSearch && $slots.search" class="search-wrapper">
      <slot name="search" />
    </div>

    <div v-if="$slots.filters" class="filter-group">
      <slot name="filters" />
    </div>

    <!-- Default slot for custom content -->
    <slot />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: var(--space-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  animation: filtersAppear 0.6s var(--ease-out) backwards;
  animation-delay: 0.1s;
}

@keyframes filtersAppear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.search-wrapper {
  flex: 1;
  max-width: 400px;
}

.filter-group {
  display: flex;
  gap: var(--space-md);
}

/* Responsive */
@media (max-width: 1024px) {
  .filter-bar {
    flex-direction: column;
  }

  .search-wrapper {
    max-width: none;
  }

  .filter-group {
    flex-wrap: wrap;
  }
}
</style>
