<script setup lang="ts">
const { state, handleConfirm, handleCancel } = useConfirm()

// ESC 鍵關閉
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && state.value.isOpen) {
    handleCancel()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="state.isOpen" class="dialog-overlay" @click.self="handleCancel">
        <div class="dialog-container">
          <div class="dialog-content">
            <!-- Icon -->
            <div :class="['dialog-icon', `dialog-icon--${state.options?.type}`]">
              <svg v-if="state.options?.type === 'danger'" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <svg v-else-if="state.options?.type === 'warning'" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>

            <!-- Title & Message -->
            <h3 class="dialog-title">{{ state.options?.title }}</h3>
            <p class="dialog-message">{{ state.options?.message }}</p>

            <!-- Actions -->
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="handleCancel">
                {{ state.options?.cancelText }}
              </button>
              <button
                :class="['dialog-btn', `dialog-btn--${state.options?.type}`]"
                @click="handleConfirm"
              >
                {{ state.options?.confirmText }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg, 20px);
}

.dialog-container {
  width: 100%;
  max-width: 420px;
}

.dialog-content {
  background: var(--color-bg-primary, #fff);
  border-radius: var(--radius-xl, 16px);
  padding: var(--space-xl, 24px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.dialog-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full, 50%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-lg, 20px);
}

.dialog-icon--danger {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error, #ff3b30);
}

.dialog-icon--warning {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.dialog-icon--info {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-accent, #0071e3);
}

.dialog-title {
  margin: 0 0 var(--space-sm, 12px) 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary, #1d1d1f);
}

.dialog-message {
  margin: 0 0 var(--space-xl, 24px) 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-text-secondary, #86868b);
}

.dialog-actions {
  display: flex;
  gap: var(--space-sm, 12px);
  width: 100%;
}

.dialog-btn {
  flex: 1;
  padding: var(--space-md, 14px) var(--space-lg, 20px);
  border: none;
  border-radius: var(--radius-lg, 12px);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.dialog-btn--secondary {
  background: var(--color-bg-secondary, #f5f5f7);
  color: var(--color-text-primary, #1d1d1f);
}

.dialog-btn--secondary:hover {
  background: var(--color-bg-tertiary, #e8e8ed);
}

.dialog-btn--danger {
  background: var(--color-error, #ff3b30);
  color: white;
}

.dialog-btn--danger:hover {
  background: #e6352b;
}

.dialog-btn--warning {
  background: #ff9500;
  color: white;
}

.dialog-btn--warning:hover {
  background: #e68600;
}

.dialog-btn--info {
  background: var(--color-accent, #0071e3);
  color: white;
}

.dialog-btn--info:hover {
  background: #0066d1;
}

/* Transitions */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.dialog-enter-active .dialog-content,
.dialog-leave-active .dialog-content {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-content {
  transform: scale(0.95) translateY(-10px);
}

.dialog-leave-to .dialog-content {
  transform: scale(0.9) translateY(10px);
}
</style>
