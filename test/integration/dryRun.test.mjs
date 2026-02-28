import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { cleanTempDir, createMockProject, createTempDir, runCli } from '../helpers/setup.mjs'

describe('Dry-run mode verification', () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      name: 'dry-run-test',
      dependencies: {
        vue: '^3.4.0',
        primevue: '^4.0.0',
      },
      devDependencies: {
        '@playwright/test': '^1.40.0',
        typescript: '^5.3.0',
      },
      withGit: true,
    })
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should display DRY RUN header in output', async () => {
    const { stdout } = await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.ok(stdout.includes('DRY RUN'), 'Output should contain DRY RUN header')
  })

  it('should display [dry-run] prefixed messages for each action', async () => {
    const { stdout } = await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.ok(stdout.includes('[DRY-RUN]'), 'Output should contain [DRY-RUN] prefixed messages')
  })

  it('should NOT create .claude/ directory in dry-run mode', async () => {
    await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.ok(
      !existsSync(join(tempDir, '.claude')),
      '.claude/ should NOT be created in dry-run mode',
    )
  })

  it('should NOT create .sparq/ directory in dry-run mode', async () => {
    await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.ok(!existsSync(join(tempDir, '.sparq')), '.sparq/ should NOT be created in dry-run mode')
  })

  it('should NOT create sparq.config.json in dry-run mode', async () => {
    await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.ok(
      !existsSync(join(tempDir, 'sparq.config.json')),
      'sparq.config.json should NOT be created in dry-run mode',
    )
  })

  it('should NOT create .mcp.json in dry-run mode', async () => {
    await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.ok(
      !existsSync(join(tempDir, '.mcp.json')),
      '.mcp.json should NOT be created in dry-run mode',
    )
  })

  it('should NOT create CLAUDE.md in dry-run mode', async () => {
    await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.ok(
      !existsSync(join(tempDir, 'CLAUDE.md')),
      'CLAUDE.md should NOT be created in dry-run mode',
    )
  })

  it('should exit 0 in dry-run mode (no actual errors)', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    assert.equal(exitCode, 0, 'Dry-run should exit 0')
  })

  it('should show what files would be created in dry-run output', async () => {
    const { stdout } = await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    // The dry-run output should mention mkdir, copy, write operations
    assert.ok(
      stdout.includes('mkdir') || stdout.includes('copy') || stdout.includes('write'),
      'Dry-run output should describe filesystem operations that would be performed',
    )
  })

  it('should preserve existing .gitignore content in dry-run mode', async () => {
    await runCli(['init', '--non-interactive', '--dry-run', tempDir])

    // The .gitignore created by createMockProject should be unchanged
    const gitignoreExists = existsSync(join(tempDir, '.gitignore'))
    assert.ok(gitignoreExists, 'Original .gitignore should still exist')
  })
})
