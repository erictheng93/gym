<script setup lang="ts" generic="T extends Record<string, any>">
/**
 * DataTable - 數據表格組件
 *
 * 通用的數據表格，支援：
 * - 自定義欄位配置
 * - 載入狀態
 * - 空狀態
 * - 內建分頁
 * - 行點擊事件
 * - 插槽自定義渲染
 * - 批量選擇
 *
 * @example
 * <DataTable
 *   :data="members"
 *   :columns="[
 *     { key: 'name', label: '姓名' },
 *     { key: 'email', label: 'Email' },
 *     { key: 'status', label: '狀態', slot: 'status' }
 *   ]"
 *   :loading="isLoading"
 *   empty-title="尚無會員"
 *   empty-action-label="新增會員"
 *   empty-action-to="/members/new"
 *   row-clickable
 *   selectable
 *   v-model:selected="selectedIds"
 *   @row-click="handleRowClick"
 * >
 *   <template #status="{ row }">
 *     <AppBadge :label="row.status" variant="success" />
 *   </template>
 * </DataTable>
 */

import LoadingState from '../feedback/LoadingState.vue'
import EmptyState from '../feedback/EmptyState.vue'

export interface Column<T> {
  /** 數據的 key */
  key: keyof T | string
  /** 顯示的標題 */
  label: string
  /** 使用插槽名稱 */
  slot?: string
  /** 欄位寬度 */
  width?: string
  /** 對齊方式 */
  align?: 'left' | 'center' | 'right'
  /** 格式化函數 */
  format?: (value: any, row: T) => string
  /** 是否隱藏在手機版 */
  hideOnMobile?: boolean
}

interface Props {
  /** 數據列表 */
  data: T[]
  /** 欄位配置 */
  columns: Column<T>[]
  /** 是否載入中 */
  loading?: boolean
  /** 載入中訊息 */
  loadingMessage?: string
  /** 空狀態標題 */
  emptyTitle?: string
  /** 空狀態描述 */
  emptyDescription?: string
  /** 空狀態圖標 */
  emptyIcon?: 'users' | 'files' | 'inbox' | 'search' | 'calendar' | 'dollar' | 'grid' | 'bookmark' | 'folder' | 'check'
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
  /** 是否顯示操作欄 */
  showActions?: boolean
  /** 是否啟用批量選擇 */
  selectable?: boolean
  /** 已選擇的項目 ID 列表 (v-model:selected) */
  selected?: string[]
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
  rowKey: 'id',
  showActions: false,
  selectable: false,
  selected: () => []
})

const emit = defineEmits<{
  'row-click': [row: T, index: number]
  'empty-action': []
  'update:selected': [selected: string[]]
}>()

// 取得欄位的值
const getCellValue = (row: T, column: Column<T>) => {
  const keys = String(column.key).split('.')
  let value: any = row

  for (const key of keys) {
    value = value?.[key]
  }

  if (column.format) {
    return column.format(value, row)
  }

  return value ?? '—'
}

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

// 選擇相關邏輯
const isAllSelected = computed(() => {
  if (!props.selectable || props.data.length === 0) return false
  return props.data.every(row => props.selected.includes(String(getRowKey(row, 0))))
})

const isIndeterminate = computed(() => {
  if (!props.selectable || props.data.length === 0) return false
  const selectedCount = props.data.filter(row =>
    props.selected.includes(String(getRowKey(row, 0)))
  ).length
  return selectedCount > 0 && selectedCount < props.data.length
})

const isRowSelected = (row: T) => {
  return props.selected.includes(String(getRowKey(row, 0)))
}

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // Deselect all current page items
    const currentIds = props.data.map(row => String(getRowKey(row, 0)))
    const newSelected = props.selected.filter(id => !currentIds.includes(id))
    emit('update:selected', newSelected)
  } else {
    // Select all current page items
    const currentIds = props.data.map(row => String(getRowKey(row, 0)))
    const newSelected = [...new Set([...props.selected, ...currentIds])]
    emit('update:selected', newSelected)
  }
}

const toggleRowSelect = (row: T, event: Event) => {
  event.stopPropagation()
  const rowId = String(getRowKey(row, 0))
  if (props.selected.includes(rowId)) {
    emit('update:selected', props.selected.filter(id => id !== rowId))
  } else {
    emit('update:selected', [...props.selected, rowId])
  }
}
</script>

<template>
  <div class="data-table-wrapper card">
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

    <!-- Batch Actions Toolbar -->
    <slot v-if="selectable && selected.length > 0" name="batch-actions" :selected="selected" :count="selected.length">
      <div class="batch-actions-bar">
        <span class="selected-count">已選擇 {{ selected.length }} 項</span>
        <button type="button" class="btn btn-ghost btn-small" @click="emit('update:selected', [])">
          清除選擇
        </button>
      </div>
    </slot>

    <!-- Data Table -->
    <table v-else-if="data.length > 0" class="data-table">
      <thead>
        <tr>
          <th v-if="selectable" class="checkbox-cell">
            <input
              type="checkbox"
              class="table-checkbox"
              :checked="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleSelectAll"
            />
          </th>
          <th
            v-for="column in columns"
            :key="String(column.key)"
            :class="[
              column.align ? `text-${column.align}` : '',
              column.hideOnMobile ? 'hide-mobile' : ''
            ]"
            :style="column.width ? { width: column.width } : {}"
          >
            {{ column.label }}
          </th>
          <th v-if="showActions || $slots.actions" class="actions-header" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in data"
          :key="getRowKey(row, index)"
          :class="[
            animated ? 'stagger-item' : '',
            rowClickable ? 'clickable-row' : '',
            selectable && isRowSelected(row) ? 'selected-row' : ''
          ]"
          :style="animated ? { animationDelay: `${index * 0.03}s` } : {}"
          @click="handleRowClick(row, index)"
        >
          <td v-if="selectable" class="checkbox-cell" @click.stop>
            <input
              type="checkbox"
              class="table-checkbox"
              :checked="isRowSelected(row)"
              @change="(e) => toggleRowSelect(row, e)"
            />
          </td>
          <td
            v-for="column in columns"
            :key="String(column.key)"
            :class="[
              column.align ? `text-${column.align}` : '',
              column.hideOnMobile ? 'hide-mobile' : ''
            ]"
          >
            <!-- 使用具名插槽 -->
            <slot
              v-if="column.slot"
              :name="column.slot"
              :row="row"
              :value="getCellValue(row, column)"
              :index="index"
            />
            <!-- 預設渲染 -->
            <template v-else>
              {{ getCellValue(row, column) }}
            </template>
          </td>
          <td v-if="showActions || $slots.actions" class="actions-cell">
            <slot name="actions" :row="row" :index="index" />
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Footer Slot (用於分頁等) -->
    <slot name="footer" />
  </div>
</template>

<style scoped>
.data-table-wrapper {
  overflow: hidden;
  animation: tableAppear 0.6s var(--ease-out) backwards;
  animation-delay: 0.2s;
}

@keyframes tableAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

/* Data Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  padding: var(--space-md) var(--space-lg);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-divider);
}

.data-table td {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-divider);
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr {
  transition: background var(--duration-fast) var(--ease-out);
}

.data-table tbody tr:hover {
  background: var(--color-bg-secondary);
}

/* Clickable Row */
.clickable-row {
  cursor: pointer;
}

/* Actions Cell */
.actions-header {
  width: 100px;
}

.actions-cell {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.data-table tbody tr:hover .actions-cell {
  opacity: 1;
}

/* Batch Actions Bar */
.batch-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-accent-light, rgba(0, 113, 227, 0.08));
  border-bottom: 1px solid var(--color-accent, #0071e3);
}

.selected-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-accent, #0071e3);
}

/* Checkbox Cell */
.checkbox-cell {
  width: 48px;
  text-align: center;
}

.table-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent, #0071e3);
  cursor: pointer;
}

/* Selected Row */
.selected-row {
  background: var(--color-accent-light, rgba(0, 113, 227, 0.05)) !important;
}

/* Alignment */
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }

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

/* Responsive */
@media (max-width: 1024px) {
  .data-table {
    display: block;
    overflow-x: auto;
  }
}

@media (max-width: 640px) {
  .hide-mobile {
    display: none;
  }

  .data-table th,
  .data-table td {
    padding: var(--space-sm) var(--space-md);
  }
}
</style>
