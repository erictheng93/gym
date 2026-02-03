<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
// Initialize theme on client side (default to dark)
onMounted(() => {
  const savedTheme = localStorage.getItem('theme')

  if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark')
  } else {
    // Default to dark mode
    document.documentElement.classList.add('dark')
  }
})
</script>

<style>
/* Global styles are imported via main.css */
</style>
