<script setup lang="ts">
const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const hasSignature = ref(false)

let ctx: CanvasRenderingContext2D | null = null
let lastX = 0
let lastY = 0

const setupCanvas = () => {
  if (!canvasRef.value) return

  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()

  // Set canvas size for high DPI
  const dpr = window.devicePixelRatio || 1
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr

  ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale(dpr, dpr)
  ctx.strokeStyle = '#1d1d1f'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Load existing signature if provided
  if (props.modelValue) {
    const img = new Image()
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, rect.width, rect.height)
      hasSignature.value = true
    }
    img.src = props.modelValue
  }
}

onMounted(setupCanvas)

const getCoordinates = (e: MouseEvent | TouchEvent) => {
  if (!canvasRef.value) return { x: 0, y: 0 }

  const rect = canvasRef.value.getBoundingClientRect()

  if ('touches' in e && e.touches[0]) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top
    }
  }

  const mouseEvent = e as MouseEvent
  return {
    x: mouseEvent.clientX - rect.left,
    y: mouseEvent.clientY - rect.top
  }
}

const startDrawing = (e: MouseEvent | TouchEvent) => {
  e.preventDefault()
  isDrawing.value = true
  hasSignature.value = true

  const coords = getCoordinates(e)
  lastX = coords.x
  lastY = coords.y
}

const draw = (e: MouseEvent | TouchEvent) => {
  if (!isDrawing.value || !ctx) return
  e.preventDefault()

  const coords = getCoordinates(e)

  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(coords.x, coords.y)
  ctx.stroke()

  lastX = coords.x
  lastY = coords.y
}

const stopDrawing = () => {
  if (isDrawing.value && hasSignature.value) {
    saveSignature()
  }
  isDrawing.value = false
}

const saveSignature = () => {
  if (!canvasRef.value) return
  const dataUrl = canvasRef.value.toDataURL('image/png')
  emit('update:modelValue', dataUrl)
}

const clearSignature = () => {
  if (!canvasRef.value || !ctx) return

  const rect = canvasRef.value.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)
  hasSignature.value = false
  emit('update:modelValue', '')
}

// Handle window resize
const handleResize = () => {
  const currentSignature = props.modelValue
  setupCanvas()
  if (currentSignature) {
    emit('update:modelValue', currentSignature)
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Expose for testing
defineExpose({
  canvasRef,
  isDrawing,
  hasSignature,
  clearSignature
})
</script>

<template>
  <div class="signature-pad">
    <div class="canvas-container" :class="{ 'has-signature': hasSignature }">
      <canvas
        ref="canvasRef"
        @mousedown="startDrawing"
        @mousemove="draw"
        @mouseup="stopDrawing"
        @mouseleave="stopDrawing"
        @touchstart="startDrawing"
        @touchmove="draw"
        @touchend="stopDrawing"
      />
      <div v-if="!hasSignature" class="placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
        <span>請在此簽名</span>
      </div>
    </div>
    <div class="signature-actions">
      <button type="button" class="clear-btn" :disabled="!hasSignature" @click="clearSignature">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
        清除
      </button>
    </div>
  </div>
</template>

<style scoped>
.signature-pad {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.canvas-container {
  position: relative;
  width: 100%;
  height: 200px;
  border: 2px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-bg-primary);
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.canvas-container:hover {
  border-color: var(--color-accent);
}

.canvas-container.has-signature {
  border-style: solid;
  border-color: var(--color-success);
}

.canvas-container canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  color: var(--color-text-tertiary);
  font-size: 14px;
  pointer-events: none;
}

.canvas-container.has-signature .placeholder {
  display: none;
}

.signature-actions {
  display: flex;
  justify-content: flex-end;
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) var(--ease-out);
}

.clear-btn:hover:not(:disabled) {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
