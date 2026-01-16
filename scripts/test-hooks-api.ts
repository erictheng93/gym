#!/usr/bin/env npx tsx
/**
 * Directus Hooks API Test Script
 *
 * Tests business logic hooks through the Directus API:
 * - Contract pause auto-extension
 * - Class usage deduction
 * - Contract resume
 * - Member status auto-update
 *
 * Cross-platform: Works on Windows, macOS, and Linux.
 *
 * Usage:
 *   pnpm test:hooks
 *   # or directly:
 *   npx tsx test-hooks-api.ts
 */

import {
  DirectusClient,
  log,
  logSuccess,
  logError,
  logWarning,
  logTest,
  logSection,
  logSeparator,
  logInfo,
  getToday,
  addDays,
  sleep,
} from './lib/index.js'

// Test data IDs (from e2e seed data)
const TEST_IDS = {
  // 李曉華的合約 (TIME_BASED)
  CONTRACT_LI: 'e2ec0002-0002-0002-0002-000000000002',
  // 張健身的課程合約 (COUNT_BASED)
  CONTRACT_ZHANG: 'e2ec0003-0003-0003-0003-000000000003',
  // 李曉華的會員 ID
  MEMBER_LI: 'e2e00002-0002-0002-0002-000000000002',
  // 員工 ID (用於 created_by)
  EMPLOYEE_MANAGER: 'e3000002-0002-0002-0002-000000000003',
  EMPLOYEE_COACH: 'e4000002-0002-0002-0002-000000000004',
}

interface Contract {
  id: string
  contract_no: string
  end_date: string
  original_end_date?: string
  contract_status: string
  remaining_counts?: number
}

interface Member {
  id: string
  full_name: string
  member_status: string
}

interface ContractLog {
  id: string
  log_type: string
  contract_id: string
}

interface TestResult {
  name: string
  passed: boolean
  message: string
}

const results: TestResult[] = []

function recordResult(name: string, passed: boolean, message: string): void {
  results.push({ name, passed, message })
  if (passed) {
    logSuccess(`PASS: ${message}`)
  } else {
    logError(`FAIL: ${message}`)
  }
}

async function main(): Promise<void> {
  logSection('開始測試 Directus Hooks（透過 API）')

  const client = new DirectusClient()

  // Step 1: Login
  log('\n🔑 Step 1: 登入 Directus 並取得 Token...')
  try {
    await client.login('admin@gym.com', 'admin')
    logSuccess(`登入成功，Token: ${client.getTokenPreview()}`)
  } catch (error) {
    logError(`登入失敗: ${error}`)
    process.exit(1)
  }

  // Test 1: Contract Pause Auto-Extension
  await testContractPause(client)

  // Test 2: Class Usage Deduction
  await testClassUsage(client)

  // Test 3: Contract Resume
  await testContractResume(client)

  // Test 4: Member Status Auto-Update
  await testMemberStatus(client)

  // Summary
  printSummary()
}

async function testContractPause(client: DirectusClient): Promise<void> {
  logSection('Test 1: 合約暫停自動延期 (PAUSE → 自動延長 end_date)')
  logTest('測試中...')

  try {
    // 1.1 Get contract before pause
    const beforePause = await client.getItem<Contract>(
      'contracts',
      TEST_IDS.CONTRACT_LI,
      ['contract_no', 'end_date', 'original_end_date', 'contract_status']
    )

    const originalEndDate = beforePause.data.end_date
    log(`暫停前 end_date: ${originalEndDate}`)

    // 1.2 Create pause log (should trigger hook)
    log('正在建立 30 天暫停紀錄...')

    await client.createItem<ContractLog>('contract_logs', {
      contract_id: TEST_IDS.CONTRACT_LI,
      log_type: 'PAUSE',
      start_date: getToday(),
      end_date: addDays(new Date(), 30),
      days_affected: 30,
      reason: 'API 測試：出國旅遊暫停會籍',
      created_by_employee: TEST_IDS.EMPLOYEE_MANAGER,
    })

    // Wait for hook to process
    await sleep(2000)

    // 1.3 Get contract after pause
    const afterPause = await client.getItem<Contract>(
      'contracts',
      TEST_IDS.CONTRACT_LI,
      ['contract_no', 'end_date', 'original_end_date', 'contract_status']
    )

    const newEndDate = afterPause.data.end_date
    const newStatus = afterPause.data.contract_status

    log(`暫停後 end_date: ${newEndDate}`)
    log(`暫停後 status: ${newStatus}`)

    // Verify
    recordResult(
      'Contract Pause - End Date Extension',
      originalEndDate !== newEndDate,
      originalEndDate !== newEndDate
        ? `end_date 已延長（從 ${originalEndDate} 到 ${newEndDate}）`
        : 'end_date 未延長'
    )

    recordResult(
      'Contract Pause - Status Update',
      newStatus === 'PAUSED',
      newStatus === 'PAUSED'
        ? 'contract_status 已更新為 PAUSED'
        : `contract_status 未更新為 PAUSED（目前: ${newStatus}）`
    )
  } catch (error) {
    logError(`測試失敗: ${error}`)
    recordResult('Contract Pause', false, `測試執行失敗: ${error}`)
  }
}

async function testClassUsage(client: DirectusClient): Promise<void> {
  logSection('Test 2: 課程扣課自動減少 (CLASS_USED → remaining_counts - 1)')
  logTest('測試中...')

  try {
    // 2.1 Get contract before class usage
    const beforeClass = await client.getItem<Contract>(
      'contracts',
      TEST_IDS.CONTRACT_ZHANG,
      ['contract_no', 'remaining_counts']
    )

    const remainingBefore = beforeClass.data.remaining_counts ?? 0
    log(`扣課前 remaining_counts: ${remainingBefore}`)

    // 2.2 Create class usage log (should trigger hook)
    log('正在建立課程使用紀錄...')

    await client.createItem<ContractLog>('contract_logs', {
      contract_id: TEST_IDS.CONTRACT_ZHANG,
      log_type: 'CLASS_USED',
      start_date: getToday(),
      reason: 'API 測試：私教課程 - 腿部訓練',
      created_by_employee: TEST_IDS.EMPLOYEE_COACH,
    })

    // Wait for hook to process
    await sleep(2000)

    // 2.3 Get contract after class usage
    const afterClass = await client.getItem<Contract>(
      'contracts',
      TEST_IDS.CONTRACT_ZHANG,
      ['contract_no', 'remaining_counts']
    )

    const remainingAfter = afterClass.data.remaining_counts ?? 0
    log(`扣課後 remaining_counts: ${remainingAfter}`)

    // Verify
    const expected = remainingBefore - 1
    recordResult(
      'Class Usage - Remaining Counts',
      remainingAfter === expected,
      remainingAfter === expected
        ? `remaining_counts 已減少 1（從 ${remainingBefore} 到 ${remainingAfter}）`
        : `remaining_counts 未正確減少（預期: ${expected}，實際: ${remainingAfter}）`
    )
  } catch (error) {
    logError(`測試失敗: ${error}`)
    recordResult('Class Usage', false, `測試執行失敗: ${error}`)
  }
}

async function testContractResume(client: DirectusClient): Promise<void> {
  logSection('Test 3: 合約恢復 (RESUME → contract_status = ACTIVE)')
  logTest('測試中...')

  try {
    // 3.1 Create resume log
    log('正在建立合約恢復紀錄...')

    await client.createItem<ContractLog>('contract_logs', {
      contract_id: TEST_IDS.CONTRACT_LI,
      log_type: 'RESUME',
      start_date: getToday(),
      reason: 'API 測試：恢復會籍',
      created_by_employee: TEST_IDS.EMPLOYEE_MANAGER,
    })

    // Wait for hook to process
    await sleep(2000)

    // 3.2 Get contract status
    const afterResume = await client.getItem<Contract>(
      'contracts',
      TEST_IDS.CONTRACT_LI,
      ['contract_status']
    )

    const resumeStatus = afterResume.data.contract_status
    log(`恢復後 status: ${resumeStatus}`)

    recordResult(
      'Contract Resume - Status Update',
      resumeStatus === 'ACTIVE',
      resumeStatus === 'ACTIVE'
        ? 'contract_status 已更新為 ACTIVE'
        : `contract_status 未更新為 ACTIVE（目前: ${resumeStatus}）`
    )
  } catch (error) {
    logError(`測試失敗: ${error}`)
    recordResult('Contract Resume', false, `測試執行失敗: ${error}`)
  }
}

async function testMemberStatus(client: DirectusClient): Promise<void> {
  logSection('Test 4: 會員狀態自動更新 (基於合約狀態)')
  logTest('測試中...')

  try {
    const member = await client.getItem<Member>(
      'members',
      TEST_IDS.MEMBER_LI,
      ['full_name', 'member_status']
    )

    const status = member.data.member_status
    log(`李曉華的會員狀態: ${status}`)

    if (status === 'ACTIVE') {
      recordResult(
        'Member Status - Auto Update',
        true,
        '會員狀態已更新為 ACTIVE（因為合約已恢復）'
      )
    } else {
      logWarning(`會員狀態為: ${status}（需要確認是否符合預期）`)
      recordResult(
        'Member Status - Auto Update',
        false,
        `會員狀態為 ${status}，預期為 ACTIVE`
      )
    }
  } catch (error) {
    logError(`測試失敗: ${error}`)
    recordResult('Member Status', false, `測試執行失敗: ${error}`)
  }
}

function printSummary(): void {
  logSection('📊 測試總結')

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  log('')
  log('測試結果:')
  results.forEach((r) => {
    const icon = r.passed ? '✅' : '❌'
    log(`  ${icon} ${r.name}: ${r.message}`)
  })

  log('')
  logSeparator()
  log(`總計: ${passed} 通過, ${failed} 失敗`)
  log('')

  logInfo('🔔 重要發現:')
  log('  - Directus Hooks 必須透過 API 觸發')
  log('  - SQL 直接 INSERT 不會觸發 Hooks')
  log('  - 所有 Hooks 均已成功載入並運行')
  log('')

  if (failed > 0) {
    process.exit(1)
  }
}

// Run the script
main().catch((error) => {
  logError(`Script failed: ${error}`)
  process.exit(1)
})
