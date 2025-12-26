<script setup lang="ts">
export type VerificationMethod = 'MANUAL' | 'BARCODE' | 'QR_CODE' | 'FACE_ID' | 'FINGERPRINT'

interface Props {
  modelValue: VerificationMethod
  disabled?: boolean
  color?: 'green' | 'indigo'
}

interface Emits {
  (e: 'update:modelValue', value: VerificationMethod): void
  (e: 'scan', method: VerificationMethod): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  color: 'green'
})

const emit = defineEmits<Emits>()

const methods: Array<{
  value: VerificationMethod
  label: string
  icon: string
  available: boolean
}> = [
  {
    value: 'MANUAL',
    label: '手動輸入',
    icon: 'keyboard',
    available: true
  },
  {
    value: 'BARCODE',
    label: '條碼掃描',
    icon: 'barcode',
    available: true
  },
  {
    value: 'QR_CODE',
    label: 'QR Code',
    icon: 'qr-code',
    available: true
  },
  {
    value: 'FACE_ID',
    label: '人臉識別',
    icon: 'face',
    available: false // Coming soon
  },
  {
    value: 'FINGERPRINT',
    label: '指紋識別',
    icon: 'fingerprint',
    available: false // Coming soon
  }
]

const selectMethod = (method: VerificationMethod, available: boolean) => {
  if (!available || props.disabled) return
  emit('update:modelValue', method)
  if (method !== 'MANUAL') {
    emit('scan', method)
  }
}

const getSvgIcon = (iconName: string) => {
  const icons: Record<string, string> = {
    keyboard: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>',
    barcode: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
    'qr-code': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>',
    face: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    fingerprint: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M8.65 22c.21-.66.45-1.32.57-2 .1-.5.15-1 .15-1.5 0-1.7.9-3.5 2.63-3.5"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/></svg>'
  }
  return icons[iconName] || ''
}
</script>

<template>
  <div class="verification-selector">
    <label class="selector-label">驗證方式</label>
    <div class="methods-grid" :class="`color-${color}`">
      <button
        v-for="method in methods"
        :key="method.value"
        type="button"
        class="method-btn"
        :class="{
          active: modelValue === method.value,
          disabled: !method.available || disabled,
          unavailable: !method.available
        }"
        :disabled="!method.available || disabled"
        @click="selectMethod(method.value, method.available)"
      >
        <div class="method-icon" v-html="getSvgIcon(method.icon)"></div>
        <span class="method-label">{{ method.label }}</span>
        <span v-if="!method.available" class="coming-soon">即將推出</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.verification-selector {
  margin-bottom: var(--space-lg);
}

.selector-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-sm);
}

.method-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  min-height: 100px;
}

.method-btn:hover:not(.disabled) {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
  transform: translateY(-2px);
}

.method-btn.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.method-btn.unavailable {
  cursor: not-allowed;
  opacity: 0.4;
}

/* Green theme (Member check-in) */
.methods-grid.color-green .method-btn.active {
  border-color: #34C759;
  background: rgba(52, 199, 89, 0.1);
}

.methods-grid.color-green .method-btn.active .method-icon {
  color: #34C759;
}

/* Indigo theme (Staff attendance) */
.methods-grid.color-indigo .method-btn.active {
  border-color: #5856D6;
  background: rgba(88, 86, 214, 0.1);
}

.methods-grid.color-indigo .method-btn.active .method-icon {
  color: #5856D6;
}

.method-icon {
  width: 32px;
  height: 32px;
  color: var(--color-text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
}

.method-btn.active .method-icon {
  transform: scale(1.1);
}

.method-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  text-align: center;
}

.coming-soon {
  position: absolute;
  top: var(--space-xs);
  right: var(--space-xs);
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

@media (max-width: 640px) {
  .methods-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
