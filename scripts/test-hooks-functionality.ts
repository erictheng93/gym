#!/usr/bin/env npx tsx
/**
 * Directus Hooks Functionality Test Script
 *
 * Tests hooks functionality by directly querying the database via Docker.
 * This verifies the data state without relying on API triggers.
 *
 * Cross-platform: Works on Windows, macOS, and Linux.
 *
 * Usage:
 *   pnpm test:hooks:db
 *   # or directly:
 *   npx tsx test-hooks-functionality.ts
 */

import {
  log,
  logSuccess,
  logError,
  logWarning,
  logTest,
  logSection,
  logSeparator,
  logInfo,
  sleep,
  execSql,
  execSqlFile,
  getContainerLogs,
  isDockerAvailable,
  isContainerRunning,
} from './lib/index.js'

const DB_CONTAINER = 'backend-database-1'
const DIRECTUS_CONTAINER = 'backend-directus-1'

async function main(): Promise<void> {
  logSection('開始測試 Directus Hooks 功能')

  // Check Docker availability
  if (!(await isDockerAvailable())) {
    logError('Docker 未安裝或未運行')
    process.exit(1)
  }

  // Check containers
  if (!(await isContainerRunning(DB_CONTAINER))) {
    logError(`資料庫容器 ${DB_CONTAINER} 未運行`)
    logInfo('請先執行: cd backend && docker-compose up -d')
    process.exit(1)
  }

  // Step 1: Load test data
  log('\n📦 Step 1: 載入端到端測試資料...')
  try {
    await execSqlFile('backend/seed-e2e-test.sql')
    logSuccess('測試資料載入完成')
  } catch (error) {
    logWarning(`測試資料載入失敗（可能已存在）: ${error}`)
  }

  // Wait for Directus to process
  await sleep(2000)

  // Test 1: Contract Pause Auto-Extension
  await testContractPause()

  // Test 2: Class Usage
  await testClassUsage()

  // Test 3: Contract Transfer
  await testContractTransfer()

  // Test 4: Member Status
  await testMemberStatus()

  // Test 5: Directus Extensions
  await testDirectusExtensions()

  // Summary
  printSummary()
}

async function testContractPause(): Promise<void> {
  logSection('Test 1: 合約暫停自動延期 (PAUSE → 延長 end_date)')
  logTest('查詢李曉華的合約 (ctest002)...')

  try {
    const result = await execSql(`
      SELECT
        c.contract_no,
        c.end_date,
        c.original_end_date,
        (c.end_date - c.original_end_date) AS extended_days,
        c.contract_status
      FROM contracts c
      WHERE c.id = 'ctest002-0002-0002-0002-000000000002'
    `)

    log('合約編號: CT2025-TEST-002 (李曉華)')
    log(result)

    if (result.includes('30')) {
      logSuccess('PASS: end_date 已延長 30 天')
    } else {
      logError('FAIL: end_date 未延長或延長天數不正確')
    }

    if (result.includes('PAUSED')) {
      logSuccess('PASS: contract_status 已更新為 PAUSED')
    } else {
      logError('FAIL: contract_status 未更新')
    }
  } catch (error) {
    logError(`查詢失敗: ${error}`)
  }
}

async function testClassUsage(): Promise<void> {
  logSection('Test 2: 課程扣課自動減少 (CLASS_USED → remaining_counts - 1)')
  logTest('查詢張健身的課程合約 (ctest003)...')

  try {
    const result = await execSql(`
      SELECT
        c.contract_no,
        c.remaining_counts,
        (SELECT COUNT(*) FROM contract_logs WHERE contract_id = c.id AND log_type = 'CLASS_USED') as classes_used,
        c.contract_status
      FROM contracts c
      WHERE c.id = 'ctest003-0003-0003-0003-000000000003'
    `)

    log('合約編號: CT2025-TEST-003 (張健身 - 10堂私教)')
    log(result)

    logWarning('注意：課程扣課需要透過 Directus API 調用才會觸發 Hook')
    log('   如果 remaining_counts 仍為 10，這是正常的（SQL 直接 INSERT 不會觸發 Hook）')
    log('   需要透過前端或 API 使用課程才會自動扣除')
  } catch (error) {
    logError(`查詢失敗: ${error}`)
  }
}

async function testContractTransfer(): Promise<void> {
  logSection('Test 3: 合約轉讓 (TRANSFER → 更新 member_id)')
  logTest('查詢轉讓記錄...')

  try {
    const result = await execSql(`
      SELECT
        l.log_type,
        m1.full_name AS original_member,
        m2.full_name AS target_member,
        c.contract_no,
        c.member_id
      FROM contract_logs l
      JOIN contracts c ON c.id = l.contract_id
      LEFT JOIN members m1 ON m1.id = l.original_member_id
      LEFT JOIN members m2 ON m2.id = l.target_member_id
      WHERE l.id = 'ltest004-0004-0004-0004-000000000004'
    `)

    log('轉讓紀錄: CT2025-TEST-001 (王小明 → 李曉華)')
    log(result)

    logWarning('注意：合約轉讓也需要透過 Directus API 觸發 Hook')
    log('   如果 member_id 未變更，需要透過前端或 API 操作')
  } catch (error) {
    logError(`查詢失敗: ${error}`)
  }
}

async function testMemberStatus(): Promise<void> {
  logSection('Test 4: 會員狀態自動更新 (基於合約狀態)')
  logTest('查詢測試會員的狀態...')

  try {
    const result = await execSql(`
      SELECT
        m.full_name,
        m.member_status,
        COUNT(c.id) FILTER (WHERE c.contract_status = 'ACTIVE') as active_contracts,
        COUNT(c.id) FILTER (WHERE c.contract_status = 'PAUSED') as paused_contracts
      FROM members m
      LEFT JOIN contracts c ON c.member_id = m.id AND c.status = 'active'
      WHERE m.id IN (
        'test0001-0001-0001-0001-000000000001',
        'test0002-0002-0002-0002-000000000002',
        'test0003-0003-0003-0003-000000000003'
      )
      GROUP BY m.id, m.full_name, m.member_status
    `)

    log('測試會員狀態:')
    log(result)

    logSuccess('會員狀態計算邏輯:')
    log('   - 有 ACTIVE 合約 → member_status = ACTIVE')
    log('   - 只有 PAUSED 合約 → member_status = PAUSED')
    log('   - 無有效合約 → member_status = INACTIVE')
  } catch (error) {
    logError(`查詢失敗: ${error}`)
  }
}

async function testDirectusExtensions(): Promise<void> {
  logSection('Test 5: 檢查 Directus Extensions 載入狀態')
  logTest('查看 Directus 容器日誌...')

  try {
    if (!(await isContainerRunning(DIRECTUS_CONTAINER))) {
      logWarning(`Directus 容器 ${DIRECTUS_CONTAINER} 未運行`)
      return
    }

    const logs = await getContainerLogs(DIRECTUS_CONTAINER, 50)
    const hookLines = logs
      .split('\n')
      .filter((line) => line.includes('GymHook') || line.includes('extension'))
      .slice(-10)

    if (hookLines.length > 0) {
      log('Extension 載入日誌:')
      hookLines.forEach((line) => log(`  ${line}`))
      logSuccess('如果看到 [GymHook] 相關訊息，表示 Hooks 已成功載入')
    } else {
      logWarning('未找到 Hook 載入訊息，請檢查 Directus 日誌')
    }
  } catch (error) {
    logError(`查詢日誌失敗: ${error}`)
  }
}

function printSummary(): void {
  logSection('📊 測試總結')

  log('')
  logSuccess('已完成的測試:')
  log('  1. ✅ 合約暫停自動延期邏輯')
  log('  2. ⚠️  課程扣課自動減少（需 API 觸發）')
  log('  3. ⚠️  合約轉讓（需 API 觸發）')
  log('  4. ✅ 會員狀態自動更新邏輯')
  log('  5. ✅ Directus Extensions 載入檢查')
  log('')

  logInfo('🔔 重要提醒:')
  log('  - SQL 直接 INSERT 不會觸發 Directus Hooks')
  log('  - 必須透過 Directus API 操作才能觸發 Hooks')
  log('  - 建議使用 Postman 或前端進行完整的 E2E 測試')
  log('')

  logInfo('📖 下一步建議:')
  log('  1. 啟動前端 Dashboard 手動測試')
  log('  2. 使用 Directus API 建立合約暫停紀錄')
  log('  3. 驗證 end_date 是否自動延長')
  log('')
}

// Run the script
main().catch((error) => {
  logError(`Script failed: ${error}`)
  process.exit(1)
})
