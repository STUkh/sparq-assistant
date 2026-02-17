import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  runCli,
} from '../helpers/setup.mjs'

describe('File manifest (.sparq/.manifest.json)', () => {
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

  it('should create .sparq/.manifest.json after init', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    assert.ok(
      existsSync(join(tempDir, '.sparq', '.manifest.json')),
      '.sparq/.manifest.json should exist after init',
    )
  })

  it('should contain agent file hashes in manifest', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    const manifest = readJsonFile(tempDir, '.sparq/.manifest.json')

    assert.ok(manifest !== null, 'Manifest should be readable JSON')
    assert.ok(
      '.claude/agents/sparq-orchestrator.md' in manifest,
      'Manifest should contain sparq-orchestrator.md hash',
    )
    assert.ok(
      '.claude/agents/sparq-test-validator.md' in manifest,
      'Manifest should contain sparq-test-validator.md hash',
    )
  })

  it('should contain SHA-256 hashes (64 hex characters) in manifest', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    const manifest = readJsonFile(tempDir, '.sparq/.manifest.json')

    const hashRegex = /^[a-f0-9]{64}$/
    for (const [key, value] of Object.entries(manifest)) {
      if (key === 'mcpServersAdded') continue // metadata, not a file hash
      assert.match(value, hashRegex, `Hash for "${key}" should be a 64-character hex string`)
    }
  })

  it('should contain skill file hashes in manifest', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    const manifest = readJsonFile(tempDir, '.sparq/.manifest.json')

    // Check that at least one skill file is tracked
    const skillKeys = Object.keys(manifest).filter((k) => k.startsWith('.claude/skills/'))
    assert.ok(skillKeys.length > 0, 'Manifest should contain at least one skill file hash')
  })

  it('should contain template file hashes in manifest', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    const manifest = readJsonFile(tempDir, '.sparq/.manifest.json')

    const templateKeys = Object.keys(manifest).filter((k) => k.startsWith('.claude/templates/'))
    assert.ok(templateKeys.length > 0, 'Manifest should contain at least one template file hash')
  })

  it('should track the expected total number of files in manifest', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    const manifest = readJsonFile(tempDir, '.sparq/.manifest.json')

    const totalFiles = Object.keys(manifest).length
    // 5 agents + skill files + template files — should be at least 15
    assert.ok(totalFiles >= 15, `Manifest should track at least 15 files, found ${totalFiles}`)
  })

  it('should refresh manifest after update', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const manifestBefore = readJsonFile(tempDir, '.sparq/.manifest.json')
    const keysBefore = Object.keys(manifestBefore)

    // Run update (force to skip prompts)
    await runCli(['update', '--non-interactive', '--force', tempDir])

    const manifestAfter = readJsonFile(tempDir, '.sparq/.manifest.json')
    const keysAfter = Object.keys(manifestAfter)

    // Same files should be tracked
    assert.equal(
      keysAfter.length,
      keysBefore.length,
      'Manifest should track the same number of files after update',
    )
  })

  it('should detect modification when an agent file is changed', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    // Modify an agent file
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    const original = readFileSync(agentPath, 'utf-8')
    writeFileSync(agentPath, `${original}\n\n# User customization\n`)

    // Run update with force — output should mention modified files
    const { stdout } = await runCli(['update', '--non-interactive', '--force', tempDir])
    assert.ok(
      stdout.includes('modified') || stdout.includes('updated') || stdout.includes('overwrite'),
      'Should detect or handle the modified agent file during update',
    )
  })
})
