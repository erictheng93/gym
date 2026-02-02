/**
 * Session Storage Utilities
 * Provides localStorage backup for session data to survive page refresh
 */

const SESSION_STORAGE_KEY = 'gym-nexus-session'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface User {
  id: string
  email: string
  role: string
  employeeId: string | null
  tenantId: string | null
  first_name?: string | null
  last_name?: string | null
}

interface CurrentEmployee {
  id: string
  full_name: string
  employee_code: string | null
  branch_id: string | null
  branch_name: string | null
  job_title_id: string | null
  job_title_name: string | null
}

export interface SessionData {
  user: User
  employee: CurrentEmployee | null
  timestamp: number
}

/**
 * Check if a session timestamp is still valid (within TTL)
 */
export function isSessionValid(timestamp: number): boolean {
  const now = Date.now()
  return now - timestamp < SESSION_TTL_MS
}

/**
 * Save session data to localStorage
 */
export function saveSession(user: User, employee: CurrentEmployee | null): void {
  if (typeof window === 'undefined') return

  try {
    const sessionData: SessionData = {
      user,
      employee,
      timestamp: Date.now(),
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData))
  } catch (error) {
    console.warn('[SessionStorage] Failed to save session:', error)
  }
}

/**
 * Load session data from localStorage
 * Returns null if no valid session exists
 */
export function loadSession(): SessionData | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!stored) return null

    const sessionData: SessionData = JSON.parse(stored)

    // Validate session structure
    if (!sessionData.user || !sessionData.timestamp) {
      clearSession()
      return null
    }

    // Check if session is still valid
    if (!isSessionValid(sessionData.timestamp)) {
      clearSession()
      return null
    }

    return sessionData
  } catch (error) {
    console.warn('[SessionStorage] Failed to load session:', error)
    clearSession()
    return null
  }
}

/**
 * Clear session data from localStorage
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch (error) {
    console.warn('[SessionStorage] Failed to clear session:', error)
  }
}

/**
 * Update only the employee portion of the session
 */
export function updateSessionEmployee(employee: CurrentEmployee | null): void {
  if (typeof window === 'undefined') return

  const session = loadSession()
  if (session) {
    saveSession(session.user, employee)
  }
}

/**
 * Get remaining session TTL in milliseconds
 */
export function getSessionRemainingTTL(): number {
  const session = loadSession()
  if (!session) return 0

  const elapsed = Date.now() - session.timestamp
  const remaining = SESSION_TTL_MS - elapsed
  return remaining > 0 ? remaining : 0
}
