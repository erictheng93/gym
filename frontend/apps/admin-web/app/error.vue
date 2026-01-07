<script setup lang="ts">
import { APP_NAME, MESSAGES } from '~/constants'

interface NuxtError {
  statusCode: number
  statusMessage?: string
  message?: string
  stack?: string
  url?: string
}

defineProps<{
  error: NuxtError
}>()

const handleError = () => clearError({ redirect: '/' })
const isDev = process.dev

// 根據錯誤代碼獲取顯示資訊
const getErrorInfo = (statusCode: number) => {
  switch (statusCode) {
    case 400:
      return {
        title: '請求錯誤',
        description: '您的請求包含無效的參數',
        icon: 'heroicons:exclamation-circle'
      }
    case 401:
      return {
        title: '未授權',
        description: MESSAGES.AUTH.SESSION_EXPIRED,
        icon: 'heroicons:lock-closed'
      }
    case 403:
      return {
        title: '存取被拒',
        description: MESSAGES.ERRORS.UNAUTHORIZED,
        icon: 'heroicons:shield-exclamation'
      }
    case 404:
      return {
        title: '找不到頁面',
        description: '您要找的頁面不存在或已被移動',
        icon: 'heroicons:document-magnifying-glass'
      }
    case 500:
      return {
        title: '伺服器錯誤',
        description: MESSAGES.ERRORS.SERVER,
        icon: 'heroicons:server'
      }
    case 502:
      return {
        title: '閘道錯誤',
        description: '伺服器暫時無法回應，請稍後再試',
        icon: 'heroicons:cloud'
      }
    case 503:
      return {
        title: '服務暫時不可用',
        description: '系統正在維護中，請稍後再試',
        icon: 'heroicons:wrench-screwdriver'
      }
    default:
      return {
        title: '發生錯誤',
        description: MESSAGES.ERRORS.GENERIC,
        icon: 'heroicons:exclamation-triangle'
      }
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
    <div class="max-w-md w-full text-center">
      <!-- 錯誤圖示 -->
      <div class="mb-8">
        <div
          class="mx-auto w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"
        >
          <Icon
            :name="getErrorInfo(error.statusCode).icon"
            class="w-12 h-12 text-red-600 dark:text-red-400"
          />
        </div>
      </div>

      <!-- 錯誤代碼 -->
      <h1 class="text-6xl font-bold text-gray-900 dark:text-white mb-4">
        {{ error.statusCode }}
      </h1>

      <!-- 錯誤標題 -->
      <h2 class="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
        {{ getErrorInfo(error.statusCode).title }}
      </h2>

      <!-- 錯誤描述 -->
      <p class="text-gray-600 dark:text-gray-400 mb-8">
        {{ getErrorInfo(error.statusCode).description }}
      </p>

      <!-- 詳細錯誤訊息（僅開發環境） -->
      <div
        v-if="error.message && isDev"
        class="mb-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-left"
      >
        <p class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all">
          {{ error.message }}
        </p>
        <p v-if="error.url" class="text-xs text-gray-500 dark:text-gray-500 mt-2">
          URL: {{ error.url }}
        </p>
      </div>

      <!-- 操作按鈕 -->
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          type="button"
          class="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          @click="handleError"
        >
          <Icon name="heroicons:home" class="w-5 h-5 mr-2" />
          返回首頁
        </button>

        <button
          type="button"
          class="inline-flex items-center justify-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-base font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          @click="$router.back()"
        >
          <Icon name="heroicons:arrow-left" class="w-5 h-5 mr-2" />
          返回上一頁
        </button>
      </div>

      <!-- 品牌標識 -->
      <div class="mt-12">
        <p class="text-sm text-gray-500 dark:text-gray-500">
          {{ APP_NAME }}
        </p>
      </div>
    </div>
  </div>
</template>
