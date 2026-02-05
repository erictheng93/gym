<script setup lang="ts">
// Initialize theme on client side
if (import.meta.client) {
  const { initTheme } = useTheme()
  initTheme()
}

// Get branding configuration
const { fullBrandName } = useBranding('member')

// Launch screen state - starts visible, fades out when app is ready
const isAppReady = ref(false)

onMounted(() => {
  // Minimum display time to prevent jarring flash on fast loads
  const minDisplayTime = 400

  setTimeout(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        isAppReady.value = true
      }, { timeout: 200 })
    } else {
      isAppReady.value = true
    }
  }, minDisplayTime)
})
</script>

<template>
  <!-- Apple-style Launch Screen -->
  <div id="launch-screen" :class="{ hide: isAppReady }">
    <div class="logo">
      <div class="logo-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M16 12h-4v5" />
          <path d="M12 7v5" />
        </svg>
      </div>
      <span class="logo-text">{{ fullBrandName }}</span>
    </div>
    <div class="loading-dots">
      <span />
      <span />
      <span />
    </div>
  </div>

  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
