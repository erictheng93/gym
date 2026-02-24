// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue', '**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        // Nuxt 3 auto-imports
        definePageMeta: 'readonly',
        defineNuxtComponent: 'readonly',
        defineNuxtPlugin: 'readonly',
        defineNuxtRouteMiddleware: 'readonly',
        navigateTo: 'readonly',
        useFetch: 'readonly',
        useAsyncData: 'readonly',
        useRuntimeConfig: 'readonly',
        useCookie: 'readonly',
        useRoute: 'readonly',
        useRouter: 'readonly',
        useState: 'readonly',
        useHead: 'readonly',
        useSeoMeta: 'readonly',
        useError: 'readonly',
        createError: 'readonly',
        clearError: 'readonly',
        $fetch: 'readonly',
        // Vue 3 auto-imports
        ref: 'readonly',
        computed: 'readonly',
        reactive: 'readonly',
        watch: 'readonly',
        watchEffect: 'readonly',
        onMounted: 'readonly',
        onBeforeMount: 'readonly',
        onUnmounted: 'readonly',
        onBeforeUnmount: 'readonly',
        onUpdated: 'readonly',
        onBeforeUpdate: 'readonly',
        nextTick: 'readonly',
        toRef: 'readonly',
        toRefs: 'readonly',
        unref: 'readonly',
        isRef: 'readonly',
        // Node.js globals
        process: 'readonly',
        module: 'readonly',
        // Browser globals
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        TouchEvent: 'readonly',
        DragEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLVideoElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLInputElement: 'readonly',
        MediaStream: 'readonly',
        MediaDeviceInfo: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        Image: 'readonly',
        requestAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        // Custom composables (auto-imported from composables/)
        useToast: 'readonly',
        useAuth: 'readonly',
        useMemberAuth: 'readonly',
        useApiError: 'readonly',
        useFormValidation: 'readonly',
        useDebounce: 'readonly',
        usePagination: 'readonly',
        useTheme: 'readonly',
        useConfirm: 'readonly',
        useErrorHandler: 'readonly',
        usePushNotifications: 'readonly',
        useReviews: 'readonly',
        useSocialAuth: 'readonly',
        useClasses: 'readonly',
        useBookings: 'readonly',
        useNotificationPreferences: 'readonly',
        useBranches: 'readonly',
        useMembers: 'readonly',
        useEmployees: 'readonly',
        useCheckin: 'readonly',
        useAttendance: 'readonly',
        useClassBookings: 'readonly',
        useClassCategories: 'readonly',
        useClassSchedule: 'readonly',
        useContracts: 'readonly',
        usePayments: 'readonly',
        useJobTitles: 'readonly',
        useMembershipPlans: 'readonly',
        useLeaveRequests: 'readonly',
        useShiftSchedules: 'readonly',
        usePlans: 'readonly',
        useMakeupRequests: 'readonly',
        useReports: 'readonly',
        // Additional composables
        useCampaigns: 'readonly',
        useCharts: 'readonly',
        useCoachAuth: 'readonly',
        useCoachClasses: 'readonly',
        useCoupons: 'readonly',
        useDashboard: 'readonly',
        useFocusTrap: 'readonly',
        useGoals: 'readonly',
        useIssues: 'readonly',
        useLeads: 'readonly',
        useLessonPlans: 'readonly',
        useMeasurements: 'readonly',
        useOfflineSync: 'readonly',
        useSegmentation: 'readonly',
        useStudents: 'readonly',
        useTeachingMaterials: 'readonly',
        useTenant: 'readonly',
        useUsers: 'readonly',
        useWorkouts: 'readonly',
        useBranding: 'readonly',
        useHR: 'readonly',
        // Form validation helpers
        required: 'readonly',
        email: 'readonly',
        minLength: 'readonly',
        maxLength: 'readonly',
        positive: 'readonly',
        between: 'readonly',
        phone: 'readonly',
        phoneLength: 'readonly',
        dateNotFuture: 'readonly',
        arrayLength: 'readonly',
        // Utility functions (auto-imported from shared/)
        formatDate: 'readonly',
        formatCurrency: 'readonly',
        formatNumber: 'readonly',
        formatPhone: 'readonly',
        formatRelativeTime: 'readonly',
        // Constants
        MESSAGES: 'readonly',
        // TypeScript globals
        NodeJS: 'readonly'
      }
    }
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/dist/**',
      '**/.output/**',
      '**/coverage/**',
      '**/.pnpm-store/**'
    ]
  },
  // CommonJS files configuration
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'readonly'
      }
    }
  },
  // Script files configuration (.mjs and scripts/)
  {
    files: ['**/*.mjs', '**/scripts/**/*.ts', '**/scripts/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly'
      }
    }
  },
  {
    rules: {
      // Disable some rules that are too strict for this project
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/html-self-closing': 'off',
      'vue/require-default-prop': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/max-attributes-per-line': 'off'
    }
  }
)
