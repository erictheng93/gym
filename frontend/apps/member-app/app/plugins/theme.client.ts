/**
 * Theme initialization plugin
 * Runs on client-side to apply saved theme preference
 */

export default defineNuxtPlugin(() => {
  const { initTheme } = useTheme()

  // Initialize theme on app mount
  initTheme()
})
