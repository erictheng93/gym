<template>
  <div class="login-page">
    <!-- Background Elements (Coordinated with Admin/Member) -->
    <div class="bg-decoration">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="bg-pattern"></div>
    </div>

    <!-- Theme Toggle (Bridged from Admin) -->
    <button 
      class="theme-toggle" 
      aria-label="Toggle Dark Mode"
      @click="toggleDark"
    >
      <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>

    <div class="login-container">
      <!-- Logo Header -->
      <header class="login-header">
        <div class="logo-mark">
          <svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <h1 class="app-title">GymNexus</h1>
        <div class="badge-container">
          <span class="role-badge">教練端 COACH</span>
        </div>
      </header>

      <!-- Main Login Card (Glassmorphism) -->
      <main class="login-card" :class="{ 'shake': isShaking }">
        <div class="card-header">
          <h2>歡迎回來</h2>
          <p>請登入您的教練帳號以管理課程</p>
        </div>

        <form class="login-form" @submit.prevent="handleLogin">
          <!-- Account Field -->
          <div class="input-group">
            <label for="identifier">帳號</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </span>
              <input
                id="identifier"
                v-model="identifier"
                type="text"
                required
                placeholder="員工編號或電子郵件"
                autocomplete="username"
              />
            </div>
          </div>

          <!-- Password Field -->
          <div class="input-group">
            <div class="label-row">
              <label for="password">密碼</label>
              <a href="#" class="forgot-link">忘記密碼？</a>
            </div>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </span>
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                placeholder="請輸入您的密碼"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="password-toggle"
                @click="showPassword = !showPassword"
              >
                <svg v-if="showPassword" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>

          <!-- Error Alert -->
          <Transition name="fade-scale">
            <div v-if="error" class="error-alert">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{{ error }}</span>
            </div>
          </Transition>

          <!-- Submit Button -->
          <button
            type="submit"
            class="submit-btn"
            :disabled="isLoading || !identifier || !password"
          >
            <span v-if="isLoading" class="spinner"></span>
            <span>{{ isLoading ? '驗證中...' : '登入系統' }}</span>
          </button>
        </form>
      </main>

      <!-- Footer Help -->
      <footer class="login-footer">
        <p>遇到問題？ <a href="#">聯繫系統管理員</a></p>
        <p class="copyright">© {{ new Date().getFullYear() }} GymNexus. All rights reserved.</p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
})

const router = useRouter()
const { login, isLoading, isAuthenticated } = useCoachAuth()

const identifier = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const isDark = ref(false)
const isShaking = ref(false)

// Redirect if already authenticated
onMounted(async () => {
  if (isAuthenticated.value) {
    await router.push('/')
  }
  
  // Theme initialization (default to dark)
  const savedTheme = localStorage.getItem('theme')

  if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark')
    isDark.value = false
  } else {
    // Default to dark mode
    document.documentElement.classList.add('dark')
    isDark.value = true
  }
})

const toggleDark = () => {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.documentElement.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  } else {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  }
}

const triggerShake = () => {
  isShaking.value = true
  setTimeout(() => { isShaking.value = false }, 500)
}

const handleLogin = async () => {
  error.value = ''

  const result = await login(identifier.value.trim(), password.value.trim())

  if (result.success) {
    await router.push('/')
  } else {
    error.value = result.message || '登入失敗，請檢查帳號密碼'
    triggerShake()
  }
}
</script>

<style scoped>
/* ============================================
   COACH APP - PROFESSIONAL ATHLETIC DESIGN
   ============================================ */

.login-page {
  --blue-primary: #0071e3;
  --blue-cyan: #00c7be;
  --bg-light: #f5f5f7;
  --bg-dark: #000000;
  --card-light: rgba(255, 255, 255, 0.8);
  --card-dark: rgba(28, 28, 30, 0.8);
  --text-light: #1d1d1f;
  --text-dark: #f5f5f7;
  --border-light: rgba(0, 0, 0, 0.1);
  --border-dark: rgba(255, 255, 255, 0.1);
  
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: var(--bg-light);
  position: relative;
  overflow: hidden;
  transition: background-color 0.5s ease;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
}

.dark .login-page {
  background-color: var(--bg-dark);
}

/* Background Decoration (Bridged from Admin) */
.bg-decoration {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  animation: float 20s ease-in-out infinite;
}

.orb-1 {
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, var(--blue-primary) 0%, var(--blue-cyan) 100%);
  top: -100px;
  right: -100px;
}

.orb-2 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #5856d6 0%, #af52de 100%);
  bottom: -100px;
  left: -100px;
  animation-delay: -5s;
}

.bg-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--border-light) 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.3;
}

.dark .bg-pattern {
  background-image: radial-gradient(var(--border-dark) 1px, transparent 1px);
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
}

/* Theme Toggle */
.theme-toggle {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 100;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: var(--card-light);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  color: var(--text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.dark .theme-toggle {
  background: var(--card-dark);
  border-color: var(--border-dark);
  color: var(--text-dark);
}

.theme-toggle:hover {
  transform: scale(1.05);
  background: white;
}

.dark .theme-toggle:hover {
  background: #2c2c2e;
}

/* Login Container */
.login-container {
  width: 100%;
  max-width: 400px;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 32px;
  animation: cardAppear 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardAppear {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Header */
.login-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo-mark {
  filter: drop-shadow(0 8px 16px rgba(0, 113, 227, 0.2));
}

.app-title {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-light);
  margin: 0;
}

.dark .app-title {
  color: var(--text-dark);
}

.role-badge {
  display: inline-block;
  padding: 4px 12px;
  background: linear-gradient(135deg, var(--blue-primary) 0%, var(--blue-cyan) 100%);
  color: white;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.2);
}

/* Login Card */
.login-card {
  background: var(--card-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.dark .login-card {
  background: var(--card-dark);
  border-color: var(--border-dark);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.card-header {
  margin-bottom: 32px;
  text-align: center;
}

.card-header h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-light);
  margin: 0 0 8px 0;
}

.dark .card-header h2 {
  color: var(--text-dark);
}

.card-header p {
  font-size: 15px;
  color: #86868b;
  margin: 0;
}

/* Form Styles */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-light);
}

.dark .input-group label {
  color: var(--text-dark);
}

.forgot-link {
  font-size: 13px;
  color: var(--blue-primary);
  text-decoration: none;
  font-weight: 500;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: #86868b;
  pointer-events: none;
}

.input-wrapper input {
  width: 100%;
  height: 52px;
  padding: 0 16px 0 44px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid transparent;
  border-radius: 12px;
  font-size: 16px;
  color: var(--text-light);
  transition: all 0.2s ease;
  outline: none;
}

.dark .input-wrapper input {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-dark);
}

.input-wrapper input:focus {
  background: white;
  border-color: var(--blue-primary);
  box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.1);
}

.dark .input-wrapper input:focus {
  background: #2c2c2e;
  box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.2);
}

.password-toggle {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: #86868b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

/* Submit Button */
.submit-btn {
  height: 52px;
  background: linear-gradient(135deg, var(--blue-primary) 0%, var(--blue-cyan) 100%);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 8px 20px rgba(0, 113, 227, 0.2);
  margin-top: 8px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(0, 113, 227, 0.3);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error Alert */
.error-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255, 69, 58, 0.1);
  border-radius: 10px;
  color: #ff453a;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid rgba(255, 69, 58, 0.2);
}

.shake {
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}

/* Footer */
.login-footer {
  text-align: center;
}

.login-footer p {
  font-size: 14px;
  color: #86868b;
  margin: 0;
}

.login-footer a {
  color: var(--blue-primary);
  text-decoration: none;
  font-weight: 500;
}

.copyright {
  margin-top: 12px !important;
  font-size: 12px !important;
  opacity: 0.6;
}

/* Transitions */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Responsive (RWD) */
@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px;
    border-radius: 20px;
  }
  
  .app-title {
    font-size: 28px;
  }
  
  .login-container {
    gap: 24px;
  }
}
</style>
