/**
 * Default Permissions Utility
 *
 * Provides fallback read-only permissions for users without employee records.
 * This allows basic navigation while providing clear feedback about limited access.
 */

interface EffectivePermissions {
  [module: string]: {
    [action: string]: boolean
  }
}

/**
 * Returns minimal read-only permissions for users without employee records.
 * Allows viewing dashboard and basic navigation but no data operations.
 */
export function getDefaultReadOnlyPermissions(): EffectivePermissions {
  return {
    // Allow basic dashboard access
    dashboard: {
      read: true,
      create: false,
      update: false,
      delete: false,
    },
    // All other modules are read-only at most, but we default to false
    // to ensure users understand they need an employee record
    members: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    contracts: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    payments: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    plans: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    employees: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    branches: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    checkin: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    hr: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    reports: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    settings: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
    classes: {
      read: false,
      create: false,
      update: false,
      delete: false,
    },
  }
}

/**
 * Creates empty permissions object (all denied)
 */
export function createEmptyPermissions(): EffectivePermissions {
  return {}
}
