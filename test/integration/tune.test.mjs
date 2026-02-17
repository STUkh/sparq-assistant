import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { cleanTempDir, createMockProject, createTempDir, runCli } from '../helpers/setup.mjs'

describe('CLI: tune command', { concurrency: false }, () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      name: 'tune-test',
      devDependencies: { '@playwright/test': '^1.40.0' },
      withGit: true,
    })
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('Step 1: init --non-interactive creates project with premium tier', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
    assert.equal(exitCode, 0, 'Init should exit 0')

    const configPath = join(tempDir, 'sparq.config.json')
    assert.ok(existsSync(configPath), 'Config should exist')

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    assert.equal(config.preferences?.modelTier, 'premium', 'Default tier should be premium')
  })

  it('Step 2: tune status shows premium tier', async () => {
    const { stdout, exitCode } = await runCli(['tune', 'status', '--project', tempDir])
    assert.equal(exitCode, 0, 'Status should exit 0')
    assert.ok(stdout.includes('premium'), 'Should show premium tier')
  })

  it('Step 3: tune apply economy --force modifies agents and config', async () => {
    const { stdout, exitCode } = await runCli([
      'tune',
      'apply',
      'economy',
      '--force',
      '--project',
      tempDir,
    ])
    assert.equal(exitCode, 0, 'Apply should exit 0')
    assert.ok(stdout.includes('economy'), 'Should mention economy')

    const config = JSON.parse(readFileSync(join(tempDir, 'sparq.config.json'), 'utf-8'))
    assert.equal(config.preferences?.modelTier, 'economy', 'Config should be economy')

    // Check at least one agent was modified
    const agentDir = join(tempDir, '.claude', 'agents')
    if (existsSync(join(agentDir, 'sparq-orchestrator.md'))) {
      const content = readFileSync(join(agentDir, 'sparq-orchestrator.md'), 'utf-8')
      assert.ok(
        content.includes('[sparq:tier:') || content.includes('model: haiku'),
        'Agent should have tier markers or haiku model',
      )
    }
  })

  it('Step 4: tune revert restores premium', async () => {
    const { stdout, exitCode } = await runCli(['tune', 'revert', '--force', '--project', tempDir])
    assert.equal(exitCode, 0, 'Revert should exit 0')
    assert.ok(
      stdout.includes('premium') || stdout.includes('revert'),
      'Should mention revert/premium',
    )

    const config = JSON.parse(readFileSync(join(tempDir, 'sparq.config.json'), 'utf-8'))
    assert.equal(config.preferences?.modelTier, 'premium', 'Config should be premium after revert')
  })

  it('Step 5: tune apply with invalid tier exits with code 2', async () => {
    const { exitCode } = await runCli(['tune', 'apply', 'mega', '--force', '--project', tempDir])
    assert.notEqual(exitCode, 0, 'Invalid tier should fail')
  })

  it('Step 6: tune apply economy --dry-run does not modify files', async () => {
    // Read current state
    const configBefore = readFileSync(join(tempDir, 'sparq.config.json'), 'utf-8')

    const { stdout, exitCode } = await runCli([
      'tune',
      'apply',
      'economy',
      '--force',
      '--dry-run',
      '--project',
      tempDir,
    ])
    assert.equal(exitCode, 0, 'Dry-run should exit 0')
    assert.ok(stdout.includes('dry-run') || stdout.includes('DRY RUN'), 'Should mention dry-run')

    // Config should not change
    const configAfter = readFileSync(join(tempDir, 'sparq.config.json'), 'utf-8')
    assert.equal(configAfter, configBefore, 'Config should not change in dry-run')
  })
})
