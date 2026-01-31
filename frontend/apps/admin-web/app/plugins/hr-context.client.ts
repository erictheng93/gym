/**
 * HR Context Plugin - DEPRECATED
 *
 * This plugin has been deprecated as part of the Directus migration.
 * The HR composables (useAttendance, useLeaveRequests, useShiftSchedules, useMakeupRequests)
 * now use useFetch directly and no longer require this context provider.
 *
 * @deprecated HR adapters no longer needed - composables use useFetch directly
 */

export default defineNuxtPlugin({
  name: 'hr-context',
  async setup() {
    // No-op: HR functionality is now handled directly by composables using useFetch
    // See: ~/composables/hr/useAttendance.ts
    // See: ~/composables/hr/useLeaveRequests.ts
    // See: ~/composables/hr/useShiftSchedules.ts
    // See: ~/composables/hr/useMakeupRequests.ts
  }
})
