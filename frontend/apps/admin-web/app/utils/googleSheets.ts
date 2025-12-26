/**
 * Google Sheets API Integration
 * 提供匯出報表資料到 Google Sheets 的功能
 *
 * Setup:
 * 1. Configure .env with Google OAuth credentials
 * 2. User must authenticate via OAuth 2.0 flow
 * 3. Access tokens are stored in localStorage
 */

interface GoogleAuthToken {
  access_token: string
  refresh_token?: string
  expires_at: number
  token_type: string
  scope: string
}

interface SpreadsheetCreateResponse {
  spreadsheetId: string
  spreadsheetUrl: string
  title: string
}

export class GoogleSheetsExporter {
  private config: {
    clientId: string
    redirectUri: string
    scopes: string[]
  }

  private readonly STORAGE_KEY = 'google_auth_token'
  private readonly API_BASE = 'https://sheets.googleapis.com/v4'
  private readonly DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'

  constructor() {
    const runtimeConfig = useRuntimeConfig()

    this.config = {
      clientId: runtimeConfig.public.googleClientId as string,
      redirectUri: runtimeConfig.public.googleRedirectUri as string,
      scopes: (runtimeConfig.public.googleScopes as string || '').split(',')
    }

    // Validate configuration
    if (!this.config.clientId || this.config.clientId.includes('your_client_id')) {
      console.warn('Google Sheets integration not configured. Please set up .env variables.')
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getStoredToken()
    if (!token) return false

    // Check if token is expired
    return Date.now() < token.expires_at
  }

  /**
   * Get stored authentication token
   */
  private getStoredToken(): GoogleAuthToken | null {
    if (typeof window === 'undefined') return null

    const stored = localStorage.getItem(this.STORAGE_KEY)
    if (!stored) return null

    try {
      return JSON.parse(stored) as GoogleAuthToken
    } catch {
      return null
    }
  }

  /**
   * Store authentication token
   */
  private storeToken(token: GoogleAuthToken): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(token))
  }

  /**
   * Clear stored authentication token
   */
  logout(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(this.STORAGE_KEY)
  }

  /**
   * Initiate OAuth 2.0 authentication flow
   * Opens popup window for user to grant permissions
   */
  async authenticate(): Promise<void> {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', this.config.clientId)
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri)
    authUrl.searchParams.set('response_type', 'token')
    authUrl.searchParams.set('scope', this.config.scopes.join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    return new Promise((resolve, reject) => {
      // Open popup window
      const width = 500
      const height = 600
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        authUrl.toString(),
        'Google Authentication',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      if (!popup) {
        reject(new Error('無法開啟驗證視窗，請允許彈出視窗'))
        return
      }

      // Listen for message from callback page
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return

        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          const token: GoogleAuthToken = {
            access_token: event.data.access_token,
            expires_at: Date.now() + (event.data.expires_in * 1000),
            token_type: event.data.token_type,
            scope: event.data.scope
          }

          this.storeToken(token)
          window.removeEventListener('message', messageHandler)
          popup.close()
          resolve()
        } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
          window.removeEventListener('message', messageHandler)
          popup.close()
          reject(new Error(event.data.error || '驗證失敗'))
        }
      }

      window.addEventListener('message', messageHandler)

      // Check if popup was closed without completing auth
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed)
          window.removeEventListener('message', messageHandler)
          reject(new Error('驗證已取消'))
        }
      }, 500)
    })
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest(url: string, options: RequestInit = {}): Promise<any> {
    const token = this.getStoredToken()
    if (!token) {
      throw new Error('未登入 Google 帳號，請先驗證')
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '未知錯誤' }))
      throw new Error(error.error?.message || error.error || `API 請求失敗: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Create new spreadsheet with data
   */
  async createSpreadsheet(
    title: string,
    sheetName: string,
    data: any[]
  ): Promise<SpreadsheetCreateResponse> {
    if (!data || data.length === 0) {
      throw new Error('沒有資料可匯出')
    }

    // Prepare headers and rows
    const headers = Object.keys(data[0])
    const rows = data.map(row => headers.map(h => row[h] ?? ''))

    // Create spreadsheet
    const createResponse = await this.apiRequest(`${this.API_BASE}/spreadsheets`, {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title,
          locale: 'zh_TW',
          timeZone: 'Asia/Taipei'
        },
        sheets: [{
          properties: {
            title: sheetName,
            gridProperties: {
              rowCount: rows.length + 1,
              columnCount: headers.length
            }
          }
        }]
      })
    })

    const spreadsheetId = createResponse.spreadsheetId

    // Add data to sheet
    await this.apiRequest(
      `${this.API_BASE}/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:${String.fromCharCode(65 + headers.length - 1)}${rows.length + 1}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({
          values: [headers, ...rows]
        })
      }
    )

    // Format header row (bold, background color)
    await this.apiRequest(
      `${this.API_BASE}/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.0, green: 0.44, blue: 0.89 },
                    textFormat: {
                      foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                      bold: true
                    }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: 0,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: headers.length
                }
              }
            }
          ]
        })
      }
    )

    return {
      spreadsheetId,
      spreadsheetUrl: createResponse.spreadsheetUrl,
      title
    }
  }

  /**
   * Append data to existing spreadsheet
   */
  async appendToSpreadsheet(
    spreadsheetId: string,
    sheetName: string,
    data: any[]
  ): Promise<void> {
    if (!data || data.length === 0) {
      throw new Error('沒有資料可匯出')
    }

    const headers = Object.keys(data[0])
    const rows = data.map(row => headers.map(h => row[h] ?? ''))

    await this.apiRequest(
      `${this.API_BASE}/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=RAW`,
      {
        method: 'POST',
        body: JSON.stringify({
          values: rows
        })
      }
    )
  }

  /**
   * List user's spreadsheets
   */
  async listSpreadsheets(limit: number = 10): Promise<any[]> {
    const response = await this.apiRequest(
      `${this.DRIVE_API_BASE}/files?q=mimeType='application/vnd.google-apps.spreadsheet'&pageSize=${limit}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,webViewLink)`
    )

    return response.files || []
  }

  /**
   * Export revenue report to Google Sheets
   */
  async exportRevenueReport(data: any[], filename?: string): Promise<SpreadsheetCreateResponse> {
    const title = filename || `營收報表_${new Date().toISOString().split('T')[0]}`

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

    const formattedData = data.map(item => {
      const formatted: any = {}
      for (const [key, label] of Object.entries(fieldMapping)) {
        formatted[label] = item[key]
      }
      return formatted
    })

    return this.createSpreadsheet(title, '營收報表', formattedData)
  }

  /**
   * Export member growth report to Google Sheets
   */
  async exportMemberGrowthReport(data: any[], filename?: string): Promise<SpreadsheetCreateResponse> {
    const title = filename || `會員成長報表_${new Date().toISOString().split('T')[0]}`

    const fieldMapping = {
      join_day: '日期',
      branch_name: '分店名稱',
      new_members: '新增會員數',
      active_members: '活躍會員數',
      male_count: '男性會員數',
      female_count: '女性會員數',
      sales_persons_involved: '銷售人員數'
    }

    const formattedData = data.map(item => {
      const formatted: any = {}
      for (const [key, label] of Object.entries(fieldMapping)) {
        formatted[label] = item[key]
      }
      return formatted
    })

    return this.createSpreadsheet(title, '會員成長報表', formattedData)
  }

  /**
   * Export contract expiry report to Google Sheets
   */
  async exportContractExpiryReport(data: any[], filename?: string): Promise<SpreadsheetCreateResponse> {
    const title = filename || `合約到期提醒_${new Date().toISOString().split('T')[0]}`

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

    const formattedData = data.map(item => {
      const formatted: any = {}
      for (const [key, label] of Object.entries(fieldMapping)) {
        formatted[label] = item[key]
      }
      return formatted
    })

    return this.createSpreadsheet(title, '合約到期提醒', formattedData)
  }

  /**
   * Export member activity report to Google Sheets
   */
  async exportMemberActivityReport(data: any[], filename?: string): Promise<SpreadsheetCreateResponse> {
    const title = filename || `會員活躍度報表_${new Date().toISOString().split('T')[0]}`

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

    const formattedData = data.map(item => {
      const formatted: any = {}
      for (const [key, label] of Object.entries(fieldMapping)) {
        formatted[label] = item[key]
      }
      return formatted
    })

    return this.createSpreadsheet(title, '會員活躍度報表', formattedData)
  }
}

/**
 * Composable for using Google Sheets exporter
 */
export const useGoogleSheets = () => {
  const exporter = new GoogleSheetsExporter()

  return {
    isAuthenticated: () => exporter.isAuthenticated(),
    authenticate: () => exporter.authenticate(),
    logout: () => exporter.logout(),
    createSpreadsheet: (title: string, sheetName: string, data: any[]) =>
      exporter.createSpreadsheet(title, sheetName, data),
    appendToSpreadsheet: (spreadsheetId: string, sheetName: string, data: any[]) =>
      exporter.appendToSpreadsheet(spreadsheetId, sheetName, data),
    listSpreadsheets: (limit?: number) => exporter.listSpreadsheets(limit),
    exportRevenueReport: (data: any[], filename?: string) =>
      exporter.exportRevenueReport(data, filename),
    exportMemberGrowthReport: (data: any[], filename?: string) =>
      exporter.exportMemberGrowthReport(data, filename),
    exportContractExpiryReport: (data: any[], filename?: string) =>
      exporter.exportContractExpiryReport(data, filename),
    exportMemberActivityReport: (data: any[], filename?: string) =>
      exporter.exportMemberActivityReport(data, filename)
  }
}
