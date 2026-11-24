// Run: bun test scripts/lib/docker.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dockerExec, execSql, getContainerLogs, isContainerRunning } from './docker'

const hostile = ['--privileged', '-it', 'a b', 'x;rm -rf /', '$(id)', '']

test('container names that docker would parse as options or shell are rejected', async () => {
  const invalid = { message: /Invalid container name/ }
  for (const name of hostile) {
    await assert.rejects(dockerExec(name, ['true']), invalid)
    await assert.rejects(execSql('select 1', { container: name }), invalid)
    await assert.rejects(getContainerLogs(name), invalid)
    await assert.rejects(isContainerRunning(name), invalid)
  }
})
