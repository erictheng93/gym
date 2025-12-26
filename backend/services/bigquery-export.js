/**
 * BigQuery Export Service
 * 將報表資料從 PostgreSQL/Directus 同步到 BigQuery
 *
 * 使用方式：
 * 1. 設定環境變數（參考 .env.example）
 * 2. 執行: node bigquery-export.js
 * 3. 或使用 cron: node cron-sync.js
 */

const { BigQuery } = require('@google-cloud/bigquery')
const path = require('path')
const fetch = require('node-fetch')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

// 初始化 BigQuery 客戶端
const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_PROJECT_ID,
  keyFilename: path.resolve(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './config/google-service-account-key.json')
})

const datasetId = process.env.BIGQUERY_DATASET_ID || 'gym_nexus_reports'
const directusUrl = process.env.DIRECTUS_URL || 'http://localhost:8055'

/**
 * 上傳營收報表資料到 BigQuery
 */
async function uploadRevenueData(data) {
  const tableId = 'revenue_daily'

  console.log(`準備上傳 ${data.length} 筆營收資料...`)

  const rows = data.map(row => ({
    payment_day: row.payment_day.split('T')[0], // 確保只有日期部分
    branch_id: row.branch_id || null,
    branch_name: row.branch_name || '',
    transaction_count: parseInt(row.transaction_count) || 0,
    total_income: parseFloat(row.total_income) || 0,
    total_refund: parseFloat(row.total_refund) || 0,
    net_revenue: parseFloat(row.net_revenue) || 0,
    unique_members: parseInt(row.unique_members) || 0,
    cash_income: parseFloat(row.cash_income) || 0,
    credit_card_income: parseFloat(row.credit_card_income) || 0,
    bank_transfer_income: parseFloat(row.bank_transfer_income) || 0,
    line_pay_income: parseFloat(row.line_pay_income) || 0
  }))

  try {
    await bigquery
      .dataset(datasetId)
      .table(tableId)
      .insert(rows, { skipInvalidRows: true, ignoreUnknownValues: true })

    console.log(`✓ 已上傳 ${rows.length} 筆營收資料到 BigQuery`)
    return { success: true, count: rows.length }
  } catch (error) {
    console.error('營收資料上傳失敗:', error.message)
    if (error.errors) {
      error.errors.forEach(err => console.error('  -', err.message))
    }
    return { success: false, error: error.message }
  }
}

/**
 * 上傳會員成長資料到 BigQuery
 */
async function uploadMemberGrowthData(data) {
  const tableId = 'member_growth_daily'

  console.log(`準備上傳 ${data.length} 筆會員成長資料...`)

  const rows = data.map(row => ({
    join_day: row.join_day.split('T')[0],
    branch_id: row.branch_id || null,
    branch_name: row.branch_name || '',
    new_members: parseInt(row.new_members) || 0,
    active_members: parseInt(row.active_members) || 0,
    male_count: parseInt(row.male_count) || 0,
    female_count: parseInt(row.female_count) || 0,
    sales_persons_involved: parseInt(row.sales_persons_involved) || 0
  }))

  try {
    await bigquery
      .dataset(datasetId)
      .table(tableId)
      .insert(rows, { skipInvalidRows: true, ignoreUnknownValues: true })

    console.log(`✓ 已上傳 ${rows.length} 筆會員成長資料到 BigQuery`)
    return { success: true, count: rows.length }
  } catch (error) {
    console.error('會員成長資料上傳失敗:', error.message)
    if (error.errors) {
      error.errors.forEach(err => console.error('  -', err.message))
    }
    return { success: false, error: error.message }
  }
}

/**
 * 上傳合約到期提醒資料到 BigQuery
 */
async function uploadContractExpiryData(data) {
  const tableId = 'contract_expiry'
  const today = new Date().toISOString().split('T')[0]

  console.log(`準備上傳 ${data.length} 筆合約到期資料...`)

  const rows = data.map(row => ({
    contract_id: row.contract_id || '',
    contract_no: row.contract_no || '',
    member_id: row.member_id || '',
    member_name: row.member_name || '',
    member_code: row.member_code || '',
    member_phone: row.member_phone || '',
    member_email: row.member_email || '',
    branch_id: row.branch_id || null,
    branch_name: row.branch_name || '',
    plan_name: row.plan_name || '',
    start_date: row.start_date ? row.start_date.split('T')[0] : null,
    end_date: row.end_date ? row.end_date.split('T')[0] : null,
    contract_status: row.contract_status || '',
    payment_status: row.payment_status || '',
    days_until_expiry: parseInt(row.days_until_expiry) || 0,
    sales_person_id: row.sales_person_id || null,
    sales_person_name: row.sales_person_name || '',
    total_amount: parseFloat(row.total_amount) || 0,
    total_paid: parseFloat(row.total_paid) || 0,
    outstanding_amount: parseFloat(row.outstanding_amount) || 0,
    snapshot_date: today
  }))

  try {
    await bigquery
      .dataset(datasetId)
      .table(tableId)
      .insert(rows, { skipInvalidRows: true, ignoreUnknownValues: true })

    console.log(`✓ 已上傳 ${rows.length} 筆合約到期資料到 BigQuery`)
    return { success: true, count: rows.length }
  } catch (error) {
    console.error('合約到期資料上傳失敗:', error.message)
    if (error.errors) {
      error.errors.forEach(err => console.error('  -', err.message))
    }
    return { success: false, error: error.message }
  }
}

/**
 * 上傳會員活躍度資料到 BigQuery
 */
async function uploadMemberActivityData(data) {
  const tableId = 'member_activity_daily'

  console.log(`準備上傳 ${data.length} 筆會員活躍度資料...`)

  const rows = data.map(row => ({
    activity_day: row.activity_day.split('T')[0],
    branch_id: row.branch_id || null,
    branch_name: row.branch_name || '',
    total_check_ins: parseInt(row.total_check_ins) || 0,
    unique_members: parseInt(row.unique_members) || 0,
    qr_code_count: parseInt(row.qr_code_count) || 0,
    manual_count: parseInt(row.manual_count) || 0,
    card_count: parseInt(row.card_count) || 0,
    morning_count: parseInt(row.morning_count) || 0,
    afternoon_count: parseInt(row.afternoon_count) || 0,
    evening_count: parseInt(row.evening_count) || 0
  }))

  try {
    await bigquery
      .dataset(datasetId)
      .table(tableId)
      .insert(rows, { skipInvalidRows: true, ignoreUnknownValues: true })

    console.log(`✓ 已上傳 ${rows.length} 筆會員活躍度資料到 BigQuery`)
    return { success: true, count: rows.length }
  } catch (error) {
    console.error('會員活躍度資料上傳失敗:', error.message)
    if (error.errors) {
      error.errors.forEach(err => console.error('  -', err.message))
    }
    return { success: false, error: error.message }
  }
}

/**
 * 執行完整的資料同步
 */
async function syncAllReportsToBigQuery(options = {}) {
  const {
    startDate = null,
    endDate = null,
    daysAhead = 90
  } = options

  try {
    console.log('========================================')
    console.log('開始同步報表資料到 BigQuery...')
    console.log(`時間: ${new Date().toISOString()}`)
    console.log('========================================\n')

    const results = {
      revenue: null,
      memberGrowth: null,
      contractExpiry: null,
      memberActivity: null
    }

    // 1. 營收報表
    console.log('1. 同步營收報表...')
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)

      const revenueResponse = await fetch(`${directusUrl}/gym/reports/revenue?${params}`)
      const revenueData = await revenueResponse.json()

      if (revenueData.success && revenueData.data && revenueData.data.length > 0) {
        results.revenue = await uploadRevenueData(revenueData.data)
      } else {
        console.log('⚠ 沒有營收資料可同步')
        results.revenue = { success: false, error: '沒有資料' }
      }
    } catch (error) {
      console.error('營收報表同步失敗:', error.message)
      results.revenue = { success: false, error: error.message }
    }

    console.log('')

    // 2. 會員成長報表
    console.log('2. 同步會員成長報表...')
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)

      const growthResponse = await fetch(`${directusUrl}/gym/reports/member-growth?${params}`)
      const growthData = await growthResponse.json()

      if (growthData.success && growthData.data && growthData.data.length > 0) {
        results.memberGrowth = await uploadMemberGrowthData(growthData.data)
      } else {
        console.log('⚠ 沒有會員成長資料可同步')
        results.memberGrowth = { success: false, error: '沒有資料' }
      }
    } catch (error) {
      console.error('會員成長報表同步失敗:', error.message)
      results.memberGrowth = { success: false, error: error.message }
    }

    console.log('')

    // 3. 合約到期提醒
    console.log('3. 同步合約到期提醒...')
    try {
      const expiryResponse = await fetch(
        `${directusUrl}/gym/reports/contract-expiry?days_ahead=${daysAhead}`
      )
      const expiryData = await expiryResponse.json()

      if (expiryData.success && expiryData.data && expiryData.data.length > 0) {
        results.contractExpiry = await uploadContractExpiryData(expiryData.data)
      } else {
        console.log('⚠ 沒有合約到期資料可同步')
        results.contractExpiry = { success: false, error: '沒有資料' }
      }
    } catch (error) {
      console.error('合約到期提醒同步失敗:', error.message)
      results.contractExpiry = { success: false, error: error.message }
    }

    console.log('')

    // 4. 會員活躍度報表
    console.log('4. 同步會員活躍度報表...')
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)

      const activityResponse = await fetch(`${directusUrl}/gym/reports/member-activity?${params}`)
      const activityData = await activityResponse.json()

      if (activityData.success && activityData.data && activityData.data.length > 0) {
        results.memberActivity = await uploadMemberActivityData(activityData.data)
      } else {
        console.log('⚠ 沒有會員活躍度資料可同步')
        results.memberActivity = { success: false, error: '沒有資料' }
      }
    } catch (error) {
      console.error('會員活躍度報表同步失敗:', error.message)
      results.memberActivity = { success: false, error: error.message }
    }

    console.log('')
    console.log('========================================')
    console.log('同步完成！')
    console.log('========================================')

    // 輸出摘要
    const totalSuccess = Object.values(results).filter(r => r && r.success).length
    const totalFailed = Object.values(results).filter(r => r && !r.success).length

    console.log(`\n摘要:`)
    console.log(`  成功: ${totalSuccess}`)
    console.log(`  失敗: ${totalFailed}`)

    if (results.revenue?.success) console.log(`  營收資料: ${results.revenue.count} 筆`)
    if (results.memberGrowth?.success) console.log(`  會員成長: ${results.memberGrowth.count} 筆`)
    if (results.contractExpiry?.success) console.log(`  合約到期: ${results.contractExpiry.count} 筆`)
    if (results.memberActivity?.success) console.log(`  會員活躍度: ${results.memberActivity.count} 筆`)

    return results
  } catch (error) {
    console.error('\n同步過程發生錯誤:', error)
    throw error
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  // 解析命令列參數
  const args = process.argv.slice(2)
  const options = {}

  args.forEach((arg, index) => {
    if (arg === '--start-date' && args[index + 1]) {
      options.startDate = args[index + 1]
    }
    if (arg === '--end-date' && args[index + 1]) {
      options.endDate = args[index + 1]
    }
    if (arg === '--days-ahead' && args[index + 1]) {
      options.daysAhead = parseInt(args[index + 1])
    }
  })

  console.log('配置:')
  console.log(`  Directus URL: ${directusUrl}`)
  console.log(`  BigQuery Project: ${process.env.GOOGLE_PROJECT_ID}`)
  console.log(`  BigQuery Dataset: ${datasetId}`)
  console.log('')

  syncAllReportsToBigQuery(options)
    .then(() => {
      console.log('\n✓ 全部完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n✗ 同步失敗:', error)
      process.exit(1)
    })
}

module.exports = {
  uploadRevenueData,
  uploadMemberGrowthData,
  uploadContractExpiryData,
  uploadMemberActivityData,
  syncAllReportsToBigQuery
}
