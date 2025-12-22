<script setup lang="ts">
/**
 * DataPagination - 分頁組件
 *
 * 提供統一的分頁控制
 */

interface Props {
  /** 當前頁碼 */
  modelValue: number
  /** 總頁數 */
  totalPages: number
  /** 上一頁文字 */
  prevLabel?: string
  /** 下一頁文字 */
  nextLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  prevLabel: '上一頁',
  nextLabel: '下一頁'
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const currentPage = computed({
  get: () => props.modelValue,
  set: (value: number) => emit('update:modelValue', value)
})

const canGoPrev = computed(() => currentPage.value > 1)
const canGoNext = computed(() => currentPage.value < props.totalPages)

const goPrev = () => {
  if (canGoPrev.value) {
    currentPage.value--
  }
}

const goNext = () => {
  if (canGoNext.value) {
    currentPage.value++
  }
}
</script>

<template>
  <div v-if="totalPages > 1" class="pagination">
    <button
      class="btn btn-ghost btn-small"
      :disabled="!canGoPrev"
      @click="goPrev"
    >
      {{ prevLabel }}
    </button>
    <span class="page-info text-secondary">
      第 {{ currentPage }} / {{ totalPages }} 頁
    </span>
    <button
      class="btn btn-ghost btn-small"
      :disabled="!canGoNext"
      @click="goNext"
    >
      {{ nextLabel }}
    </button>
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

.page-info {
  font-size: 14px;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
