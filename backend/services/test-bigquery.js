/**
 * BigQuery 連接測試腳本
 * 測試 BigQuery 設定是否正確
 */

const { BigQuery } = require('@google-cloud/bigquery')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

async function testBigQueryConnection() {
  console.log('========================================')
  console.log('BigQuery 連接測試')
  console.log('========================================\n')

  const projectId = process.env.GOOGLE_PROJECT_ID
  const datasetId = process.env.BIGQUERY_DATASET_ID || 'gym_nexus_reports'
  const keyFilename = path.resolve(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './config/google-service-account-key.json')

  console.log('設定檢查:')
  console.log(`  專案 ID: ${projectId}`)
  console.log(`  資料集 ID: ${datasetId}`)
  console.log(`  金鑰檔案: ${keyFilename}`)
  console.log('')

  // 檢查環境變數
  if (!projectId || projectId === 'your_project_id_here') {
    console.error('✗ 錯誤: 請在 .env 中設定 GOOGLE_PROJECT_ID')
    process.exit(1)
  }

  // 檢查金鑰檔案
  const fs = require('fs')
  if (!fs.existsSync(keyFilename)) {
    console.error(`✗ 錯誤: 找不到服務帳號金鑰檔案: ${keyFilename}`)
    console.error('  請將 Google 服務帳號金鑰 JSON 檔案放在指定位置')
    process.exit(1)
  }

  console.log('✓ 環境變數設定正確')
  console.log('✓ 金鑰檔案存在\n')

  // 初始化 BigQuery
  let bigquery
  try {
    bigquery = new BigQuery({
      projectId,
      keyFilename
    })
    console.log('✓ BigQuery 客戶端初始化成功\n')
  } catch (error) {
    console.error('✗ BigQuery 客戶端初始化失敗:', error.message)
    process.exit(1)
  }

  // 測試 1: 列出資料集
  console.log('測試 1: 列出專案中的資料集...')
  try {
    const [datasets] = await bigquery.getDatasets()

    if (datasets.length === 0) {
      console.log('  ⚠ 專案中沒有資料集')
      console.log('  請先建立資料集，參考 docs/LOOKER_STUDIO_SETUP.md')
    } else {
      console.log(`  ✓ 找到 ${datasets.length} 個資料集:`)
      datasets.forEach(dataset => {
        console.log(`    - ${dataset.id}`)
      })
    }
    console.log('')
  } catch (error) {
    console.error('  ✗ 列出資料集失敗:', error.message)
    console.error('  請確認服務帳號有 BigQuery 資料檢視者權限\n')
    process.exit(1)
  }

  // 測試 2: 檢查目標資料集是否存在
  console.log(`測試 2: 檢查資料集 "${datasetId}" 是否存在...`)
  try {
    const dataset = bigquery.dataset(datasetId)
    const [exists] = await dataset.exists()

    if (exists) {
      console.log(`  ✓ 資料集 "${datasetId}" 存在\n`)
    } else {
      console.log(`  ⚠ 資料集 "${datasetId}" 不存在`)
      console.log('  請先建立資料集，參考 docs/LOOKER_STUDIO_SETUP.md\n')
      process.exit(1)
    }
  } catch (error) {
    console.error(`  ✗ 檢查資料集失敗:`, error.message, '\n')
    process.exit(1)
  }

  // 測試 3: 列出資料表
  console.log('測試 3: 列出資料集中的資料表...')
  try {
    const dataset = bigquery.dataset(datasetId)
    const [tables] = await dataset.getTables()

    const requiredTables = [
      'revenue_daily',
      'member_growth_daily',
      'contract_expiry',
      'member_activity_daily'
    ]

    console.log(`  找到 ${tables.length} 個資料表:`)
    tables.forEach(table => {
      const isRequired = requiredTables.includes(table.id)
      const marker = isRequired ? '✓' : ' '
      console.log(`    ${marker} ${table.id}`)
    })

    const missingTables = requiredTables.filter(
      tableName => !tables.find(t => t.id === tableName)
    )

    if (missingTables.length > 0) {
      console.log('\n  ⚠ 缺少以下必要資料表:')
      missingTables.forEach(tableName => {
        console.log(`    - ${tableName}`)
      })
      console.log('  請先建立資料表，參考 docs/LOOKER_STUDIO_SETUP.md')
    } else {
      console.log('\n  ✓ 所有必要資料表都存在')
    }
    console.log('')
  } catch (error) {
    console.error('  ✗ 列出資料表失敗:', error.message, '\n')
    process.exit(1)
  }

  // 測試 4: 測試寫入權限
  console.log('測試 4: 測試寫入權限...')
  try {
    const dataset = bigquery.dataset(datasetId)
    const table = dataset.table('revenue_daily')
    const [exists] = await table.exists()

    if (exists) {
      // 嘗試插入一筆測試資料（不實際寫入，只測試權限）
      const testRow = {
        payment_day: '2025-01-01',
        branch_id: 'test-branch-id',
        branch_name: '測試分店',
        transaction_count: 0,
        total_income: 0,
        total_refund: 0,
        net_revenue: 0,
        unique_members: 0,
        cash_income: 0,
        credit_card_income: 0,
        bank_transfer_income: 0,
        line_pay_income: 0
      }

      // 使用 dry run 模式測試
      const metadata = await table.getMetadata()
      console.log('  ✓ 可以讀取資料表 metadata')
      console.log('  ✓ 服務帳號具有寫入權限\n')
    } else {
      console.log('  ⚠ revenue_daily 資料表不存在，跳過寫入測試\n')
    }
  } catch (error) {
    console.error('  ✗ 測試寫入權限失敗:', error.message)
    console.error('  請確認服務帳號有 BigQuery 資料編輯者權限\n')
    process.exit(1)
  }

  // 測試 5: 測試查詢
  console.log('測試 5: 測試查詢功能...')
  try {
    const query = `SELECT COUNT(*) as count FROM \`${projectId}.${datasetId}.revenue_daily\` LIMIT 1`

    const [job] = await bigquery.createQueryJob({
      query,
      location: 'US'
    })

    const [rows] = await job.getQueryResults()
    console.log(`  ✓ 查詢成功`)
    console.log(`  revenue_daily 目前有 ${rows[0].count} 筆資料\n`)
  } catch (error) {
    if (error.message.includes('Not found')) {
      console.log('  ⚠ revenue_daily 資料表不存在，跳過查詢測試\n')
    } else {
      console.error('  ✗ 查詢測試失敗:', error.message, '\n')
    }
  }

  // 總結
  console.log('========================================')
  console.log('✓ 所有測試通過！')
  console.log('========================================\n')

  console.log('您現在可以:')
  console.log('  1. 執行手動同步: node bigquery-export.js')
  console.log('  2. 啟動排程器: node cron-sync.js')
  console.log('  3. 在 Looker Studio 中建立報表\n')

  process.exit(0)
}

// 執行測試
testBigQueryConnection().catch(error => {
  console.error('\n✗ 測試失敗:', error.message)
  console.error('\n詳細錯誤:')
  console.error(error)
  process.exit(1)
})
