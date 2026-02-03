<script setup lang="ts">
import {
  APP_NAME,
  APP_COPYRIGHT_YEAR,
  STORAGE_KEYS,
  TIMING,
  MESSAGES
} from '~/constants'

definePageMeta({
  layout: false
})

const { login, isLoading, isAuthenticated } = useAuth()

const form = reactive({
  email: '',
  password: ''
})
const error = ref('')
const isShaking = ref(false)
const isDark = ref(false)
const mounted = ref(false)

onMounted(async () => {
  mounted.value = true

  // Check if already authenticated and redirect
  if (isAuthenticated.value) {
    await navigateTo('/')
    return
  }

  // Check and apply theme (default to dark)
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME)
  if (savedTheme === 'light') {
    isDark.value = false
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    // Default to dark mode
    isDark.value = true
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})

const toggleTheme = () => {
  isDark.value = !isDark.value
  const theme = isDark.value ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEYS.THEME, theme)
}

const handleSubmit = async () => {
  error.value = ''

  if (!form.email || !form.password) {
    error.value = MESSAGES.AUTH.REQUIRED_FIELDS
    triggerShake()
    return
  }

  try {
    const result = await login(form.email, form.password)

    if (result.success) {
      await navigateTo('/', { replace: true })
    } else {
      error.value = result.error || MESSAGES.AUTH.LOGIN_ERROR
      triggerShake()
    }
  } catch (err) {
    console.error('Login error:', err)
    useToast().error(MESSAGES.AUTH.LOGIN_ERROR)
    error.value = MESSAGES.AUTH.LOGIN_ERROR
    triggerShake()
  }
}

const triggerShake = () => {
  isShaking.value = true
  setTimeout(() => { isShaking.value = false }, TIMING.SHAKE_DURATION)
}
</script>

<template>
  <div class="login-page">
    <!-- Animated Background -->
    <div class="login-bg">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="gradient-orb orb-3"></div>
    </div>

    <!-- Theme Toggle -->
    <ClientOnly>
      <button class="theme-toggle" :aria-label="MESSAGES.A11Y.TOGGLE_THEME" @click="toggleTheme">
        <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </button>
    </ClientOnly>

    <!-- Login Card -->
    <div class="login-container">
      <div class="login-card glass-card" :class="{ 'shake': isShaking }">
        <!-- Logo & Header -->
        <div class="login-header">
          <div class="logo-mark">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="12" fill="url(#logo-gradient)" />
              <path d="M14 24h6v-8h8v8h6v4h-6v8h-8v-8h-6v-4z" fill="white" />
              <defs>
                <linearGradient id="logo-gradient" x1="0" y1="0" x2="48" y2="48">
                  <stop stop-color="#0071e3" />
                  <stop offset="1" stop-color="#00c7be" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 class="login-title">{{ APP_NAME }}</h1>
          <p class="login-subtitle">{{ MESSAGES.AUTH.LOGIN_SUBTITLE }}</p>
        </div>

        <!-- Error Message -->
        <Transition name="fade-scale">
          <div v-if="error" class="error-banner">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
            </svg>
            <span>{{ error }}</span>
          </div>
        </Transition>

        <!-- Form -->
        <form class="login-form" @submit.prevent="handleSubmit">
          <div class="input-group">
            <label for="email" class="input-label">{{ MESSAGES.FORM.EMAIL }}</label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              class="input"
              :placeholder="MESSAGES.FORM.EMAIL_PLACEHOLDER"
            />
          </div>

          <div class="input-group">
            <label for="password" class="input-label">{{ MESSAGES.FORM.PASSWORD }}</label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              class="input"
              :placeholder="MESSAGES.FORM.PASSWORD_PLACEHOLDER"
            />
          </div>

          <button type="submit" class="btn btn-primary btn-large w-full" :disabled="isLoading">
            <span v-show="isLoading" class="loading-spinner"></span>
            <span>{{ isLoading ? MESSAGES.AUTH.LOGGING_IN : MESSAGES.AUTH.LOGIN }}</span>
          </button>
        </form>
      </div>

      <!-- Copyright -->
      <p class="copyright text-caption text-tertiary">
        © {{ APP_COPYRIGHT_YEAR }} {{ APP_NAME }}. All rights reserved.
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: var(--color-bg-secondary);
}

/* Animated Background */
.login-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
  animation: float 20s ease-in-out infinite;
}

[data-theme="dark"] .gradient-orb {
  opacity: 0.3;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: linear-gradient(135deg, #0071e3 0%, #00c7be 100%);
  top: -200px;
  right: -100px;
  animation-delay: 0s;
}

.orb-2 {
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, #5856d6 0%, #af52de 100%);
  bottom: -150px;
  left: -100px;
  animation-delay: -7s;
}

.orb-3 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #ff9f0a 0%, #ff375f 100%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -14s;
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(30px, -30px) scale(1.05);
  }
  50% {
    transform: translate(-20px, 20px) scale(0.95);
  }
  75% {
    transform: translate(-30px, -20px) scale(1.02);
  }
}

.orb-3 {
  animation-name: float-center;
}

@keyframes float-center {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
  }
  25% {
    transform: translate(-45%, -55%) scale(1.05);
  }
  50% {
    transform: translate(-55%, -45%) scale(0.95);
  }
  75% {
    transform: translate(-48%, -52%) scale(1.02);
  }
}

/* Theme Toggle */
.theme-toggle {
  position: fixed;
  top: var(--space-lg);
  right: var(--space-lg);
  z-index: 100;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-glass));
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out),
              background var(--duration-fast) var(--ease-out);
}

.theme-toggle:hover {
  background: var(--color-bg-elevated);
  transform: scale(1.05);
}

.theme-toggle:active {
  transform: scale(0.95);
}

/* Login Container */
.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
}

/* Login Card */
.login-card {
  width: 100%;
  padding: var(--space-2xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.login-card.shake {
  animation: shake 0.5s var(--ease-out);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}

/* Header */
.login-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
}

.logo-mark {
  animation: logoAppear 0.8s var(--ease-out) backwards;
  animation-delay: 0.1s;
}

@keyframes logoAppear {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }
}

.login-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, var(--color-text-primary) 0%, var(--color-text-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: titleAppear 0.8s var(--ease-out) backwards;
  animation-delay: 0.2s;
}

@keyframes titleAppear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.login-subtitle {
  font-size: 17px;
  color: var(--color-text-secondary);
  animation: subtitleAppear 0.8s var(--ease-out) backwards;
  animation-delay: 0.3s;
}

@keyframes subtitleAppear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

/* Error Banner */
.error-banner {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.2);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 15px;
}

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  animation: formAppear 0.8s var(--ease-out) backwards;
  animation-delay: 0.4s;
}

@keyframes formAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

.login-form .input-group {
  animation: inputAppear 0.6s var(--ease-out) backwards;
}

.login-form .input-group:nth-child(1) { animation-delay: 0.5s; }
.login-form .input-group:nth-child(2) { animation-delay: 0.6s; }

@keyframes inputAppear {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
}

/* Loading Spinner */
.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Footer */
.login-footer {
  text-align: center;
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-divider);
  animation: footerAppear 0.8s var(--ease-out) backwards;
  animation-delay: 0.7s;
}

@keyframes footerAppear {
  from {
    opacity: 0;
  }
}

.copyright {
  animation: copyrightAppear 0.8s var(--ease-out) backwards;
  animation-delay: 0.8s;
}

@keyframes copyrightAppear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

/* Transitions */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.3s var(--ease-out), transform 0.3s var(--ease-out);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
