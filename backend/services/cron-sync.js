/**
 * Cron Job for BigQuery Data Sync
 * 定期自動同步報表資料到 BigQuery
 *
 * 使用方式:
 * 1. 設定環境變數（參考 .env.example）
 * 2. 執行: node cron-sync.js
 * 3. 保持程序運行（建議使用 PM2 或 systemd）
 *
 * 排程時間:
 * - 每天凌晨 3:00 執行完整同步
 * - 可根據需求調整排程
 */

const cron = require('node-cron')
const { syncAllReportsToBigQuery } = require('./bigquery-export')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

console.log('========================================')
console.log('BigQuery 資料同步排程器已啟動')
console.log(`時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`)
console.log('========================================\n')

/**
 * 每日同步任務
 * 凌晨 3:00 執行
 */
cron.schedule('0 3 * * *', async () => {
  console.log('\n⏰ 觸發每日定時同步...')
  console.log(`時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`)

  try {
    // 同步最近 30 天的資料
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const startDate = thirtyDaysAgo.toISOString().split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]

    await syncAllReportsToBigQuery({
      startDate,
      endDate,
      daysAhead: 90
    })

    console.log('✓ 每日同步成功完成\n')
  } catch (error) {
    console.error('✗ 每日同步失敗:', error.message)
    // 可以在這裡加入錯誤通知（例如：發送 email 或 Slack 通知）
  }
}, {
  timezone: 'Asia/Taipei'
})

/**
 * 每小時增量同步（選擇性）
 * 每小時的第 5 分鐘執行
 * 只同步今天的資料
 */
cron.schedule('5 * * * *', async () => {
  console.log('\n⏰ 觸發每小時增量同步...')
  console.log(`時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`)

  try {
    const today = new Date().toISOString().split('T')[0]

    await syncAllReportsToBigQuery({
      startDate: today,
      endDate: today,
      daysAhead: 30
    })

    console.log('✓ 增量同步成功完成\n')
  } catch (error) {
    console.error('✗ 增量同步失敗:', error.message)
  }
}, {
  timezone: 'Asia/Taipei'
})

/**
 * 每週日完整同步
 * 每週日凌晨 2:00 執行
 * 同步最近 90 天的所有資料
 */
cron.schedule('0 2 * * 0', async () => {
  console.log('\n⏰ 觸發每週完整同步...')
  console.log(`時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`)

  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const startDate = ninetyDaysAgo.toISOString().split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]

    await syncAllReportsToBigQuery({
      startDate,
      endDate,
      daysAhead: 180
    })

    console.log('✓ 每週完整同步成功完成\n')
  } catch (error) {
    console.error('✗ 每週完整同步失敗:', error.message)
  }
}, {
  timezone: 'Asia/Taipei'
})

console.log('已設定排程任務:')
console.log('  ✓ 每天 03:00 - 完整同步（最近 30 天）')
console.log('  ✓ 每小時 XX:05 - 增量同步（今日資料）')
console.log('  ✓ 每週日 02:00 - 完整同步（最近 90 天）')
console.log('\n按 Ctrl+C 停止排程器\n')

// 優雅關閉
process.on('SIGINT', () => {
  console.log('\n\n收到停止信號，正在關閉排程器...')
  console.log('再見！\n')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n\n收到終止信號，正在關閉排程器...')
  console.log('再見！\n')
  process.exit(0)
})

// 可選：啟動時立即執行一次同步
const runOnStartup = process.env.SYNC_ON_STARTUP === 'true'

if (runOnStartup) {
  console.log('⚡ 啟動時立即執行一次同步...\n')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  syncAllReportsToBigQuery({
    startDate: thirtyDaysAgo.toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    daysAhead: 90
  })
    .then(() => {
      console.log('\n✓ 啟動同步完成\n')
    })
    .catch(error => {
      console.error('\n✗ 啟動同步失敗:', error.message, '\n')
    })
}
