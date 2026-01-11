<script setup lang="ts">
/**
 * AccessibleModal Component
 *
 * A fully accessible modal dialog that implements:
 * - Focus trap (keyboard navigation stays within modal)
 * - ARIA attributes for screen readers
 * - Escape key to close
 * - Click outside to close (optional)
 * - Focus restoration on close
 * - Proper role and aria-modal
 */

const props = withDefaults(defineProps<{
  /** Whether the modal is visible */
  show: boolean
  /** Modal title for screen readers (required for accessibility) */
  title: string
  /** Optional description for screen readers */
  description?: string
  /** Whether clicking outside closes the modal */
  closeOnClickOutside?: boolean
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean
  /** Size variant of the modal */
  size?: 'sm' | 'md' | 'lg' | 'full'
  /** Position of the modal */
  position?: 'center' | 'bottom'
  /** Hide the close button */
  hideCloseButton?: boolean
}>(), {
  closeOnClickOutside: true,
  closeOnEscape: true,
  size: 'md',
  position: 'bottom',
  hideCloseButton: false,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { activate, deactivate } = useFocusTrap()

const modalRef = ref<HTMLElement | null>(null)
const titleId = `modal-title-${Math.random().toString(36).substring(2, 9)}`
const descriptionId = `modal-desc-${Math.random().toString(36).substring(2, 9)}`

const handleClose = () => {
  emit('close')
}

const handleOverlayClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget && props.closeOnClickOutside) {
    handleClose()
  }
}

// Manage focus trap when modal visibility changes
watch(() => props.show, (isVisible) => {
  if (isVisible) {
    nextTick(() => {
      if (modalRef.value) {
        activate(modalRef.value, {
          escapeDeactivates: props.closeOnEscape,
          onEscape: handleClose,
          clickOutsideDeactivates: false, // Handle this manually via overlay
        })
      }
    })
    // Prevent body scroll when modal is open
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden'
    }
  } else {
    deactivate()
    // Restore body scroll
    if (typeof document !== 'undefined') {
      document.body.style.overflow = ''
    }
  }
}, { immediate: true })

// Clean up on unmount
onUnmounted(() => {
  deactivate()
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})

const sizeClasses = computed(() => {
  const sizes: Record<string, string> = {
    sm: 'modal-sm',
    md: 'modal-md',
    lg: 'modal-lg',
    full: 'modal-full',
  }
  return sizes[props.size] || sizes.md
})

const positionClasses = computed(() => {
  return props.position === 'center' ? 'modal-center' : 'modal-bottom'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="modal-overlay"
        @click="handleOverlayClick"
      >
        <div
          ref="modalRef"
          class="modal-content"
          :class="[sizeClasses, positionClasses]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
        >
          <!-- Close Button -->
          <button
            v-if="!hideCloseButton"
            class="modal-close"
            type="button"
            aria-label="關閉對話框"
            @click="handleClose"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <!-- Screen reader only title (can be overridden by slot) -->
          <h2
            :id="titleId"
            class="sr-only"
          >
            {{ title }}
          </h2>

          <!-- Optional screen reader description -->
          <p
            v-if="description"
            :id="descriptionId"
            class="sr-only"
          >
            {{ description }}
          </p>

          <!-- Modal Header Slot -->
          <header v-if="$slots.header" class="modal-header">
            <slot name="header" />
          </header>

          <!-- Modal Body Slot -->
          <div class="modal-body">
            <slot />
          </div>

          <!-- Modal Footer Slot -->
          <footer v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Screen reader only class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  z-index: 1000;
  padding: 20px;
}

/* Position variants */
.modal-overlay:has(.modal-bottom) {
  align-items: flex-end;
  justify-content: center;
}

.modal-overlay:has(.modal-center) {
  align-items: center;
  justify-content: center;
}

.modal-content {
  width: 100%;
  background-color: var(--color-background);
  padding: 24px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
  outline: none;
}

/* Size variants */
.modal-sm {
  max-width: 320px;
}

.modal-md {
  max-width: 500px;
}

.modal-lg {
  max-width: 700px;
}

.modal-full {
  max-width: 100%;
  max-height: 100vh;
  height: 100%;
  border-radius: 0;
}

/* Position-specific border radius */
.modal-bottom {
  border-radius: 24px 24px 0 0;
}

.modal-center {
  border-radius: 24px;
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  background-color: var(--color-surface-secondary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: background-color 0.2s ease;
}

.modal-close:hover {
  background-color: var(--color-border);
}

.modal-close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.modal-header {
  margin-bottom: 16px;
  padding-right: 48px;
}

.modal-body {
  min-height: 50px;
}

.modal-footer {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Position-specific transitions */
.modal-enter-from .modal-bottom,
.modal-leave-to .modal-bottom {
  transform: translateY(100%);
}

.modal-enter-from .modal-center,
.modal-leave-to .modal-center {
  transform: scale(0.95);
}

/* Focus visible styles for all focusable elements within modal */
.modal-content :deep(button:focus-visible),
.modal-content :deep(a:focus-visible),
.modal-content :deep(input:focus-visible),
.modal-content :deep(textarea:focus-visible),
.modal-content :deep(select:focus-visible),
.modal-content :deep([tabindex]:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
