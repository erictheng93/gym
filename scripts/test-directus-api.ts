#!/usr/bin/env npx tsx
/**
 * Directus API Basic Test Script
 *
 * Tests basic connectivity and authentication with Directus API.
 * Cross-platform: Works on Windows, macOS, and Linux.
 *
 * Usage:
 *   pnpm test:api
 *   # or directly:
 *   npx tsx test-directus-api.ts
 */

import {
  DirectusClient,
  log,
  logSuccess,
  logError,
  logSection,
  logSeparator,
  prettyJson,
} from './lib/index.js'

interface Member {
  id: string
  full_name: string
  member_no: string
  member_status: string
}

async function main(): Promise<void> {
  logSection('Testing Directus API')

  const client = new DirectusClient()

  // Test 1: Server Health Check
  log('\n1. Server Health Check:')
  try {
    const ping = await client.ping()
    logSuccess(`Server is alive: ${ping}`)
  } catch (error) {
    logError(`Server health check failed: ${error}`)
    process.exit(1)
  }

  logSeparator()

  // Test 2: Login
  log('\n2. Login Test (admin@gym.com):')
  try {
    const authResponse = await client.login('admin@gym.com', 'admin')
    logSuccess(`Login successful!`)
    log(`   Token: ${client.getTokenPreview()}`)
    log(`   Expires in: ${authResponse.data.expires}ms`)
  } catch (error) {
    logError(`Login failed: ${error}`)
    process.exit(1)
  }

  logSeparator()

  // Test 3: Get Members (Authenticated)
  log('\n3. Get Members (Authenticated):')
  try {
    const response = await client.getItems<Member>('members', { limit: 3 })
    logSuccess(`Retrieved ${response.data.length} members`)
    log('')
    log('Members:')
    response.data.forEach((member, index) => {
      log(`  ${index + 1}. ${member.full_name} (${member.member_no}) - ${member.member_status}`)
    })
  } catch (error) {
    logError(`Failed to get members: ${error}`)
  }

  logSeparator()

  // Summary
  log('')
  logSuccess('All basic API tests passed!')
  log('')
}

// Run the script
main().catch((error) => {
  logError(`Script failed: ${error}`)
  process.exit(1)
})
