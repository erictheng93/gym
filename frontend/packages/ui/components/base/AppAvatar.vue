<script setup lang="ts">
/**
 * AppAvatar - 頭像組件
 *
 * 顯示用戶頭像或姓名首字
 */

interface Props {
  /** 用戶名稱（用於提取首字） */
  name?: string
  /** 頭像圖片 URL */
  src?: string
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 顏色變體 */
  variant?: 'blue' | 'green' | 'purple' | 'orange' | 'pink'
}

const props = withDefaults(defineProps<Props>(), {
  name: '?',
  src: undefined,
  size: 'md',
  variant: 'blue'
})

const initial = computed(() => {
  if (!props.name) return '?'
  return props.name.charAt(0).toUpperCase()
})

const sizeMap = {
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64
}
</script>

<template>
  <div
    :class="['avatar', `size-${size}`, `variant-${variant}`]"
    :style="{ width: `${sizeMap[size]}px`, height: `${sizeMap[size]}px` }"
  >
    <img v-if="src" :src="src" :alt="name" class="avatar-img" />
    <span v-else class="avatar-initial">{{ initial }}</span>
  </div>
</template>

<style scoped>
.avatar {
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
  overflow: hidden;
}

.size-sm {
  font-size: 12px;
}

.size-md {
  font-size: 14px;
}

.size-lg {
  font-size: 18px;
}

.size-xl {
  font-size: 24px;
}

.variant-blue {
  background: linear-gradient(135deg, #0071e3, #5856d6);
}

.variant-green {
  background: linear-gradient(135deg, #34c759, #30d158);
}

.variant-purple {
  background: linear-gradient(135deg, #5856d6, #af52de);
}

.variant-orange {
  background: linear-gradient(135deg, #ff9500, #ff3b30);
}

.variant-pink {
  background: linear-gradient(135deg, #ff2d55, #ff375f);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
