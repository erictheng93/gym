/**
 * Migration Runner
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hr_user:hr_password@localhost:5432/hr_db'
})

async function createMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `)
}

async function getExecutedMigrations(): Promise<string[]> {
  const result = await pool.query('SELECT name FROM _migrations ORDER BY id')
  return result.rows.map(row => row.name)
}

async function runMigration(filename: string): Promise<void> {
  const filePath = path.join(__dirname, filename)
  const sql = fs.readFileSync(filePath, 'utf-8')

  console.log(`Running migration: ${filename}`)

  await pool.query('BEGIN')
  try {
    await pool.query(sql)
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [filename])
    await pool.query('COMMIT')
    console.log(`  ✓ Migration completed: ${filename}`)
  } catch (error) {
    await pool.query('ROLLBACK')
    console.error(`  ✗ Migration failed: ${filename}`)
    throw error
  }
}

async function getMigrationFiles(): Promise<string[]> {
  const files = fs.readdirSync(__dirname)
  return files
    .filter(f => f.endsWith('.sql'))
    .sort()
}

async function migrateUp(): Promise<void> {
  await createMigrationsTable()

  const executed = await getExecutedMigrations()
  const migrations = await getMigrationFiles()

  const pending = migrations.filter(m => !executed.includes(m))

  if (pending.length === 0) {
    console.log('No pending migrations')
    return
  }

  console.log(`Found ${pending.length} pending migration(s)`)

  for (const migration of pending) {
    await runMigration(migration)
  }

  console.log('All migrations completed')
}

async function migrateDown(): Promise<void> {
  const executed = await getExecutedMigrations()

  if (executed.length === 0) {
    console.log('No migrations to rollback')
    return
  }

  const lastMigration = executed[executed.length - 1]
  console.log(`Rolling back: ${lastMigration}`)

  // Note: This is a simple implementation. In production, you'd want
  // to have separate down migration files.
  await pool.query('DELETE FROM _migrations WHERE name = $1', [lastMigration])
  console.log(`  ✓ Rolled back: ${lastMigration}`)
}

async function main(): Promise<void> {
  const command = process.argv[2] || 'up'

  try {
    if (command === 'up') {
      await migrateUp()
    } else if (command === 'down') {
      await migrateDown()
    } else {
      console.log('Usage: npm run migrate [up|down]')
    }
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
