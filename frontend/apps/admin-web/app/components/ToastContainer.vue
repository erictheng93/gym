<script setup lang="ts">
const { toasts } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast', `toast--${toast.type}`]"
        >
          <div class="toast-icon">
            <svg v-if="toast.type === 'success'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <svg v-else-if="toast.type === 'error'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <svg v-else-if="toast.type === 'warning'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <p class="toast-message">{{ toast.message }}</p>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: var(--space-xl, 24px);
  right: var(--space-xl, 24px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm, 12px);
  max-width: 420px;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-md, 16px);
  padding: var(--space-md, 16px) var(--space-lg, 20px);
  background: var(--color-bg-primary, #fff);
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-border, #e5e7eb);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(10px);
}

.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast--success {
  border-color: rgba(52, 199, 89, 0.3);
}

.toast--success .toast-icon {
  color: var(--color-success, #34c759);
}

.toast--error {
  border-color: rgba(255, 59, 48, 0.3);
}

.toast--error .toast-icon {
  color: var(--color-error, #ff3b30);
}

.toast--warning {
  border-color: rgba(255, 149, 0, 0.3);
}

.toast--warning .toast-icon {
  color: #ff9500;
}

.toast--info {
  border-color: rgba(0, 113, 227, 0.3);
}

.toast--info .toast-icon {
  color: var(--color-accent, #0071e3);
}

.toast-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-primary, #1d1d1f);
}

/* Transitions */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%) scale(0.95);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
}

.toast-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (max-width: 768px) {
  .toast-container {
    left: var(--space-md, 16px);
    right: var(--space-md, 16px);
    top: var(--space-md, 16px);
    max-width: none;
  }
}
</style>
