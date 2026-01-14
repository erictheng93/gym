<script setup lang="ts">
/**
 * OfflineSyncIndicator Component
 * Shows the current offline sync status and pending requests
 */
const {
  isOnline,
  isSyncing,
  pendingCount,
  hasPendingRequests,
  syncStatusLabel,
  syncPendingRequests,
  setupListeners,
} = useOfflineSync()

const toast = useToast()
const showDetails = ref(false)

// Initialize listeners on mount
onMounted(() => {
  setupListeners()
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
}

// Status color
const statusColor = computed(() => {
  if (!isOnline.value) return 'offline'
  if (isSyncing.value) return 'syncing'
  if (hasPendingRequests.value) return 'pending'
  return 'synced'
})
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.sync-indicator.offline {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
}

.sync-indicator.syncing {
  background-color: #eff6ff;
  border: 1px solid #bfdbfe;
}

.sync-indicator.pending {
  background-color: #fffbeb;
  border: 1px solid #fde68a;
}

.sync-indicator.synced {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
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
  color: #ef4444;
}

.syncing .status-icon {
  color: #3b82f6;
}

.pending .status-icon {
  color: #f59e0b;
}

.synced .status-icon {
  color: #10b981;
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
  color: #b91c1c;
}

.syncing .status-text {
  color: #1d4ed8;
}

.pending .status-text {
  color: #b45309;
}

.synced .status-text {
  color: #047857;
}

.expand-icon {
  color: var(--color-text-secondary, #6b7280);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.details-panel {
  border-top: 1px solid var(--color-border, #e5e7eb);
  overflow: hidden;
}

.details-content {
  padding: 12px 16px;
}

.detail-message {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  margin: 0 0 12px;
  line-height: 1.5;
}

.sync-now-btn {
  width: 100%;
  padding: 10px;
  background-color: var(--color-primary, #10b981);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.sync-now-btn:active {
  opacity: 0.9;
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
  max-height: 150px;
}
</style>
