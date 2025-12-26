/**
 * 報表匯出工具函數
 * 支援 CSV, Excel, PDF 格式
 */

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * 匯出為 CSV
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    alert('沒有資料可匯出')
    return
  }

  // 轉換為 CSV 格式
  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','), // 標題行
    ...data.map(row =>
      headers.map(header => {
        const value = row[header]
        // 處理包含逗號的值
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`
        }
        return value
      }).join(',')
    )
  ].join('\n')

  // 創建 Blob 並下載
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

/**
 * 匯出為 Excel (XLSX)
 */
export function exportToExcel(data: any[], filename: string, sheetName: string = 'Sheet1') {
  if (!data || data.length === 0) {
    alert('沒有資料可匯出')
    return
  }

  // 創建工作表
  const worksheet = XLSX.utils.json_to_sheet(data)

  // 設定欄位寬度
  const columnWidths = Object.keys(data[0]).map(key => ({
    wch: Math.max(key.length, 15) // 最小15個字元寬度
  }))
  worksheet['!cols'] = columnWidths

  // 創建工作簿
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  // 下載檔案
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

/**
 * 匯出為 PDF
 */
export function exportToPDF(
  data: any[],
  filename: string,
  title: string,
  columns?: { header: string; dataKey: string }[]
) {
  if (!data || data.length === 0) {
    alert('沒有資料可匯出')
    return
  }

  // 創建 PDF 文件
  const doc = new jsPDF()

  // 添加標題
  doc.setFontSize(16)
  doc.text(title, 14, 20)

  // 準備表格資料
  const tableColumns = columns || Object.keys(data[0]).map(key => ({
    header: key,
    dataKey: key
  }))

  const tableData = data.map(row =>
    tableColumns.reduce((acc, col) => {
      acc[col.dataKey] = row[col.dataKey]
      return acc
    }, {} as any)
  )

  // 生成表格
  autoTable(doc, {
    startY: 30,
    head: [tableColumns.map(col => col.header)],
    body: tableData.map(row =>
      tableColumns.map(col => row[col.dataKey] || '')
    ),
    styles: {
      font: 'helvetica', // PDF 預設字體不支援中文，需要額外處理
      fontSize: 10
    },
    headStyles: {
      fillColor: [0, 113, 227], // 藍色背景
      textColor: [255, 255, 255]
    }
  })

  // 下載 PDF
  doc.save(`${filename}.pdf`)
}

/**
 * 格式化報表資料（用於匯出）
 */
export function formatReportDataForExport(
  data: any[],
  fieldMapping: Record<string, string>
): any[] {
  return data.map(item => {
    const formatted: any = {}
    for (const [key, label] of Object.entries(fieldMapping)) {
      formatted[label] = item[key]
    }
    return formatted
  })
}

/**
 * 營收報表匯出
 */
export function exportRevenueReport(data: any[], format: 'csv' | 'excel' | 'pdf' = 'excel') {
  const fieldMapping = {
    payment_day: '日期',
    branch_name: '分店名稱',
    transaction_count: '交易筆數',
    total_income: '總收入',
    total_refund: '總退款',
    net_revenue: '淨營收',
    unique_members: '不重複會員數',
    cash_income: '現金收入',
    credit_card_income: '信用卡收入',
    bank_transfer_income: '銀行轉帳收入',
    line_pay_income: 'LINE Pay 收入'
  }

  const formattedData = formatReportDataForExport(data, fieldMapping)
  const filename = `營收報表_${new Date().toISOString().split('T')[0]}`

  switch (format) {
    case 'csv':
      exportToCSV(formattedData, filename)
      break
    case 'excel':
      exportToExcel(formattedData, filename, '營收報表')
      break
    case 'pdf':
      exportToPDF(formattedData, filename, '營收報表')
      break
  }
}

/**
 * 會員成長報表匯出
 */
export function exportMemberGrowthReport(data: any[], format: 'csv' | 'excel' | 'pdf' = 'excel') {
  const fieldMapping = {
    join_day: '日期',
    branch_name: '分店名稱',
    new_members: '新增會員數',
    active_members: '活躍會員數',
    male_count: '男性會員數',
    female_count: '女性會員數',
    sales_persons_involved: '銷售人員數'
  }

  const formattedData = formatReportDataForExport(data, fieldMapping)
  const filename = `會員成長報表_${new Date().toISOString().split('T')[0]}`

  switch (format) {
    case 'csv':
      exportToCSV(formattedData, filename)
      break
    case 'excel':
      exportToExcel(formattedData, filename, '會員成長報表')
      break
    case 'pdf':
      exportToPDF(formattedData, filename, '會員成長報表')
      break
  }
}

/**
 * 合約到期提醒匯出
 */
export function exportContractExpiryReport(data: any[], format: 'csv' | 'excel' | 'pdf' = 'excel') {
  const fieldMapping = {
    contract_no: '合約編號',
    member_name: '會員姓名',
    member_code: '會員編號',
    member_phone: '聯絡電話',
    branch_name: '分店',
    plan_name: '方案名稱',
    end_date: '到期日',
    days_until_expiry: '剩餘天數',
    contract_status: '合約狀態',
    payment_status: '付款狀態',
    total_amount: '合約金額',
    total_paid: '已付金額',
    outstanding_amount: '未付金額',
    sales_person_name: '銷售人員'
  }

  const formattedData = formatReportDataForExport(data, fieldMapping)
  const filename = `合約到期提醒_${new Date().toISOString().split('T')[0]}`

  switch (format) {
    case 'csv':
      exportToCSV(formattedData, filename)
      break
    case 'excel':
      exportToExcel(formattedData, filename, '合約到期提醒')
      break
    case 'pdf':
      exportToPDF(formattedData, filename, '合約到期提醒')
      break
  }
}

/**
 * 會員活躍度報表匯出
 */
export function exportMemberActivityReport(data: any[], format: 'csv' | 'excel' | 'pdf' = 'excel') {
  const fieldMapping = {
    activity_day: '日期',
    branch_name: '分店名稱',
    total_check_ins: '總入場次數',
    unique_members: '不重複會員數',
    qr_code_count: 'QR Code 入場',
    manual_count: '手動入場',
    card_count: '卡片入場',
    morning_count: '早上入場',
    afternoon_count: '下午入場',
    evening_count: '晚上入場'
  }

  const formattedData = formatReportDataForExport(data, fieldMapping)
  const filename = `會員活躍度報表_${new Date().toISOString().split('T')[0]}`

  switch (format) {
    case 'csv':
      exportToCSV(formattedData, filename)
      break
    case 'excel':
      exportToExcel(formattedData, filename, '會員活躍度報表')
      break
    case 'pdf':
      exportToPDF(formattedData, filename, '會員活躍度報表')
      break
  }
}
