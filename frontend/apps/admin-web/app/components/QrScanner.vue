<script setup lang="ts">
/**
 * QR Code Scanner Component
 * Uses jsQR library for browser-based QR code scanning
 */

const emit = defineEmits<{
  (e: 'scan', payload: string): void
  (e: 'error', error: Error): void
  (e: 'close'): void
}>()

const props = defineProps<{
  autoStart?: boolean
}>()

const videoRef = ref<HTMLVideoElement>()
const isScanning = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const devices = ref<MediaDeviceInfo[]>([])
const selectedDeviceId = ref('')
let mediaStream: MediaStream | null = null

// Initialize scanner
const initScanner = async () => {
  isLoading.value = true
  errorMessage.value = ''

  try {
    // Get available video devices
    const allDevices = await navigator.mediaDevices.enumerateDevices()
    devices.value = allDevices.filter(d => d.kind === 'videoinput')

    // Prefer back camera
    const backCamera = devices.value.find(d =>
      d.label.toLowerCase().includes('back') ||
      d.label.toLowerCase().includes('rear') ||
      d.label.toLowerCase().includes('environment')
    )

    selectedDeviceId.value = backCamera?.deviceId || devices.value[0]?.deviceId || ''

    if (!selectedDeviceId.value) {
      throw new Error('No camera found')
    }
  } catch (err) {
    console.error('Failed to initialize scanner:', err)
    errorMessage.value = '無法存取相機，請確認已授權相機權限'
    emit('error', err instanceof Error ? err : new Error('Camera access denied'))
  } finally {
    isLoading.value = false
  }
}

// Start scanning
const startScanning = async () => {
  if (!videoRef.value || !selectedDeviceId.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    // Request camera access
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: selectedDeviceId.value ? { exact: selectedDeviceId.value } : undefined,
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })

    // Set video source
    videoRef.value.srcObject = mediaStream
    await videoRef.value.play()

    isScanning.value = true

    // Start scanning loop
    scanLoop()
  } catch (err) {
    console.error('Failed to start scanning:', err)
    errorMessage.value = '無法啟動相機'
    emit('error', err instanceof Error ? err : new Error('Camera start failed'))
  } finally {
    isLoading.value = false
  }
}

// Scan loop using canvas
const scanLoop = async () => {
  if (!isScanning.value || !videoRef.value) return

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) return

    canvas.width = videoRef.value.videoWidth
    canvas.height = videoRef.value.videoHeight

    ctx.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height)

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Try to detect QR code using jsQR
    const jsQR = (await import('jsqr')).default
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    })

    if (code) {
      // QR code found!
      stopScanning()
      emit('scan', code.data)
      return
    }
  } catch (err) {
    console.error('Scan error:', err)
  }

  // Continue scanning
  if (isScanning.value) {
    requestAnimationFrame(scanLoop)
  }
}

// Stop scanning
const stopScanning = () => {
  isScanning.value = false

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop())
    mediaStream = null
  }

  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

// Switch camera
const switchCamera = async () => {
  const currentIndex = devices.value.findIndex(d => d.deviceId === selectedDeviceId.value)
  const nextIndex = (currentIndex + 1) % devices.value.length
  selectedDeviceId.value = devices.value[nextIndex]?.deviceId || ''

  if (isScanning.value) {
    stopScanning()
    await startScanning()
  }
}

// Close scanner
const close = () => {
  stopScanning()
  emit('close')
}

// Auto-start if prop is set
onMounted(async () => {
  await initScanner()
  if (props.autoStart && selectedDeviceId.value) {
    await startScanning()
  }
})

onUnmounted(() => {
  stopScanning()
})
</script>

<template>
  <div class="qr-scanner">
    <!-- Loading state -->
    <div v-if="isLoading" class="scanner-loading">
      <div class="spinner"></div>
      <p>正在啟動相機...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="errorMessage" class="scanner-error">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p>{{ errorMessage }}</p>
      <button class="btn-retry" @click="initScanner">重試</button>
    </div>

    <!-- Scanner view -->
    <template v-else>
      <div class="scanner-view">
        <video
          ref="videoRef"
          class="scanner-video"
          autoplay
          playsinline
          muted
        ></video>

        <!-- Scan overlay -->
        <div class="scan-overlay">
          <div class="scan-frame">
            <div class="corner top-left"></div>
            <div class="corner top-right"></div>
            <div class="corner bottom-left"></div>
            <div class="corner bottom-right"></div>
            <div v-if="isScanning" class="scan-line"></div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="scanner-controls">
        <button v-if="!isScanning" class="btn-start" @click="startScanning">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          開始掃描
        </button>

        <template v-else>
          <button class="btn-control" @click="stopScanning">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
            停止
          </button>

          <button v-if="devices.length > 1" class="btn-control" @click="switchCamera">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
              <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
              <circle cx="12" cy="12" r="3" />
              <path d="m18 22-3-3 3-3" />
              <path d="m6 2 3 3-3 3" />
            </svg>
            切換
          </button>
        </template>

        <button class="btn-close" @click="close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          關閉
        </button>
      </div>

      <p class="scanner-hint">
        將 QR Code 放入框內掃描
      </p>
    </template>
  </div>
</template>

<style scoped>
.qr-scanner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.scanner-loading,
.scanner-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-2xl);
  text-align: center;
  color: var(--color-text-secondary);
}

.scanner-error svg {
  color: var(--color-error);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-retry {
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-retry:hover {
  background: #005bb5;
}

.scanner-view {
  position: relative;
  width: 100%;
  max-width: 400px;
  aspect-ratio: 1;
  background: #000;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.scanner-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scan-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.scan-frame {
  position: relative;
  width: 240px;
  height: 240px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-lg);
}

.corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-success);
}

.corner.top-left {
  top: -2px;
  left: -2px;
  border-right: none;
  border-bottom: none;
  border-top-left-radius: var(--radius-md);
}

.corner.top-right {
  top: -2px;
  right: -2px;
  border-left: none;
  border-bottom: none;
  border-top-right-radius: var(--radius-md);
}

.corner.bottom-left {
  bottom: -2px;
  left: -2px;
  border-right: none;
  border-top: none;
  border-bottom-left-radius: var(--radius-md);
}

.corner.bottom-right {
  bottom: -2px;
  right: -2px;
  border-left: none;
  border-top: none;
  border-bottom-right-radius: var(--radius-md);
}

.scan-line {
  position: absolute;
  left: 10%;
  right: 10%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-success), transparent);
  animation: scanLine 2s ease-in-out infinite;
}

@keyframes scanLine {
  0%, 100% { top: 10%; }
  50% { top: 85%; }
}

.scanner-controls {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
  justify-content: center;
}

.btn-start {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-xl);
  background: var(--color-success);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-start:hover {
  background: #2ecc71;
  transform: scale(1.02);
}

.btn-control {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-control:hover {
  background: var(--color-bg-tertiary);
}

.btn-close {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.scanner-hint {
  font-size: 14px;
  color: var(--color-text-tertiary);
  text-align: center;
}
</style>
