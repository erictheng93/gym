<script setup lang="ts">
// Initialize theme on client side
if (import.meta.client) {
  useTheme()
}
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <!-- Global Components -->
  <ToastContainer />
  <ConfirmDialog />
</template>
