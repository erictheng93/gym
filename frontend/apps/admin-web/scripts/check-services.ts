#!/usr/bin/env tsx
/**
 * 服务检查脚本 - 在运行 E2E 测试前检查所有必需的服务
 * Service Check Script - Verify all required services before running E2E tests
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface ServiceStatus {
  name: string
  url: string
  status: 'running' | 'stopped' | 'error'
  message?: string
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
}

async function checkUrl(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      signal: controller.signal,
      method: 'GET'
    })

    clearTimeout(timeoutId)
    return response.ok || response.status === 302
  } catch {
    return false
  }
}

async function checkBackend(): Promise<ServiceStatus> {
  const url = 'http://localhost:8056/health'
  const isRunning = await checkUrl(url, 3000)

  return {
    name: 'Backend API',
    url: 'http://localhost:8056',
    status: isRunning ? 'running' : 'stopped',
    message: isRunning ? '✓ Running' : '✗ Not running'
  }
}

async function checkFrontend(): Promise<ServiceStatus> {
  const url = 'http://localhost:3001'
  const isRunning = await checkUrl(url, 3000)

  return {
    name: 'Frontend (Nuxt)',
    url: 'http://localhost:3001',
    status: isRunning ? 'running' : 'stopped',
    message: isRunning ? '✓ Running' : '✗ Not running'
  }
}

async function checkDocker(): Promise<ServiceStatus> {
  try {
    await execAsync('docker ps')
    return {
      name: 'Docker Desktop',
      url: 'N/A',
      status: 'running',
      message: '✓ Running'
    }
  } catch {
    return {
      name: 'Docker Desktop',
      url: 'N/A',
      status: 'stopped',
      message: '✗ Not running or not installed'
    }
  }
}

function printHeader() {
  console.log(`\n${COLORS.bold}${COLORS.blue}${'='.repeat(60)}${COLORS.reset}`)
  console.log(`${COLORS.bold}${COLORS.blue}  E2E 测试环境检查 / E2E Test Environment Check${COLORS.reset}`)
  console.log(`${COLORS.bold}${COLORS.blue}${'='.repeat(60)}${COLORS.reset}\n`)
}

function printServiceStatus(service: ServiceStatus) {
  const statusColor = service.status === 'running' ? COLORS.green : COLORS.red
  const statusSymbol = service.status === 'running' ? '●' : '○'

  console.log(`${statusColor}${statusSymbol}${COLORS.reset} ${COLORS.bold}${service.name}${COLORS.reset}`)
  console.log(`  URL: ${service.url}`)
  console.log(`  Status: ${statusColor}${service.message}${COLORS.reset}\n`)
}

function printInstructions(services: ServiceStatus[]) {
  const allRunning = services.every(s => s.status === 'running')

  if (allRunning) {
    console.log(`${COLORS.green}${COLORS.bold}✓ All services are running!${COLORS.reset}`)
    console.log(`\nYou can now run E2E tests:`)
    console.log(`  ${COLORS.yellow}pnpm test:e2e${COLORS.reset}\n`)
    return
  }

  console.log(`${COLORS.yellow}${COLORS.bold}! Some services are not running${COLORS.reset}\n`)
  console.log(`Please start the following services:\n`)

  services.forEach(service => {
    if (service.status !== 'running') {
      if (service.name === 'Docker Desktop') {
        console.log(`${COLORS.red}1. Start Docker Desktop${COLORS.reset}`)
        console.log(`   - Open Docker Desktop application`)
        console.log(`   - Wait for it to fully start\n`)
      } else if (service.name.includes('Backend')) {
        console.log(`${COLORS.red}2. Start Backend Services${COLORS.reset}`)
        console.log(`   ${COLORS.yellow}cd backend${COLORS.reset}`)
        console.log(`   ${COLORS.yellow}docker-compose up -d${COLORS.reset}\n`)
      } else if (service.name.includes('Frontend')) {
        console.log(`${COLORS.red}3. Start Frontend Development Server${COLORS.reset}`)
        console.log(`   ${COLORS.yellow}cd frontend${COLORS.reset}`)
        console.log(`   ${COLORS.yellow}pnpm run dev${COLORS.reset}\n`)
      }
    }
  })

  console.log(`After starting all services, run this script again to verify:\n`)
  console.log(`  ${COLORS.yellow}pnpm run check-services${COLORS.reset}\n`)
}

async function main() {
  printHeader()

  console.log('Checking services...\n')

  const [docker, backend, frontend] = await Promise.all([
    checkDocker(),
    checkBackend(),
    checkFrontend()
  ])

  printServiceStatus(docker)
  printServiceStatus(backend)
  printServiceStatus(frontend)

  printInstructions([docker, backend, frontend])

  const allRunning = [docker, backend, frontend].every(s => s.status === 'running')
  process.exit(allRunning ? 0 : 1)
}

main().catch((error) => {
  console.error(`${COLORS.red}Error:${COLORS.reset}`, error)
  process.exit(1)
})
