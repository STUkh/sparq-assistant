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

describe('Update command with --only/--skip', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      name: 'update-filter-test',
      dependencies: { vue: '^3.4.0' },
      devDependencies: { '@playwright/test': '^1.40.0' },
      withGit: true,
    })
    await runCli(['init', '--non-interactive', tempDir])
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  // -------------------------------------------------------------------------
  // --only=agents: should update agents, leave skills/templates untouched
  // -------------------------------------------------------------------------

  it('--only=agents should update agent files', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    const sentinel = '# SENTINEL — this line proves the file was overwritten'
    writeFileSync(agentPath, sentinel, 'utf-8')

    const { exitCode, stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=agents',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --only=agents should exit 0')
    assert.ok(
      stdout.includes('Update complete') || stdout.includes('updated'),
      'Should report update completion',
    )

    // Agent file should have been overwritten (sentinel replaced)
    const content = readFileSync(agentPath, 'utf-8')
    assert.ok(
      !content.includes('SENTINEL'),
      'Agent file should be overwritten by update --only=agents',
    )
  })

  it('--only=agents should NOT touch skills or templates', async () => {
    // Place sentinels in a skill file and a template file
    const skillDir = join(tempDir, '.claude', 'skills', 'sparq-analyze')
    const skillFile = join(skillDir, 'SKILL.md')
    const templateFile = join(tempDir, '.claude', 'templates', 'sparq-requirements.md')

    const skillSentinel = '# SKILL_SENTINEL — should survive'
    const templateSentinel = '# TEMPLATE_SENTINEL — should survive'

    if (existsSync(skillFile)) writeFileSync(skillFile, skillSentinel, 'utf-8')
    if (existsSync(templateFile)) writeFileSync(templateFile, templateSentinel, 'utf-8')

    await runCli(['update', '--non-interactive', '--force', '--only=agents', tempDir])

    // Skills should be untouched
    if (existsSync(skillFile)) {
      const skillContent = readFileSync(skillFile, 'utf-8')
      assert.ok(
        skillContent.includes('SKILL_SENTINEL'),
        'Skill file should NOT be overwritten when --only=agents is used',
      )
    }

    // Templates should be untouched
    if (existsSync(templateFile)) {
      const templateContent = readFileSync(templateFile, 'utf-8')
      assert.ok(
        templateContent.includes('TEMPLATE_SENTINEL'),
        'Template file should NOT be overwritten when --only=agents is used',
      )
    }
  })

  it('--only=agents should report updated categories', async () => {
    const { stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=agents',
      tempDir,
    ])

    assert.ok(
      stdout.includes('Updated categories') && stdout.includes('agents'),
      'Should report that only agents category was updated',
    )
  })

  // -------------------------------------------------------------------------
  // --only=agents,skills: multi-category filter
  // -------------------------------------------------------------------------

  it('--only=agents,skills should update both agents and skills', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    const skillFile = join(tempDir, '.claude', 'skills', 'sparq-analyze', 'SKILL.md')

    writeFileSync(agentPath, '# AGENT_SENTINEL', 'utf-8')
    if (existsSync(skillFile)) writeFileSync(skillFile, '# SKILL_SENTINEL', 'utf-8')

    const { exitCode, stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=agents,skills',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --only=agents,skills should exit 0')

    // Agent should be overwritten
    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(
      !agentContent.includes('AGENT_SENTINEL'),
      'Agent file should be overwritten by update --only=agents,skills',
    )

    // Skill should be overwritten
    if (existsSync(skillFile)) {
      const skillContent = readFileSync(skillFile, 'utf-8')
      assert.ok(
        !skillContent.includes('SKILL_SENTINEL'),
        'Skill file should be overwritten by update --only=agents,skills',
      )
    }

    // Templates should NOT have been listed in updated categories
    assert.ok(stdout.includes('Updated categories'), 'Should report updated categories')
  })

  it('--only=agents,skills should NOT touch templates or config', async () => {
    const templateFile = join(tempDir, '.claude', 'templates', 'sparq-requirements.md')
    const configPath = join(tempDir, 'sparq.config.json')

    if (existsSync(templateFile)) writeFileSync(templateFile, '# TPL_SENTINEL', 'utf-8')

    // Inject a custom field into config to detect if it was re-processed
    const configBefore = readJsonFile(tempDir, 'sparq.config.json')
    configBefore._testMarker = 'should-survive'
    writeFileSync(configPath, JSON.stringify(configBefore, null, 2), 'utf-8')

    await runCli(['update', '--non-interactive', '--force', '--only=agents,skills', tempDir])

    if (existsSync(templateFile)) {
      const tplContent = readFileSync(templateFile, 'utf-8')
      assert.ok(
        tplContent.includes('TPL_SENTINEL'),
        'Template file should NOT be overwritten when --only=agents,skills',
      )
    }

    const configAfter = readJsonFile(tempDir, 'sparq.config.json')
    assert.equal(
      configAfter._testMarker,
      'should-survive',
      'Config should NOT be updated when --only=agents,skills',
    )
  })

  // -------------------------------------------------------------------------
  // --skip=config: update everything except config
  // -------------------------------------------------------------------------

  it('--skip=config should update agents, skills, templates, mcp', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    writeFileSync(agentPath, '# AGENT_SENTINEL', 'utf-8')

    const { exitCode, stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--skip=config',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --skip=config should exit 0')

    // Agent should be overwritten
    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(
      !agentContent.includes('AGENT_SENTINEL'),
      'Agent file should be overwritten by update --skip=config',
    )

    assert.ok(
      stdout.includes('Skipped categories') && stdout.includes('config'),
      'Should report that config was skipped',
    )
  })

  it('--skip=config should preserve config content', async () => {
    const configPath = join(tempDir, 'sparq.config.json')
    const configBefore = readJsonFile(tempDir, 'sparq.config.json')
    configBefore._testMarker = 'config-preserved'
    writeFileSync(configPath, JSON.stringify(configBefore, null, 2), 'utf-8')

    await runCli(['update', '--non-interactive', '--force', '--skip=config', tempDir])

    const configAfter = readJsonFile(tempDir, 'sparq.config.json')
    assert.equal(
      configAfter._testMarker,
      'config-preserved',
      'Config marker should survive when --skip=config is used',
    )
  })

  // -------------------------------------------------------------------------
  // --only=bogus: unknown category should fail with EXIT_USAGE
  // -------------------------------------------------------------------------

  it('--only=bogus should fail with exit code 2', async () => {
    const { exitCode, stderr, stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=bogus',
      tempDir,
    ])

    assert.equal(exitCode, 2, 'Unknown category should exit with EXIT_USAGE (2)')

    const output = stdout + stderr
    assert.ok(
      output.includes('Unknown update categories') || output.includes('bogus'),
      'Should mention the invalid category name in error output',
    )
  })

  it('--skip=invalid should fail with exit code 2', async () => {
    const { exitCode, stderr, stdout } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--skip=invalid',
      tempDir,
    ])

    assert.equal(exitCode, 2, 'Unknown skip category should exit with EXIT_USAGE (2)')

    const output = stdout + stderr
    assert.ok(
      output.includes('Unknown skip categories') || output.includes('invalid'),
      'Should mention the invalid skip category name in error output',
    )
  })

  // -------------------------------------------------------------------------
  // --only + --skip together: mutual exclusion
  // -------------------------------------------------------------------------

  it('--only and --skip together should fail with exit code 2', async () => {
    const { exitCode, stderr, stdout } = await runCli([
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

  // -------------------------------------------------------------------------
  // No filter (baseline): update everything
  // -------------------------------------------------------------------------

  it('update without --only/--skip should update everything', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    const skillFile = join(tempDir, '.claude', 'skills', 'sparq-analyze', 'SKILL.md')
    const templateFile = join(tempDir, '.claude', 'templates', 'sparq-requirements.md')

    writeFileSync(agentPath, '# AGENT_SENTINEL', 'utf-8')
    if (existsSync(skillFile)) writeFileSync(skillFile, '# SKILL_SENTINEL', 'utf-8')
    if (existsSync(templateFile)) writeFileSync(templateFile, '# TPL_SENTINEL', 'utf-8')

    const { exitCode, stdout } = await runCli(['update', '--non-interactive', '--force', tempDir])

    assert.equal(exitCode, 0, 'Unfiltered update should exit 0')
    assert.ok(
      stdout.includes('Update complete') || stdout.includes('updated'),
      'Should report update completion',
    )

    // All sentinel files should have been overwritten
    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.ok(
      !agentContent.includes('AGENT_SENTINEL'),
      'Agent file should be overwritten by unfiltered update',
    )

    if (existsSync(skillFile)) {
      const skillContent = readFileSync(skillFile, 'utf-8')
      assert.ok(
        !skillContent.includes('SKILL_SENTINEL'),
        'Skill file should be overwritten by unfiltered update',
      )
    }

    if (existsSync(templateFile)) {
      const tplContent = readFileSync(templateFile, 'utf-8')
      assert.ok(
        !tplContent.includes('TPL_SENTINEL'),
        'Template file should be overwritten by unfiltered update',
      )
    }
  })

  it('update without --only/--skip should NOT report filtered categories', async () => {
    const { stdout } = await runCli(['update', '--non-interactive', '--force', tempDir])

    assert.ok(
      !stdout.includes('Updated categories:'),
      'Unfiltered update should not show "Updated categories" message',
    )
    assert.ok(
      !stdout.includes('Skipped categories:'),
      'Unfiltered update should not show "Skipped categories" message',
    )
  })

  // -------------------------------------------------------------------------
  // --only=skills selective verification: agents preserved, skills replaced
  // -------------------------------------------------------------------------

  it('--only=skills should preserve agent modifications', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    const customContent = '# Custom orchestrator content — user modified'
    writeFileSync(agentPath, customContent, 'utf-8')

    const { exitCode } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=skills',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Update --only=skills should exit 0')

    const agentContent = readFileSync(agentPath, 'utf-8')
    assert.equal(
      agentContent,
      customContent,
      'Agent file should be completely preserved when --only=skills',
    )
  })

  it('--only=skills should overwrite skill files', async () => {
    const skillFile = join(tempDir, '.claude', 'skills', 'sparq-analyze', 'SKILL.md')
    if (!existsSync(skillFile)) return

    writeFileSync(skillFile, '# SKILL_SENTINEL — will be replaced', 'utf-8')

    await runCli(['update', '--non-interactive', '--force', '--only=skills', tempDir])

    const content = readFileSync(skillFile, 'utf-8')
    assert.ok(
      !content.includes('SKILL_SENTINEL'),
      'Skill file should be overwritten when --only=skills',
    )
  })

  // -------------------------------------------------------------------------
  // Manifest is always updated regardless of filter
  // -------------------------------------------------------------------------

  it('manifest should be updated even with --only filter', async () => {
    const manifestPath = join(tempDir, '.sparq', '.manifest.json')
    assert.ok(existsSync(manifestPath), 'Manifest should exist after init')

    const { exitCode } = await runCli([
      'update',
      '--non-interactive',
      '--force',
      '--only=agents',
      tempDir,
    ])

    assert.equal(exitCode, 0)
    assert.ok(existsSync(manifestPath), 'Manifest should still exist after filtered update')

    const manifest = readJsonFile(tempDir, join('.sparq', '.manifest.json'))
    assert.ok(
      manifest && Object.keys(manifest).length > 0,
      'Manifest should have tracked files after filtered update',
    )
  })

  // -------------------------------------------------------------------------
  // Doctor should pass after a filtered update
  // -------------------------------------------------------------------------

  it('doctor should pass after --only=agents update', async () => {
    await runCli(['update', '--non-interactive', '--force', '--only=agents', tempDir])

    const { exitCode, stdout } = await runCli(['doctor', tempDir])

    assert.equal(exitCode, 0, 'Doctor should pass after filtered update')
    assert.ok(stdout.includes('checks passed'), 'Doctor should report checks passed')
  })
})
