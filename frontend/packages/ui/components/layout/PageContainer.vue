<script setup lang="ts">
/**
 * PageContainer - 頁面容器組件
 *
 * 提供統一的頁面寬度限制和內邊距
 */

interface Props {
  /** 最大寬度 */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

withDefaults(defineProps<Props>(), {
  maxWidth: 'xl'
})
</script>

<template>
  <div :class="['page-container', `max-${maxWidth}`]">
    <slot />
  </div>
</template>

<style scoped>
.page-container {
  width: 100%;
  margin: 0 auto;
}

.max-sm { max-width: 640px; }
.max-md { max-width: 768px; }
.max-lg { max-width: 1024px; }
.max-xl { max-width: 1400px; }
.max-full { max-width: none; }
</style>
