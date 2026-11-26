/**
 * Format a Date as YYYY-MM-DD using its LOCAL calendar fields.
 * (Date#toISOString() yields the UTC date, which is the previous day
 * before 08:00 in UTC+8.)
 */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
