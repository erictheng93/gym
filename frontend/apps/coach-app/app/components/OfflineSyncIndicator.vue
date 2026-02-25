<script setup lang="ts">
/**
 * OfflineSyncIndicator Component
 * Shows the current offline sync status and pending requests
 * Styled with Apple glassmorphism to match coach-app design
 */
const {
  isOnline,
  isSyncing,
  pendingCount,
  hasPendingRequests,
  syncStatusLabel,
  syncPendingRequests,
  getPendingRequests,
  setupListeners,
} = useOfflineSync()

const toast = useToast()
const showDetails = ref(false)
const pendingItems = ref<Array<{ id: string; description?: string; type: string; timestamp: number }>>([])

// Initialize listeners on mount
onMounted(() => {
  setupListeners()
})

// Load pending items when details panel opens
watch(showDetails, async (open) => {
  if (open) {
    try {
      const requests = await getPendingRequests()
      pendingItems.value = requests.map(r => ({
        id: r.id,
        description: r.description,
        type: r.type,
        timestamp: r.timestamp,
      }))
    } catch {
      pendingItems.value = []
    }
  }
})

// Manual sync trigger
const handleManualSync = async () => {
  if (!isOnline.value || isSyncing.value) return

  const result = await syncPendingRequests()

  if (result.synced > 0) {
    toast.success(`已同步 ${result.synced} 項操作`)
  }
  if (result.failed > 0) {
    toast.error(`${result.failed} 項同步失敗`)
  }

  // Refresh pending items
  try {
    const requests = await getPendingRequests()
    pendingItems.value = requests.map(r => ({
      id: r.id,
      description: r.description,
      type: r.type,
      timestamp: r.timestamp,
    }))
  } catch {
    pendingItems.value = []
  }
}

// Status color
const statusColor = computed(() => {
  if (!isOnline.value) return 'offline'
  if (isSyncing.value) return 'syncing'
  if (hasPendingRequests.value) return 'pending'
  return 'synced'
})

// Format timestamp for display
const formatTime = (ts: number) => {
  const date = new Date(ts)
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="!isOnline || hasPendingRequests"
      class="sync-indicator"
      :class="statusColor"
      role="status"
      :aria-label="syncStatusLabel"
    >
      <button
        class="sync-button"
        type="button"
        @click="showDetails = !showDetails"
      >
        <!-- Status Icon -->
        <span class="status-icon">
          <!-- Offline Icon -->
          <svg v-if="!isOnline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55" />
            <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88" />
            <path d="M8.53 16.11a6 6 0 016.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <!-- Syncing Icon -->
          <svg v-else-if="isSyncing" class="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          <!-- Pending Icon -->
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </span>

        <!-- Status Text -->
        <span class="status-text">{{ syncStatusLabel }}</span>

        <!-- Expand Icon -->
        <svg
          class="expand-icon"
          :class="{ expanded: showDetails }"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- Details Panel -->
      <Transition name="expand">
        <div v-if="showDetails" class="details-panel">
          <div class="details-content">
            <p v-if="!isOnline" class="detail-message">
              目前處於離線模式，您的操作會在恢復連線後自動同步。
            </p>
            <p v-else-if="hasPendingRequests" class="detail-message">
              有 {{ pendingCount }} 項操作等待同步。
            </p>

            <!-- Pending items list -->
            <div v-if="pendingItems.length > 0" class="pending-list">
              <div
                v-for="item in pendingItems"
                :key="item.id"
                class="pending-item"
              >
                <span class="pending-item-desc">{{ item.description || item.type }}</span>
                <span class="pending-item-time">{{ formatTime(item.timestamp) }}</span>
              </div>
            </div>

            <button
              v-if="isOnline && hasPendingRequests && !isSyncing"
              class="sync-now-btn"
              type="button"
              @click="handleManualSync"
            >
              立即同步
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.sync-indicator {
  position: fixed;
  bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  border-radius: 16px;
  overflow: hidden;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.sync-indicator.offline {
  border: 0.5px solid var(--apple-red, #ff3b30);
  background: color-mix(in srgb, var(--apple-red, #ff3b30) 8%, var(--glass-bg, rgba(255, 255, 255, 0.72)));
}

.sync-indicator.syncing {
  border: 0.5px solid var(--apple-blue, #007aff);
  background: color-mix(in srgb, var(--apple-blue, #007aff) 8%, var(--glass-bg, rgba(255, 255, 255, 0.72)));
}

.sync-indicator.pending {
  border: 0.5px solid var(--apple-orange, #ff9500);
  background: color-mix(in srgb, var(--apple-orange, #ff9500) 8%, var(--glass-bg, rgba(255, 255, 255, 0.72)));
}

.sync-indicator.synced {
  border: 0.5px solid var(--apple-green, #34c759);
  background: color-mix(in srgb, var(--apple-green, #34c759) 8%, var(--glass-bg, rgba(255, 255, 255, 0.72)));
}

.sync-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
}

.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.offline .status-icon {
  color: var(--apple-red, #ff3b30);
}

.syncing .status-icon {
  color: var(--apple-blue, #007aff);
}

.pending .status-icon {
  color: var(--apple-orange, #ff9500);
}

.synced .status-icon {
  color: var(--apple-green, #34c759);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-text {
  font-size: 13px;
  font-weight: 500;
}

.offline .status-text {
  color: var(--apple-red, #ff3b30);
}

.syncing .status-text {
  color: var(--apple-blue, #007aff);
}

.pending .status-text {
  color: var(--apple-orange, #ff9500);
}

.synced .status-text {
  color: var(--apple-green, #34c759);
}

.expand-icon {
  color: var(--text-tertiary, #8e8e93);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.details-panel {
  border-top: 0.5px solid var(--glass-border, rgba(0, 0, 0, 0.1));
  overflow: hidden;
}

.details-content {
  padding: 12px 16px;
}

.detail-message {
  font-size: 12px;
  color: var(--text-secondary, #8e8e93);
  margin: 0 0 12px;
  line-height: 1.5;
}

.pending-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.pending-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 4px 0;
}

.pending-item-desc {
  color: var(--text-primary, #000);
  font-weight: 500;
}

.pending-item-time {
  color: var(--text-tertiary, #8e8e93);
  font-size: 11px;
}

.sync-now-btn {
  width: 100%;
  padding: 10px;
  background-color: var(--apple-blue, #007aff);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.sync-now-btn:active {
  opacity: 0.85;
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 200px;
}
</style>
