import { type Page, expect } from '@playwright/test'
import { TestEnv } from '../config/test-env'

export interface TestUser {
  email: string
  password: string
}

export const TEST_USERS = TestEnv.users

declare global {
  interface Window {
    useNuxtApp?: () => { isHydrating?: boolean }
  }
}

/**
 * Navigate and wait for Nuxt to finish hydrating (same check as @nuxt/test-utils'
 * waitForHydration). Before hydration the SSR markup is inert: text typed into a
 * v-model input is reset when Vue hydrates it, and clicks hit no handlers.
 * Use this instead of `page.goto` before interacting with a page.
 */
export async function goto(page: Page, path: string) {
  await page.goto(path)
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

async function submitLogin(page: Page, identifierSelector: string, user: TestUser) {
  await goto(page, '/login')
  await page.locator(identifierSelector).fill(user.email)
  await page.locator('#password').fill(user.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: TestEnv.timeouts.navigation })
}

/** admin-web staff login (Lucia session). */
export async function login(page: Page, user: TestUser = TEST_USERS.admin) {
  await submitLogin(page, '#email', user)
}

/** member-app login via the email/password tab (default tab). */
export async function loginAsMember(page: Page, user: TestUser = TEST_USERS.member) {
  await submitLogin(page, '#email', user)
}

/** coach-app login; the identifier field accepts email or employee code. */
export async function loginAsCoach(page: Page, user: TestUser = TEST_USERS.coach) {
  await submitLogin(page, '#identifier', user)
}
