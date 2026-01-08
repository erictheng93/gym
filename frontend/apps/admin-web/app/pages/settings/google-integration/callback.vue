<template>
  <div class="callback-page">
    <div class="callback-content">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>正在處理驗證...</p>
      </div>

      <div v-else-if="error" class="error">
        <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h2>驗證失敗</h2>
        <p>{{ error }}</p>
        <button class="btn-close" @click="closeWindow">關閉視窗</button>
      </div>

      <div v-else class="success">
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <h2>驗證成功</h2>
        <p>視窗即將自動關閉...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const loading = ref(true)
const error = ref<string | null>(null)

onMounted(() => {
  try {
    // Parse the URL fragment (Google OAuth 2.0 uses fragment, not query params)
    const hash = window.location.hash.substring(1) // Remove the '#'
    const params = new URLSearchParams(hash)

    const accessToken = params.get('access_token')
    const tokenType = params.get('token_type')
    const expiresIn = params.get('expires_in')
    const scope = params.get('scope')
    const errorParam = params.get('error')

    if (errorParam) {
      error.value = `驗證錯誤: ${errorParam}`
      loading.value = false

      // Send error message to opener
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_AUTH_ERROR',
          error: errorParam
        }, window.location.origin)
      }

      // Close after 3 seconds
      setTimeout(() => {
        window.close()
      }, 3000)
      return
    }

    if (!accessToken) {
      error.value = '未收到授權令牌'
      loading.value = false

      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_AUTH_ERROR',
          error: '未收到授權令牌'
        }, window.location.origin)
      }

      setTimeout(() => {
        window.close()
      }, 3000)
      return
    }

    // Success - send token to opener window
    if (window.opener) {
      window.opener.postMessage({
        type: 'GOOGLE_AUTH_SUCCESS',
        access_token: accessToken,
        token_type: tokenType,
        expires_in: parseInt(expiresIn || '3600', 10),
        scope: scope
      }, window.location.origin)

      loading.value = false

      // Close window after 1 second
      setTimeout(() => {
        window.close()
      }, 1000)
    } else {
      error.value = '無法與父視窗通訊'
      loading.value = false
    }
  } catch (err: any) {
    error.value = err.message || '處理驗證時發生錯誤'
    loading.value = false

    if (window.opener) {
      window.opener.postMessage({
        type: 'GOOGLE_AUTH_ERROR',
        error: err.message
      }, window.location.origin)
    }

    setTimeout(() => {
      window.close()
    }, 3000)
  }
})

const closeWindow = () => {
  window.close()
}
</script>

<style scoped>
.callback-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.callback-content {
  background: white;
  border-radius: 1rem;
  padding: 3rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
  max-width: 400px;
  width: 90%;
}

.loading, .error, .success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.spinner {
  width: 3rem;
  height: 3rem;
  border: 4px solid #e0e0e0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading p {
  color: #666;
  font-size: 1rem;
  margin: 0;
}

.check-icon {
  width: 4rem;
  height: 4rem;
  stroke: #28a745;
  stroke-width: 2;
}

.error-icon {
  width: 4rem;
  height: 4rem;
  stroke: #dc3545;
  stroke-width: 2;
}

.success h2, .error h2 {
  margin: 0;
  font-size: 1.75rem;
  color: #333;
}

.success p, .error p {
  margin: 0;
  color: #666;
  font-size: 1rem;
  line-height: 1.6;
}

.btn-close {
  padding: 0.75rem 2rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
</style>
