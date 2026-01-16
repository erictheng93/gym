/**
 * Cross-platform utility functions for test scripts
 */

// ANSI color codes for terminal output
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

export function log(message: string): void {
  console.log(message)
}

export function logSuccess(message: string): void {
  console.log(`${colors.green}✅ ${message}${colors.reset}`)
}

export function logError(message: string): void {
  console.log(`${colors.red}❌ ${message}${colors.reset}`)
}

export function logWarning(message: string): void {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`)
}

export function logInfo(message: string): void {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`)
}

export function logTest(message: string): void {
  console.log(`${colors.blue}🧪 ${message}${colors.reset}`)
}

export function logSection(title: string): void {
  console.log('')
  console.log(`${colors.bold}${'━'.repeat(50)}${colors.reset}`)
  console.log(`${colors.bold}${title}${colors.reset}`)
  console.log(`${colors.bold}${'━'.repeat(50)}${colors.reset}`)
}

export function logSeparator(): void {
  console.log('─'.repeat(50))
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getToday(): string {
  return formatDate(new Date())
}

/**
 * Add days to a date and return as YYYY-MM-DD
 */
export function addDays(date: Date, days: number): string {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return formatDate(result)
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Pretty print JSON
 */
export function prettyJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

/**
 * Truncate string for display
 */
export function truncate(str: string, length: number = 20): string {
  if (str.length <= length) return str
  return str.substring(0, length) + '...'
}
