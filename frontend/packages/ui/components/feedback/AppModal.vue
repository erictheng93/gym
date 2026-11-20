<script setup lang="ts">
/**
 * AppModal - 模態對話框組件
 *
 * @example
 * <AppModal v-model="showModal" title="員工詳情">
 *   <template #header>
 *     <AppAvatar :name="employee.name" />
 *     <div>
 *       <h2>{{ employee.name }}</h2>
 *     </div>
 *   </template>
 *   <p>Modal content here</p>
 *   <template #footer>
 *     <button @click="showModal = false">關閉</button>
 *   </template>
 * </AppModal>
 */

interface Props {
  /** 控制顯示/隱藏 */
  modelValue: boolean
  /** 標題 */
  title?: string
  /** 最大寬度 */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
}

withDefaults(defineProps<Props>(), {
  title: undefined,
  maxWidth: 'md'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const close = () => {
  emit('update:modelValue', false)
}

const maxWidthMap = {
  sm: '400px',
  md: '560px',
  lg: '720px',
  xl: '900px'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal-overlay" @click.self="close">
        <div
          class="modal-container"
          :style="{ maxWidth: maxWidthMap[maxWidth] }"
        >
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-section">
              <slot name="header">
                <h2 v-if="title" class="modal-title">{{ title }}</h2>
              </slot>
            </div>
            <button class="modal-close" @click="close">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.68);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-md);
}

.modal-container {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--color-border-strong);
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: var(--shadow-xl), inset 0 1px 0 var(--color-border-specular);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-xl);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}

.modal-title-section {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex: 1;
  min-width: 0;
}

.modal-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--color-text-primary);
  margin: 0;
}

.modal-close {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-spring),
              background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}

.modal-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  transform: scale(1.05);
}

.modal-close:active {
  transform: scale(0.95);
}

.modal-body {
  padding: var(--space-xl);
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  border-top: 1px solid var(--color-divider);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

/* Transitions with Spring Physics */
.modal-enter-active {
  transition: opacity 0.25s var(--ease-out);
}

.modal-leave-active {
  transition: opacity 0.2s ease-in;
}

.modal-enter-active .modal-container {
  transition: transform 0.35s var(--ease-spring), opacity 0.25s var(--ease-out);
}

.modal-leave-active .modal-container {
  transition: transform 0.2s ease-in, opacity 0.2s ease-in;
}

.modal-enter-from {
  opacity: 0;
}

.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container {
  opacity: 0;
  transform: translateY(16px) scale(0.96);
}

.modal-leave-to .modal-container {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}

/* Responsive */
@media (max-width: 640px) {
  .modal-container {
    width: 100%;
    max-height: 94vh;
    border-radius: var(--radius-xl);
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding: var(--space-lg);
  }
}
</style>
