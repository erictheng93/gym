<script setup lang="ts" generic="T extends Record<string, any>">
/**
 * DataList - 卡片式列表組件
 *
 * 無表頭的卡片式列表，適合行動裝置友善的設計
 * 支援：
 * - 載入狀態
 * - 空狀態
 * - 行點擊事件
 * - 完全自定義渲染（透過插槽）
 *
 * @example
 * <DataList
 *   :data="employees"
 *   :loading="isLoading"
 *   empty-title="尚無員工"
 *   empty-action-label="新增員工"
 *   empty-action-to="/hr/employees/new"
 *   row-clickable
 *   @row-click="handleRowClick"
 * >
 *   <template #item="{ row }">
 *     <div class="employee-card">
 *       <span>{{ row.fullName }}</span>
 *     </div>
 *   </template>
 * </DataList>
 */

import LoadingState from '../feedback/LoadingState.vue'
import EmptyState from '../feedback/EmptyState.vue'

interface Props {
  /** 數據列表 */
  data: T[]
  /** 是否載入中 */
  loading?: boolean
  /** 載入中訊息 */
  loadingMessage?: string
  /** 空狀態標題 */
  emptyTitle?: string
  /** 空狀態描述 */
  emptyDescription?: string
  /** 空狀態圖標 */
  emptyIcon?: 'users' | 'files' | 'inbox' | 'search' | 'calendar' | 'dollar' | 'grid' | 'bookmark' | 'folder' | 'check' | 'clipboard' | 'clock' | 'chart' | 'megaphone' | 'ticket' | 'alert-circle' | 'file-text' | 'dollar-sign' | 'bar-chart-2'
  /** 空狀態操作按鈕文字 */
  emptyActionLabel?: string
  /** 空狀態操作按鈕連結 */
  emptyActionTo?: string
  /** 行是否可點擊 */
  rowClickable?: boolean
  /** 是否顯示行動畫 */
  animated?: boolean
  /** 行唯一標識的 key */
  rowKey?: keyof T | string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  loadingMessage: '載入中...',
  emptyTitle: '暫無數據',
  emptyDescription: undefined,
  emptyIcon: 'inbox',
  emptyActionLabel: undefined,
  emptyActionTo: undefined,
  rowClickable: false,
  animated: true,
  rowKey: 'id'
})

const emit = defineEmits<{
  'row-click': [row: T, index: number]
  'empty-action': []
}>()

// 取得行的唯一 key
const getRowKey = (row: T, index: number) => {
  const key = props.rowKey as string
  return row[key] ?? index
}

// 處理行點擊
const handleRowClick = (row: T, index: number) => {
  if (props.rowClickable) {
    emit('row-click', row, index)
  }
}
</script>

<template>
  <div class="data-list-wrapper card">
    <!-- Loading State -->
    <LoadingState
      v-if="loading"
      :message="loadingMessage"
    />

    <!-- Empty State -->
    <EmptyState
      v-else-if="data.length === 0"
      :title="emptyTitle"
      :description="emptyDescription"
      :icon="emptyIcon"
      :action-label="emptyActionLabel"
      :action-to="emptyActionTo"
      @action="emit('empty-action')"
    >
      <slot name="empty" />
    </EmptyState>

    <!-- Data List -->
    <div v-else class="data-list">
      <div
        v-for="(row, index) in data"
        :key="getRowKey(row, index)"
        :class="[
          'data-list-item',
          animated ? 'stagger-item' : '',
          rowClickable ? 'clickable-row' : ''
        ]"
        :style="animated ? { animationDelay: `${index * 0.03}s` } : {}"
        @click="handleRowClick(row, index)"
      >
        <slot name="item" :row="row" :index="index" />
      </div>
    </div>

    <!-- Footer Slot (用於分頁等) -->
    <slot name="footer" />
  </div>
</template>

<style scoped>
.data-list-wrapper {
  overflow: hidden;
  animation: listAppear 0.6s var(--ease-out) backwards;
  animation-delay: 0.2s;
}

@keyframes listAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

/* Data List */
.data-list {
  display: flex;
  flex-direction: column;
}

.data-list-item {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-divider);
  transition: background var(--duration-fast) var(--ease-out);
}

.data-list-item:last-child {
  border-bottom: none;
}

.data-list-item:hover {
  background: var(--color-bg-secondary);
}

/* Clickable Row */
.clickable-row {
  cursor: pointer;
}

/* Stagger Animation */
.stagger-item {
  opacity: 0;
  transform: translateY(10px);
  animation: staggerIn 0.4s var(--ease-out) forwards;
}

@keyframes staggerIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
