import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createMockProject, createTempDir, runCli } from '../helpers/setup.mjs'

describe('File installation (copyDirRecursive behavior via init)', () => {
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

  it('should create .claude/agents/ directory after init', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    assert.ok(
      existsSync(join(tempDir, '.claude', 'agents')),
      '.claude/agents/ directory should exist',
    )
  })

  it('should install all 5 agent files during init', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const agentNames = [
      'sparq-orchestrator.md',
      'sparq-requirements-analyst.md',
      'sparq-manual-test-writer.md',
      'sparq-automation-engineer.md',
      'sparq-test-validator.md',
    ]

    const agentsDir = join(tempDir, '.claude', 'agents')
    for (const name of agentNames) {
      assert.ok(existsSync(join(agentsDir, name)), `Agent file ${name} should be installed`)
    }
  })

  it('should create .claude/skills/ directory with all skill subdirectories', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const expectedSkills = [
      'sparq-analyze',
      'sparq-export',
      'sparq-generate-e2e',
      'sparq-generate-manual',
      'sparq-init',
      'sparq-manual-to-e2e',
      'sparq-sync',
      'sparq-shared',
    ]

    const skillsDir = join(tempDir, '.claude', 'skills')
    assert.ok(existsSync(skillsDir), '.claude/skills/ directory should exist')

    for (const skill of expectedSkills) {
      assert.ok(existsSync(join(skillsDir, skill)), `Skill directory ${skill}/ should be installed`)
    }
  })

  it('should create .claude/templates/ directory with template files', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const templatesDir = join(tempDir, '.claude', 'templates')
    assert.ok(existsSync(templatesDir), '.claude/templates/ directory should exist')

    const files = readdirSync(templatesDir)
    assert.ok(files.length > 0, 'Templates directory should contain files')
  })

  it('should create all .sparq/ output directories', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const outputDirs = [
      '.sparq/requirements',
      '.sparq/test-cases',
      '.sparq/parallel',
      '.sparq/coverage',
      '.sparq/validation',
      '.sparq/refresh',
      '.sparq/tracking',
      '.sparq/plans',
    ]

    for (const dir of outputDirs) {
      assert.ok(existsSync(join(tempDir, dir)), `Output directory ${dir} should exist`)
    }
  })

  it('should not produce errors when running init twice (idempotent)', async () => {
    const _result1 = await runCli(['init', '--non-interactive', tempDir])
    const result2 = await runCli(['init', '--non-interactive', tempDir])

    // Second run should complete without errors
    assert.equal(result2.exitCode, 0, 'Second init should exit 0')
    // Agent files should still exist
    assert.ok(
      existsSync(join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')),
      'Agent files should be preserved after second init',
    )
  })

  it('should report skipped files on second init (merge mode)', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    const { stdout } = await runCli(['init', '--non-interactive', tempDir])

    // On second run, files already exist and should be skipped
    assert.ok(
      stdout.includes('skipped') || stdout.includes('already exists'),
      'Should mention skipped or existing files on second init',
    )
  })

  it('should create sparq.config.json during init', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    assert.ok(existsSync(join(tempDir, 'sparq.config.json')), 'sparq.config.json should be created')
  })
})
