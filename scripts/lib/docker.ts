/**
 * Docker utilities for cross-platform container operations
 */

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'

const execFileAsync = promisify(execFile)

export interface ExecResult {
  stdout: string
  stderr: string
}

/**
 * Execute a command in a Docker container safely using execFile
 */
export async function dockerExec(
  container: string,
  command: string | string[]
): Promise<ExecResult> {
  const cmdArgs = Array.isArray(command) ? command : ['sh', '-c', command]
  const args = ['exec', container, ...cmdArgs]
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })
    return { stdout: String(stdout), stderr: String(stderr) }
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `Docker exec failed: ${execError.message}\nstdout: ${execError.stdout}\nstderr: ${execError.stderr}`
    )
  }
}

/**
 * Execute SQL query in PostgreSQL container safely
 */
export async function execSql(
  query: string,
  options: {
    container?: string
    database?: string
    user?: string
  } = {}
): Promise<string> {
  const {
    container = 'backend-database-1',
    database = 'gym_nexus',
    user = 'directus',
  } = options

  const args = ['exec', container, 'psql', '-U', user, '-d', database, '-t', '-c', query]
  try {
    const { stdout } = await execFileAsync('docker', args, {
      maxBuffer: 10 * 1024 * 1024,
    })
    return String(stdout).trim()
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `SQL execution failed: ${execError.message}\nstdout: ${execError.stdout}\nstderr: ${execError.stderr}`
    )
  }
}

/**
 * Execute SQL file in PostgreSQL container using streams without shell redirection
 */
export async function execSqlFile(
  filePath: string,
  options: {
    container?: string
    database?: string
    user?: string
  } = {}
): Promise<string> {
  const {
    container = 'backend-database-1',
    database = 'gym_nexus',
    user = 'directus',
  } = options

  return new Promise((resolve, reject) => {
    const args = ['exec', '-i', container, 'psql', '-U', user, '-d', database]
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to start docker process: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`SQL file execution failed with code ${code}:\nstderr: ${stderr}`))
      } else {
        resolve(stdout)
      }
    })

    const readStream = fs.createReadStream(filePath)
    readStream.on('error', (err) => {
      child.kill()
      reject(new Error(`Failed to read SQL file ${filePath}: ${err.message}`))
    })
    readStream.pipe(child.stdin)
  })
}

/**
 * Get Docker container logs
 */
export async function getContainerLogs(
  container: string,
  tailLines: number = 50
): Promise<string> {
  const args = ['logs', container, '--tail', String(tailLines)]
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      maxBuffer: 10 * 1024 * 1024,
    })
    return String(stderr || stdout)
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error(`Failed to get container logs: ${execError.message}`)
  }
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['--version'])
    return true
  } catch {
    return false
  }
}

/**
 * Check if a container is running
 */
export async function isContainerRunning(container: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      '-f',
      '{{.State.Running}}',
      container,
    ])
    return String(stdout).trim() === 'true'
  } catch {
    return false
  }
}
