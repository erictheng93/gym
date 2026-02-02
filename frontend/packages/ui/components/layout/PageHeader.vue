<script setup lang="ts">
/**
 * PageHeader - 頁面標題組件
 *
 * 提供統一的頁面標題區域，包含標題、描述和可選的操作按鈕
 *
 * @example
 * <PageHeader
 *   title="會員管理"
 *   description="管理所有會員資料"
 *   action-label="新增會員"
 *   action-to="/members/new"
 *   action-icon="user-plus"
 * />
 */

interface Props {
  /** 頁面標題 */
  title: string
  /** 頁面描述（可選） */
  description?: string
  /** 主要操作按鈕文字 */
  actionLabel?: string
  /** 主要操作按鈕連結 */
  actionTo?: string
  /** 主要操作按鈕圖標名稱 */
  actionIcon?: 'user-plus' | 'file-plus' | 'plus' | 'settings' | 'download' | 'upload' | 'megaphone' | 'clipboard-check' | 'ticket' | 'dollar'
}

const props = withDefaults(defineProps<Props>(), {
  description: undefined,
  actionLabel: undefined,
  actionTo: undefined,
  actionIcon: 'plus'
})

const emit = defineEmits<{
  /** 當操作按鈕被點擊時觸發（若未設置 actionTo） */
  action: []
}>()

const handleAction = () => {
  if (!props.actionTo) {
    emit('action')
  }
}

// 圖標 SVG 路徑映射
const iconPaths: Record<string, string> = {
  'user-plus': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8v6 M22 11h-6',
  'file-plus': 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z M14 2v4a2 2 0 0 0 2 2h4 M12 18v-6 M9 15h6',
  'plus': 'M12 5v14 M5 12h14',
  'settings': 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  'upload': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  'megaphone': 'M3 11l18-5v12L3 13v-2z M11.6 16.8a3 3 0 1 1-5.8-1.6',
  'clipboard-check': 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M9 14l2 2 4-4',
  'ticket': 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M13 5v2 M13 17v2 M13 11v2',
  'dollar': 'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'
}
</script>

<template>
  <header class="page-header">
    <div class="header-content">
      <h1 class="text-headline">{{ title }}</h1>
      <p v-if="description" class="text-body text-secondary">{{ description }}</p>
      <!-- 額外內容插槽 -->
      <slot name="subtitle" />
    </div>

    <div class="header-actions">
      <!-- 額外操作按鈕插槽 -->
      <slot name="actions" />

      <!-- 主要操作按鈕 -->
      <NuxtLink v-if="actionTo && actionLabel" :to="actionTo" class="btn btn-primary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path v-for="(d, i) in iconPaths[actionIcon]?.split(' M').map((p, idx) => idx === 0 ? p : 'M' + p)" :key="i" :d="d" />
        </svg>
        {{ actionLabel }}
      </NuxtLink>

      <button v-else-if="actionLabel" class="btn btn-primary" @click="handleAction">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path v-for="(d, i) in iconPaths[actionIcon]?.split(' M').map((p, idx) => idx === 0 ? p : 'M' + p)" :key="i" :d="d" />
        </svg>
        {{ actionLabel }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  animation: headerAppear 0.6s var(--ease-out) backwards;
}

@keyframes headerAppear {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-shrink: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
    align-items: stretch;
  }

  .header-actions {
    flex-direction: column;
  }

  .header-actions .btn {
    width: 100%;
  }
}
</style>
