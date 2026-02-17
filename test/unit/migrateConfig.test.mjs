import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MIGRATIONS } from '../../bin/lib/config.mjs'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  runCli,
} from '../helpers/setup.mjs'

describe('Config migration via update command', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      dependencies: { vue: '^3.4.0' },
      devDependencies: { typescript: '^5.3.0' },
      withGit: true,
    })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should not re-migrate config already at current version (idempotent)', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const configBefore = readJsonFile(tempDir, 'sparq.config.json')

    const { stdout } = await runCli(['update', '--non-interactive', '--force', tempDir])

    const configAfter = readJsonFile(tempDir, 'sparq.config.json')
    assert.equal(
      configAfter.version,
      configBefore.version,
      'Config version should remain unchanged',
    )
    assert.ok(
      !stdout.includes('Migrating config'),
      'Should not mention migration for already-current config',
    )
  })
})

describe('MIGRATIONS object', () => {
  it('should be an object', () => {
    assert.equal(typeof MIGRATIONS, 'object')
  })

  it('should have valid entries if any exist', () => {
    for (const [key, entry] of Object.entries(MIGRATIONS)) {
      assert.equal(typeof entry.target, 'string', `${key} should have string target`)
      assert.equal(typeof entry.migrate, 'function', `${key} should have migrate function`)
    }
  })
})
