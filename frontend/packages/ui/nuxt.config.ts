// UI Package Nuxt Layer Configuration
export default defineNuxtConfig({
  // Auto-import components from this layer
  components: [
    {
      path: './components',
      pathPrefix: false,
      prefix: ''
    }
  ],

  // Auto-import composables
  imports: {
    dirs: ['./composables']
  }
})
