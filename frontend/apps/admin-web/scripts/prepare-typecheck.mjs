import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tsconfigPath = resolve(__dirname, '../.nuxt/tsconfig.json')
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

const excludes = new Set(tsconfig.exclude || [])
for (const pattern of [
  '../app/**/*.test.ts',
  '../app/**/*.test.tsx',
  '../app/**/*.spec.ts',
  '../app/**/*.spec.tsx'
]) {
  excludes.add(pattern)
}

tsconfig.exclude = [...excludes]

writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`)
