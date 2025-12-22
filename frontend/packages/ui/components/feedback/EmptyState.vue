<script setup lang="ts">
/**
 * EmptyState - 空狀態組件
 *
 * 當列表為空時顯示的提示，支援自定義圖標、標題和操作按鈕
 */

interface Props {
  /** 標題 */
  title: string
  /** 描述 */
  description?: string
  /** 圖標類型 */
  icon?: 'users' | 'files' | 'inbox' | 'search' | 'calendar' | 'dollar'
  /** 操作按鈕文字 */
  actionLabel?: string
  /** 操作按鈕連結 */
  actionTo?: string
}

const props = withDefaults(defineProps<Props>(), {
  description: undefined,
  icon: 'inbox',
  actionLabel: undefined,
  actionTo: undefined
})

const emit = defineEmits<{
  action: []
}>()

// 圖標 SVG 定義
const icons: Record<string, { viewBox: string; paths: string[] }> = {
  users: {
    viewBox: '0 0 24 24',
    paths: [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      'M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
      'M22 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75'
    ]
  },
  files: {
    viewBox: '0 0 24 24',
    paths: [
      'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
      'M14 2v4a2 2 0 0 0 2 2h4'
    ]
  },
  inbox: {
    viewBox: '0 0 24 24',
    paths: [
      'M22 12h-6l-2 3h-4l-2-3H2',
      'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
    ]
  },
  search: {
    viewBox: '0 0 24 24',
    paths: [
      'M11 11a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
      'M21 21l-4.35-4.35'
    ]
  },
  calendar: {
    viewBox: '0 0 24 24',
    paths: [
      'M8 2v4',
      'M16 2v4',
      'M3 10h18',
      'M21 8.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7'
    ]
  },
  dollar: {
    viewBox: '0 0 24 24',
    paths: [
      'M12 2v20',
      'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'
    ]
  }
}

const currentIcon = computed(() => icons[props.icon] || icons.inbox)
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        :viewBox="currentIcon.viewBox"
        fill="none"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path v-for="(d, i) in currentIcon.paths" :key="i" :d="d" />
      </svg>
    </div>
    <h3 class="text-title-3">{{ title }}</h3>
    <p v-if="description" class="text-secondary">{{ description }}</p>
    <slot />
    <NuxtLink v-if="actionTo && actionLabel" :to="actionTo" class="btn btn-primary mt-lg">
      {{ actionLabel }}
    </NuxtLink>
    <button v-else-if="actionLabel" class="btn btn-primary mt-lg" @click="emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
}

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-lg);
}

.empty-state h3 {
  margin-bottom: var(--space-xs);
}

.empty-state p {
  margin: 0;
  max-width: 300px;
}
</style>
