/**
 * Docker utilities for cross-platform container operations
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface ExecResult {
  stdout: string
  stderr: string
}

/**
 * Execute a command in a Docker container
 */
export async function dockerExec(
  container: string,
  command: string
): Promise<ExecResult> {
  const fullCommand = `docker exec ${container} ${command}`
  try {
    const result = await execAsync(fullCommand, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })
    return result
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `Docker exec failed: ${execError.message}\nstdout: ${execError.stdout}\nstderr: ${execError.stderr}`
    )
  }
}

/**
 * Execute SQL query in PostgreSQL container
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

  // Escape single quotes in query for shell
  const escapedQuery = query.replace(/'/g, "'\\''")
  const command = `psql -U ${user} -d ${database} -t -c '${escapedQuery}'`

  const result = await dockerExec(container, command)
  return result.stdout.trim()
}

/**
 * Execute SQL file in PostgreSQL container
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

  // For Windows compatibility, we need to use docker exec -i with stdin
  const command = `docker exec -i ${container} psql -U ${user} -d ${database} < ${filePath}`

  try {
    const result = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
    })
    return result.stdout
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `SQL file execution failed: ${execError.message}\nstderr: ${execError.stderr}`
    )
  }
}

/**
 * Get Docker container logs
 */
export async function getContainerLogs(
  container: string,
  tailLines: number = 50
): Promise<string> {
  const command = `docker logs ${container} --tail ${tailLines}`
  try {
    const result = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
    })
    // Docker logs output goes to stderr
    return result.stderr || result.stdout
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
    await execAsync('docker --version')
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
    const result = await execAsync(
      `docker inspect -f "{{.State.Running}}" ${container}`
    )
    return result.stdout.trim() === 'true'
  } catch {
    return false
  }
}
