import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  runCli,
} from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create and init a mock project for update testing.
 */
async function initProject(tempDir) {
  createMockProject(tempDir, {
    name: 'update-unit-test',
    dependencies: { vue: '^3.4.0' },
    devDependencies: { '@playwright/test': '^1.40.0' },
    withGit: true,
  })
  const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
  assert.equal(exitCode, 0, 'Init should succeed before update tests')
}

// ---------------------------------------------------------------------------
// Category filtering (--only)
// ---------------------------------------------------------------------------

describe('update command — category filtering (--only)', () => {
  let tempDir

  before(async () => {
    tempDir = createTempDir()
    await initProject(tempDir)
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should update only agents when --only agents', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# SENTINEL_AGENT', 'utf-8')

    const skillFile = join(tempDir, '.claude', 'skills', 'sparq-analyze', 'SKILL.md')
    if (existsSync(skillFile)) writeFileSync(skillFile, '# SENTINEL_SKILL', 'utf-8')

    const { exitCode } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=agents',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --only=agents should exit 0')

    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(!agentContent.includes('SENTINEL_AGENT'), 'Agent file should be overwritten')

    if (existsSync(skillFile)) {
      const skillContent = readFileSync(skillFile, 'utf-8')
      assert.ok(skillContent.includes('SENTINEL_SKILL'), 'Skill file should NOT be overwritten')
    }
  })

  it('should update only skills when --only skills', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# SENTINEL_AGENT_2', 'utf-8')

    const { exitCode } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=skills',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --only=skills should exit 0')

    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(agentContent.includes('SENTINEL_AGENT_2'), 'Agent file should be preserved')
  })

  it('should update only templates when --only templates', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# SENTINEL_AGENT_3', 'utf-8')

    const { exitCode, stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=templates',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --only=templates should exit 0')

    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(agentContent.includes('SENTINEL_AGENT_3'), 'Agent file should be preserved')

    assert.ok(
      stdout.includes('Updated categories') && stdout.includes('templates'),
      'Should report templates as updated category',
    )
  })

  it('should update only config when --only config', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# SENTINEL_AGENT_4', 'utf-8')

    const { exitCode } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=config',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --only=config should exit 0')

    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(agentContent.includes('SENTINEL_AGENT_4'), 'Agent file should be preserved')
  })

  it('should reject unknown --only category with non-zero exit', async () => {
    const { exitCode, stdout, stderr } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=bogus',
      tempDir,
    ])

    assert.equal(exitCode, 2, 'Unknown --only category should exit with EXIT_USAGE (2)')

    const output = stdout + stderr
    assert.ok(
      output.includes('Unknown update categories') || output.includes('bogus'),
      'Should mention the invalid category name',
    )
  })
})

// ---------------------------------------------------------------------------
// Category filtering (--skip)
// ---------------------------------------------------------------------------

describe('update command — category filtering (--skip)', () => {
  let tempDir

  before(async () => {
    tempDir = createTempDir()
    await initProject(tempDir)
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should skip agents when --skip agents', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# SKIP_SENTINEL', 'utf-8')

    const { exitCode, stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--skip=agents',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --skip=agents should exit 0')

    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(agentContent.includes('SKIP_SENTINEL'), 'Agent file should be preserved')

    assert.ok(
      stdout.includes('Skipped categories') && stdout.includes('agents'),
      'Should report agents as skipped category',
    )
  })

  it('should reject unknown --skip category', async () => {
    const { exitCode, stdout, stderr } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--skip=invalid',
      tempDir,
    ])

    assert.equal(exitCode, 2, 'Unknown --skip category should exit with EXIT_USAGE (2)')

    const output = stdout + stderr
    assert.ok(
      output.includes('Unknown skip categories') || output.includes('invalid'),
      'Should mention the invalid skip category name',
    )
  })
})

// ---------------------------------------------------------------------------
// --only and --skip conflict
// ---------------------------------------------------------------------------

describe('update command — --only and --skip conflict', () => {
  let tempDir

  before(async () => {
    tempDir = createTempDir()
    await initProject(tempDir)
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should reject using both --only and --skip together', async () => {
    const { exitCode, stdout, stderr } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=agents',
      '--skip=config',
      tempDir,
    ])

    assert.equal(exitCode, 2, 'Using both --only and --skip should exit with EXIT_USAGE (2)')

    const output = stdout + stderr
    assert.ok(
      output.includes('Cannot use both') ||
        (output.includes('--only') && output.includes('--skip')),
      'Should report that --only and --skip cannot be combined',
    )
  })
})

// ---------------------------------------------------------------------------
// Modified file detection
// ---------------------------------------------------------------------------

describe('update command — modified file detection', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = createTempDir()
    await initProject(tempDir)
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should detect modified files in non-interactive mode', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# USER MODIFIED CONTENT', 'utf-8')

    const { exitCode, stdout } = await runCli(['update', '--non-interactive', tempDir])

    assert.equal(exitCode, 0, 'Update should still exit 0')

    const output = stdout
    assert.ok(
      output.includes('modified') || output.includes('Modified'),
      'Should detect modified files',
    )
  })

  it('should overwrite modified files with --force', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# FORCE_OVERWRITE_SENTINEL', 'utf-8')

    const { exitCode } = await runCli(['update', '--non-interactive', '--force', tempDir])

    assert.equal(exitCode, 0, 'Update --force should exit 0')

    const content = readFileSync(agentPath, 'utf-8')
    assert.ok(
      !content.includes('FORCE_OVERWRITE_SENTINEL'),
      'Modified file should be overwritten with --force',
    )
  })
})

// ---------------------------------------------------------------------------
// Config migration
// ---------------------------------------------------------------------------

describe('update command — config migration', () => {
  let tempDir

  before(async () => {
    tempDir = createTempDir()
    await initProject(tempDir)
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should not migrate config already at current version', async () => {
    const configPath = join(tempDir, 'sparq.config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    config.version = '1.0.0'
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    const { exitCode, stdout } = await runCli(['update', '--non-interactive', '--force', tempDir])

    assert.equal(exitCode, 0, 'Update should exit 0')
    assert.ok(
      !stdout.includes('Migrating config'),
      'Should not mention migration for current version',
    )

    const updatedConfig = readJsonFile(tempDir, 'sparq.config.json')
    assert.equal(updatedConfig.version, '1.0.0', 'Config version should remain 1.0.0')
  })
})

// ---------------------------------------------------------------------------
// Manifest update
// ---------------------------------------------------------------------------

describe('update command — manifest update', () => {
  let tempDir

  before(async () => {
    tempDir = createTempDir()
    await initProject(tempDir)
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should update .sparq/.manifest.json after update', async () => {
    const manifestPath = join(tempDir, '.sparq', '.manifest.json')
    assert.ok(existsSync(manifestPath), 'Manifest should exist after init')

    const { exitCode } = await runCli(['update', '--non-interactive', '--force', tempDir])

    assert.equal(exitCode, 0, 'Update should exit 0')
    assert.ok(existsSync(manifestPath), 'Manifest should still exist after update')

    const manifest = readJsonFile(tempDir, join('.sparq', '.manifest.json'))
    assert.ok(manifest && Object.keys(manifest).length > 0, 'Manifest should have tracked files')
  })
})

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

describe('update command — prerequisites', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should fail when target directory does not exist', async () => {
    const nonexistent = join(tempDir, 'does-not-exist')
    const { exitCode, stdout, stderr } = await runCli(['update', '--non-interactive', nonexistent])

    assert.notEqual(exitCode, 0, 'Update should fail for non-existent directory')

    const output = stdout + stderr
    assert.ok(
      output.includes('does not exist') || output.includes('not found'),
      'Should report that target directory does not exist',
    )
  })

  it('should fail when .claude/ directory does not exist', async () => {
    createMockProject(tempDir, { name: 'no-claude-dir', withGit: true })

    const { exitCode, stdout, stderr } = await runCli(['update', '--non-interactive', tempDir])

    assert.notEqual(exitCode, 0, 'Update should fail without .claude/ directory')

    const output = stdout + stderr
    assert.ok(
      output.includes('.claude') && output.includes('not found'),
      'Should report that .claude/ directory is missing',
    )
  })

  it('should succeed on valid installation', async () => {
    await initProject(tempDir)

    const { exitCode } = await runCli(['update', '--non-interactive', '--force', tempDir])

    assert.equal(exitCode, 0, 'Update should succeed on valid installation')
  })
})
