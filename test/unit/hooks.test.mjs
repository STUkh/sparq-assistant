import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { checkHooks, installHooks } from '../../bin/lib/hooks.mjs'
import { setDryRun } from '../../bin/lib/state.mjs'
import { cleanTempDir, createOutputCapture, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Console capture (suppress output noise during tests)
// ---------------------------------------------------------------------------

const capture = createOutputCapture()

beforeEach(() => {
  capture.start()
  setDryRun(false)
})

afterEach(() => {
  capture.stop()
  setDryRun(false)
})

// ---------------------------------------------------------------------------
// installHooks
// ---------------------------------------------------------------------------

describe('installHooks', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    mkdirSync(join(tempDir, '.claude'), { recursive: true })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should create .claude/hooks/ directory', () => {
    installHooks(tempDir)
    assert.ok(existsSync(join(tempDir, '.claude', 'hooks')), '.claude/hooks/ should exist')
  })

  it('should copy both hook script files', () => {
    const result = installHooks(tempDir)
    assert.ok(existsSync(join(tempDir, '.claude', 'hooks', 'sparq-stop-guard.mjs')))
    assert.ok(existsSync(join(tempDir, '.claude', 'hooks', 'sparq-pre-compact.mjs')))
    assert.equal(result.installed.length, 2, 'Should report 2 installed files')
  })

  it('should merge hook config into settings.local.json', () => {
    installHooks(tempDir)
    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    assert.ok(existsSync(settingsPath), 'settings.local.json should exist')

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(settings.hooks?.Stop, 'Should have Stop hook config')
    assert.ok(settings.hooks?.PreCompact, 'Should have PreCompact hook config')
  })

  it('should preserve existing user entries in settings.local.json', () => {
    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({ customKey: 'preserved', permissions: { allow: ['Edit(**)'] } }, null, 2),
    )

    installHooks(tempDir)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.equal(settings.customKey, 'preserved', 'Should preserve custom keys')
    assert.deepEqual(settings.permissions, { allow: ['Edit(**)'] }, 'Should preserve permissions')
  })

  it('should skip existing scripts in default merge mode', () => {
    // First install
    installHooks(tempDir)
    readFileSync(join(tempDir, '.claude', 'hooks', 'sparq-stop-guard.mjs'), 'utf-8')

    // Modify one script to detect overwrites
    writeFileSync(join(tempDir, '.claude', 'hooks', 'sparq-stop-guard.mjs'), '// modified')

    // Second install — should skip
    const result = installHooks(tempDir)
    assert.equal(result.skipped.length, 2, 'Should skip both existing files')
    assert.equal(result.installed.length, 0, 'Should install zero files')

    const content = readFileSync(join(tempDir, '.claude', 'hooks', 'sparq-stop-guard.mjs'), 'utf-8')
    assert.equal(content, '// modified', 'Should not overwrite existing script')
  })

  it('should overwrite existing scripts with update option', () => {
    // First install + modify
    installHooks(tempDir)
    writeFileSync(join(tempDir, '.claude', 'hooks', 'sparq-stop-guard.mjs'), '// modified')

    // Second install with update: true
    const result = installHooks(tempDir, { update: true })
    assert.equal(result.installed.length, 2, 'Should report 2 installed (overwritten) files')

    const content = readFileSync(join(tempDir, '.claude', 'hooks', 'sparq-stop-guard.mjs'), 'utf-8')
    assert.notEqual(content, '// modified', 'Should overwrite with package version')
  })

  it('should create settings.local.json if it does not exist', () => {
    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    assert.ok(!existsSync(settingsPath), 'settings.local.json should not exist initially')

    installHooks(tempDir)

    assert.ok(existsSync(settingsPath), 'settings.local.json should be created')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(settings.hooks, 'Should contain hooks config')
  })

  it('should not duplicate hooks on repeated calls', () => {
    installHooks(tempDir)
    installHooks(tempDir)

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.equal(settings.hooks.Stop.length, 1, 'Should have exactly 1 Stop hook entry')
    assert.equal(settings.hooks.PreCompact.length, 1, 'Should have exactly 1 PreCompact hook entry')
  })
})

// ---------------------------------------------------------------------------
// checkHooks
// ---------------------------------------------------------------------------

describe('checkHooks', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should return ok when properly installed', () => {
    mkdirSync(join(tempDir, '.claude'), { recursive: true })
    installHooks(tempDir)

    const result = checkHooks(tempDir)
    assert.ok(result.ok, 'Should report ok')
    assert.equal(result.issues.length, 0, 'Should have no issues')
  })

  it('should return issues when hooks dir missing', () => {
    const result = checkHooks(tempDir)
    assert.ok(!result.ok, 'Should not be ok')
    assert.ok(
      result.issues.some((i) => i.includes('hooks') && i.includes('not found')),
      'Should report hooks directory missing',
    )
  })

  it('should return issues when script files missing', () => {
    mkdirSync(join(tempDir, '.claude', 'hooks'), { recursive: true })
    // Create settings with hook config but no script files
    writeFileSync(
      join(tempDir, '.claude', 'settings.local.json'),
      JSON.stringify({ hooks: { Stop: [{}], PreCompact: [{}] } }, null, 2),
    )

    const result = checkHooks(tempDir)
    assert.ok(!result.ok, 'Should not be ok')
    assert.ok(
      result.issues.some((i) => i.includes('sparq-stop-guard.mjs')),
      'Should report stop-guard missing',
    )
    assert.ok(
      result.issues.some((i) => i.includes('sparq-pre-compact.mjs')),
      'Should report pre-compact missing',
    )
  })

  it('should return issues when settings.local.json missing hook entries', () => {
    mkdirSync(join(tempDir, '.claude', 'hooks'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'hooks', 'sparq-stop-guard.mjs'), '// stub')
    writeFileSync(join(tempDir, '.claude', 'hooks', 'sparq-pre-compact.mjs'), '// stub')
    // settings.local.json exists but has no hooks
    writeFileSync(
      join(tempDir, '.claude', 'settings.local.json'),
      JSON.stringify({ permissions: {} }, null, 2),
    )

    const result = checkHooks(tempDir)
    assert.ok(!result.ok, 'Should not be ok')
    assert.ok(
      result.issues.some((i) => i.includes('Stop hook')),
      'Should report Stop hook missing',
    )
    assert.ok(
      result.issues.some((i) => i.includes('PreCompact hook')),
      'Should report PreCompact hook missing',
    )
  })
})
