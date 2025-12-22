/**
 * 日期格式化工具
 */

export interface DateFormatOptions {
  /** 是否包含年份 */
  year?: boolean
  /** 是否包含時間 */
  time?: boolean
  /** 語言 */
  locale?: string
}

/**
 * 格式化日期為繁體中文格式
 *
 * @example
 * formatDate('2024-01-15') // '2024年1月15日'
 * formatDate('2024-01-15', { year: false }) // '1月15日'
 * formatDate('2024-01-15T10:30:00', { time: true }) // '2024年1月15日 10:30'
 */
export function formatDate(
  dateStr: string | Date | null | undefined,
  options: DateFormatOptions = {}
): string {
  if (!dateStr) return '—'

  const { year = true, time = false, locale = 'zh-TW' } = options
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

  if (isNaN(date.getTime())) return '—'

  const dateOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric'
  }

  if (year) {
    dateOptions.year = 'numeric'
  }

  if (time) {
    dateOptions.hour = '2-digit'
    dateOptions.minute = '2-digit'
  }

  return date.toLocaleDateString(locale, dateOptions)
}

/**
 * 格式化相對時間
 *
 * @example
 * formatRelativeTime(new Date()) // '剛剛'
 * formatRelativeTime(new Date(Date.now() - 3600000)) // '1 小時前'
 */
export function formatRelativeTime(
  date: Date | string,
  locale = 'zh-TW'
): string {
  const now = new Date()
  const target = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - target.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '剛剛'
  if (diffMin < 60) return `${diffMin} 分鐘前`
  if (diffHour < 24) return `${diffHour} 小時前`
  if (diffDay < 7) return `${diffDay} 天前`

  return formatDate(target, { locale })
}

/**
 * 格式化貨幣
 *
 * @example
 * formatCurrency(1000) // 'NT$ 1,000'
 * formatCurrency(1000, { currency: 'USD' }) // 'US$ 1,000'
 */
export function formatCurrency(
  amount: number | null | undefined,
  options: { currency?: string; locale?: string } = {}
): string {
  if (amount == null) return '—'

  const { currency = 'TWD', locale = 'zh-TW' } = options

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

/**
 * 格式化數字（加千分位）
 *
 * @example
 * formatNumber(1000) // '1,000'
 */
export function formatNumber(
  num: number | null | undefined,
  locale = 'zh-TW'
): string {
  if (num == null) return '—'
  return new Intl.NumberFormat(locale).format(num)
}

/**
 * 格式化電話號碼
 *
 * @example
 * formatPhone('0912345678') // '0912-345-678'
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'

  // 台灣手機格式
  if (phone.match(/^09\d{8}$/)) {
    return `${phone.slice(0, 4)}-${phone.slice(4, 7)}-${phone.slice(7)}`
  }

  // 台灣市話格式
  if (phone.match(/^0\d{8,9}$/)) {
    const areaCode = phone.slice(0, 2)
    const rest = phone.slice(2)
    return `${areaCode}-${rest}`
  }

  return phone
}
