import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  buildPermissionRules,
  generatePermissions,
  mergeSettings,
} from '../../bin/lib/permissions.mjs'
import { setDryRun } from '../../bin/lib/state.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// buildPermissionRules
// ---------------------------------------------------------------------------

describe('buildPermissionRules', () => {
  it('should return base permissions when no features specified', () => {
    const rules = buildPermissionRules([])
    assert.ok(rules.includes('Bash(node:*)'), 'Should include Bash(node:*)')
    assert.ok(rules.includes('Bash(npx playwright test:*)'), 'Should include playwright bash')
    assert.ok(rules.includes('Bash(npx tsc:*)'), 'Should include tsc bash')
    assert.ok(rules.includes('Read(.sparq/**)'), 'Should include Read .sparq')
    assert.ok(rules.includes('Write(.sparq/**)'), 'Should include Write .sparq')
    assert.ok(rules.includes('Read(.claude/**)'), 'Should include Read .claude')
    assert.ok(rules.includes('Read(sparq.config.json)'), 'Should include Read sparq.config.json')
    assert.equal(rules.length, 7, 'Should have exactly 7 base permissions')
  })

  it('should return base permissions when called with no arguments', () => {
    const rules = buildPermissionRules()
    assert.equal(rules.length, 7, 'Default call should return 7 base permissions')
  })

  it('should add MCP permission for jira feature', () => {
    const rules = buildPermissionRules(['jira'])
    assert.ok(rules.includes('mcp__atlassian__*'), 'Should include atlassian MCP pattern')
  })

  it('should add MCP permission for confluence feature', () => {
    const rules = buildPermissionRules(['confluence'])
    assert.ok(rules.includes('mcp__atlassian__*'), 'Should include atlassian MCP pattern')
  })

  it('should deduplicate when jira and confluence both map to atlassian', () => {
    const rules = buildPermissionRules(['jira', 'confluence'])
    const atlassianCount = rules.filter((r) => r === 'mcp__atlassian__*').length
    assert.equal(atlassianCount, 1, 'Should have exactly one atlassian MCP entry')
    // 6 base + 1 atlassian
    assert.equal(rules.length, 8, 'Should have 8 total permissions (deduplicated)')
  })

  it('should add multiple MCP permissions for multiple features', () => {
    const rules = buildPermissionRules(['playwright-cli', 'figma', 'testrail'])
    assert.ok(
      rules.includes('Bash(npx playwright screenshot:*)'),
      'Should include playwright CLI perms',
    )
    assert.ok(rules.includes('mcp__figma__*'), 'Should include figma')
    assert.ok(rules.includes('mcp__testrail__*'), 'Should include testrail')
    // 7 base + 4 playwright-cli perms + 2 MCP = 13
    assert.equal(rules.length, 13, 'Should have 7 base + 4 playwright-cli + 2 MCP permissions')
  })

  it('should not add MCP permission for tms-local feature', () => {
    const rules = buildPermissionRules(['tms-local'])
    assert.equal(rules.length, 7, 'tms-local should not add any MCP permissions')
  })

  it('should ignore features with no MCP mapping', () => {
    const rules = buildPermissionRules(['core', 'manual-tests', 'e2e'])
    assert.equal(rules.length, 7, 'Features without MCP mapping should not add permissions')
  })
})

// ---------------------------------------------------------------------------
// mergeSettings
// ---------------------------------------------------------------------------

describe('mergeSettings', () => {
  it('should create permissions from scratch when existing is empty object', () => {
    const result = mergeSettings({}, ['Bash(node:*)', 'Read(.sparq/**)'])
    assert.deepEqual(result, {
      permissions: { allow: ['Bash(node:*)', 'Read(.sparq/**)'] },
    })
  })

  it('should create permissions when existing has no permissions key', () => {
    const existing = { someOtherKey: 'value' }
    const result = mergeSettings(existing, ['Bash(node:*)'])
    assert.equal(result.someOtherKey, 'value', 'Should preserve other keys')
    assert.deepEqual(result.permissions, { allow: ['Bash(node:*)'] })
  })

  it('should preserve existing permissions and add new ones', () => {
    const existing = {
      permissions: {
        allow: ['Edit(**)', 'Bash(git:*)'],
      },
    }
    const result = mergeSettings(existing, ['Bash(node:*)', 'Read(.sparq/**)'])
    assert.deepEqual(result.permissions.allow, [
      'Edit(**)',
      'Bash(git:*)',
      'Bash(node:*)',
      'Read(.sparq/**)',
    ])
  })

  it('should deduplicate when merging overlapping permissions', () => {
    const existing = {
      permissions: {
        allow: ['Bash(node:*)', 'Edit(**)'],
      },
    }
    const result = mergeSettings(existing, ['Bash(node:*)', 'Read(.sparq/**)'])
    const nodeCount = result.permissions.allow.filter((p) => p === 'Bash(node:*)').length
    assert.equal(nodeCount, 1, 'Should not duplicate Bash(node:*)')
    assert.equal(result.permissions.allow.length, 3, 'Should have 3 unique permissions')
  })

  it('should not modify the original existing object', () => {
    const existing = {
      permissions: { allow: ['Edit(**)'] },
    }
    const originalAllow = [...existing.permissions.allow]
    mergeSettings(existing, ['Bash(node:*)'])
    assert.deepEqual(existing.permissions.allow, originalAllow, 'Original should be unmodified')
  })

  it('should handle permissions object without allow array', () => {
    const existing = { permissions: { deny: ['something'] } }
    const result = mergeSettings(existing, ['Bash(node:*)'])
    assert.deepEqual(result.permissions.allow, ['Bash(node:*)'])
    assert.deepEqual(result.permissions.deny, ['something'], 'Should preserve deny key')
  })
})

// ---------------------------------------------------------------------------
// generatePermissions
// ---------------------------------------------------------------------------

describe('generatePermissions', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    setDryRun(false)
  })

  afterEach(() => {
    setDryRun(false)
    cleanTempDir(tempDir)
  })

  it('should create new settings file when none exists', () => {
    const result = generatePermissions(tempDir, { features: [] })

    assert.ok(result.created, 'Should report file as created')
    assert.ok(!result.merged, 'Should not report as merged')

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    assert.ok(existsSync(settingsPath), 'Settings file should exist')

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(Array.isArray(settings.permissions.allow), 'Should have allow array')
    assert.ok(
      settings.permissions.allow.includes('Bash(node:*)'),
      'Should include base permissions',
    )
  })

  it('should create .claude directory if it does not exist', () => {
    const claudeDir = join(tempDir, '.claude')
    assert.ok(!existsSync(claudeDir), '.claude should not exist initially')

    generatePermissions(tempDir, { features: [] })

    assert.ok(existsSync(claudeDir), '.claude directory should be created')
  })

  it('should include CLI permissions for playwright-cli feature', () => {
    generatePermissions(tempDir, { features: ['playwright-cli', 'figma'] })

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(
      settings.permissions.allow.includes('Bash(npx playwright screenshot:*)'),
      'Should include playwright CLI perms',
    )
    assert.ok(settings.permissions.allow.includes('mcp__figma__*'), 'Should include figma MCP')
  })

  it('should merge into existing settings file', () => {
    // Create existing settings
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const settingsPath = join(claudeDir, 'settings.local.json')
    const existing = {
      permissions: { allow: ['Edit(**)', 'Bash(git:*)'] },
      customKey: 'preserved',
    }
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2))

    const result = generatePermissions(tempDir, { features: [] })

    assert.ok(!result.created, 'Should not report as created')
    assert.ok(result.merged, 'Should report as merged')

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(
      settings.permissions.allow.includes('Edit(**)'),
      'Should preserve existing Edit permission',
    )
    assert.ok(
      settings.permissions.allow.includes('Bash(git:*)'),
      'Should preserve existing Bash(git:*) permission',
    )
    assert.ok(
      settings.permissions.allow.includes('Bash(node:*)'),
      'Should add SparQ base permissions',
    )
    assert.equal(settings.customKey, 'preserved', 'Should preserve custom keys')
  })

  it('should clean up backup after successful write', () => {
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const settingsPath = join(claudeDir, 'settings.local.json')
    const originalContent = JSON.stringify({ permissions: { allow: ['Edit(**)'] } }, null, 2)
    writeFileSync(settingsPath, originalContent)

    generatePermissions(tempDir, { features: [] })

    const backupPath = `${settingsPath}.bak`
    assert.ok(!existsSync(backupPath), 'Backup file should be cleaned up after successful write')
  })

  it('should not create backup when no existing file', () => {
    generatePermissions(tempDir, { features: [] })

    const backupPath = join(tempDir, '.claude', 'settings.local.json.bak')
    assert.ok(!existsSync(backupPath), 'Backup should not exist when no original file')
  })

  it('should write nothing in dry-run mode', () => {
    setDryRun(true)

    generatePermissions(tempDir, { features: [] })

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    assert.ok(!existsSync(settingsPath), 'Settings file should not be created in dry-run mode')
  })

  it('should not create backup in dry-run mode for existing file', () => {
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const settingsPath = join(claudeDir, 'settings.local.json')
    writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: [] } }))

    setDryRun(true)

    generatePermissions(tempDir, { features: [] })

    const backupPath = `${settingsPath}.bak`
    assert.ok(!existsSync(backupPath), 'Backup should not be created in dry-run mode')
  })

  it('should handle invalid JSON in existing settings file', () => {
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const settingsPath = join(claudeDir, 'settings.local.json')
    writeFileSync(settingsPath, '{ not valid json !!!')

    generatePermissions(tempDir, { features: [] })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(
      Array.isArray(settings.permissions.allow),
      'Should create valid settings despite invalid original',
    )
    assert.ok(
      settings.permissions.allow.includes('Bash(node:*)'),
      'Should include base permissions',
    )
  })

  it('should produce valid JSON with trailing newline', () => {
    generatePermissions(tempDir, { features: [] })

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    const raw = readFileSync(settingsPath, 'utf-8')
    assert.ok(raw.endsWith('\n'), 'File should end with newline')
    assert.doesNotThrow(() => JSON.parse(raw), 'File should contain valid JSON')
  })

  it('should use default empty features when options omitted', () => {
    generatePermissions(tempDir)

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.equal(settings.permissions.allow.length, 7, 'Should have 7 base permissions')
  })

  it('should be idempotent when run twice with same features', () => {
    generatePermissions(tempDir, { features: ['playwright-cli'] })
    const first = readFileSync(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')

    generatePermissions(tempDir, { features: ['playwright-cli'] })
    const second = readFileSync(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')

    assert.equal(second, first, 'Running twice should produce identical output')
  })
})

// ---------------------------------------------------------------------------
// buildPermissionRules — Cypress framework
// ---------------------------------------------------------------------------

describe('buildPermissionRules — Cypress framework', () => {
  it('should add Cypress run permission when framework is cypress', () => {
    const rules = buildPermissionRules([], { framework: 'cypress' })
    assert.ok(rules.includes('Bash(npx cypress run:*)'), 'Should include Cypress run permission')
  })

  it('should still include Playwright test permission as base', () => {
    const rules = buildPermissionRules([], { framework: 'cypress' })
    assert.ok(
      rules.includes('Bash(npx playwright test:*)'),
      'Should include Playwright test permission as base',
    )
  })

  it('should have 8 permissions with cypress framework', () => {
    const rules = buildPermissionRules([], { framework: 'cypress' })
    assert.equal(rules.length, 8, 'Should have 7 base + 1 cypress permission')
  })

  it('should not add Cypress permission when framework is playwright', () => {
    const rules = buildPermissionRules([], { framework: 'playwright' })
    assert.ok(
      !rules.includes('Bash(npx cypress run:*)'),
      'Should not include Cypress run permission for playwright framework',
    )
    assert.equal(rules.length, 7, 'Should have only 7 base permissions')
  })

  it('should not add Cypress permission when no framework specified', () => {
    const rules = buildPermissionRules([])
    assert.ok(
      !rules.includes('Bash(npx cypress run:*)'),
      'Should not include Cypress run permission when no framework specified',
    )
    assert.equal(rules.length, 7, 'Should have only 7 base permissions')
  })
})

// ---------------------------------------------------------------------------
// generatePermissions — Cypress framework
// ---------------------------------------------------------------------------

describe('generatePermissions — Cypress framework', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    setDryRun(false)
  })

  afterEach(() => {
    setDryRun(false)
    cleanTempDir(tempDir)
  })

  it('should include Cypress permission when framework option is cypress', () => {
    generatePermissions(tempDir, { features: [], framework: 'cypress' })

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(
      settings.permissions.allow.includes('Bash(npx cypress run:*)'),
      'Should include Cypress run permission',
    )
  })

  it('should not include Cypress permission when framework is playwright', () => {
    generatePermissions(tempDir, { features: [], framework: 'playwright' })

    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.ok(
      !settings.permissions.allow.includes('Bash(npx cypress run:*)'),
      'Should not include Cypress run permission for playwright framework',
    )
  })
})
