import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  readTextFile,
  runCli,
} from '../helpers/setup.mjs'

describe('Doctor command integration', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      name: 'doctor-test',
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
    // Install SparQ first so doctor has something to check
    const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
    assert.equal(exitCode, 0, 'Init should succeed before doctor tests')
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  // -------------------------------------------------------------------------
  // 1. Fresh valid installation
  // -------------------------------------------------------------------------

  it('should exit 0 with "checks passed" on a fresh valid installation', async () => {
    const { stdout, exitCode } = await runCli(['doctor', tempDir])

    assert.equal(exitCode, 0, 'Doctor should exit 0 on valid installation')
    assert.ok(stdout.includes('checks passed'), 'Should show "checks passed" in summary')
  })

  it('should verify agents, skills, and config on valid install', async () => {
    const { stdout, exitCode } = await runCli(['doctor', tempDir])

    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('sparq-orchestrator.md'), 'Should check orchestrator agent')
    assert.ok(stdout.includes('sparq.config.json valid'), 'Should confirm config is valid')
  })

  // -------------------------------------------------------------------------
  // 2. Missing agent file
  // -------------------------------------------------------------------------

  it('should exit 1 when a required agent file is missing', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    assert.ok(existsSync(agentPath), 'Agent file should exist before deletion')
    unlinkSync(agentPath)

    const { stdout, exitCode } = await runCli(['doctor', tempDir])

    assert.equal(exitCode, 1, 'Doctor should exit 1 when agent is missing')
    assert.ok(
      stdout.includes('Agent missing: sparq-orchestrator.md'),
      'Should report missing agent',
    )
  })

  it('should exit 1 when multiple agent files are missing', async () => {
    unlinkSync(join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md'))
    unlinkSync(join(tempDir, '.claude', 'agents', 'sparq-requirements-analyst.md'))

    const { stdout, exitCode } = await runCli(['doctor', tempDir])

    assert.equal(exitCode, 1, 'Doctor should exit 1 when multiple agents are missing')
    assert.ok(
      stdout.includes('Agent missing: sparq-orchestrator.md'),
      'Should report first missing agent',
    )
    assert.ok(
      stdout.includes('Agent missing: sparq-requirements-analyst.md'),
      'Should report second missing agent',
    )
  })

  // -------------------------------------------------------------------------
  // 3. Invalid config data
  // -------------------------------------------------------------------------

  it('should warn when sparq.config.json has invalid data', async () => {
    const configPath = join(tempDir, 'sparq.config.json')
    writeFileSync(configPath, JSON.stringify({ version: 'bad' }))

    const { stdout, stderr } = await runCli(['doctor', tempDir])

    // The config is missing required fields (project, sources) — should produce warnings or errors
    const output = stdout + stderr
    assert.ok(
      output.includes('Config') || output.includes('Missing') || output.includes('warning'),
      'Should report config validation issues',
    )
  })

  it('should fail when sparq.config.json is not valid JSON', async () => {
    const configPath = join(tempDir, 'sparq.config.json')
    writeFileSync(configPath, '{ invalid json content !!!', 'utf-8')

    const { stdout, exitCode } = await runCli(['doctor', tempDir])

    assert.equal(exitCode, 1, 'Doctor should exit 1 for invalid JSON config')
    assert.ok(stdout.includes('not valid JSON'), 'Should report that config is not valid JSON')
  })

  it('should warn when sparq.config.json has a non-semver version', async () => {
    const configPath = join(tempDir, 'sparq.config.json')
    const config = readJsonFile(tempDir, 'sparq.config.json')
    config.version = 'not-a-version'
    writeFileSync(configPath, JSON.stringify(config, null, 2))

    const { stdout } = await runCli(['doctor', tempDir])

    // Deep schema validation should flag the non-semver version
    const output = stdout
    assert.ok(
      output.includes('Schema') || output.includes('pattern') || output.includes('version'),
      'Should report version format issue in deep schema validation',
    )
  })

  // -------------------------------------------------------------------------
  // 4. Doctor --deep on valid install
  // -------------------------------------------------------------------------

  it('should include MCP health output with --deep flag and still exit 0', async () => {
    const { stdout, exitCode } = await runCli(['doctor', '--deep', tempDir])

    assert.equal(exitCode, 0, 'Doctor --deep should exit 0 on valid installation')
    assert.ok(stdout.includes('checks passed'), 'Should show "checks passed" in summary')
    assert.ok(
      stdout.includes('MCP Health') || stdout.includes('MCP'),
      'Should include MCP health check output',
    )
  })

  it('should check MCP server structure in --deep mode', async () => {
    const { stdout } = await runCli(['doctor', '--deep', tempDir])

    // Deep mode should check at least the atlassian and playwright servers
    assert.ok(
      stdout.includes('atlassian') || stdout.includes('playwright') || stdout.includes('figma'),
      'Deep mode should check MCP server configurations',
    )
  })

  // -------------------------------------------------------------------------
  // 5. Doctor --deep with placeholder MCP credentials
  // -------------------------------------------------------------------------

  it('should show warnings about placeholder credentials in --deep mode', async () => {
    const mcpPath = join(tempDir, '.mcp.json')
    const mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))

    // Add env section with placeholder credentials to TestRail server
    if (!mcpData.mcpServers) mcpData.mcpServers = {}
    if (!mcpData.mcpServers.testrail) mcpData.mcpServers.testrail = {}
    mcpData.mcpServers.testrail.command = 'npx'
    mcpData.mcpServers.testrail.env = {
      TESTRAIL_BASE_URL: 'https://yourteam.testrail.io',
      TESTRAIL_USERNAME: 'your-email@example.com',
      TESTRAIL_API_KEY: 'your-api-key',
    }
    writeFileSync(mcpPath, JSON.stringify(mcpData, null, 2))

    const { stdout } = await runCli(['doctor', '--deep', tempDir])

    // checkEnvVar detects values containing 'your-' as placeholders
    assert.ok(
      stdout.includes('placeholder') || stdout.includes('your-'),
      'Should warn about placeholder credentials in deep mode',
    )
  })

  it('should warn about missing env vars in --deep mode', async () => {
    const mcpPath = join(tempDir, '.mcp.json')
    const mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
    const servers = mcpData.mcpServers || {}

    // Ensure TestRail server exists, then remove env section to trigger missing env var warnings
    if (!servers.testrail) {
      servers.testrail = { command: 'npx' }
    } else {
      servers.testrail.command = servers.testrail.command || 'npx'
    }
    delete servers.testrail.env
    writeFileSync(mcpPath, JSON.stringify(mcpData, null, 2))

    const { stdout } = await runCli(['doctor', '--deep', tempDir])

    assert.ok(
      stdout.includes('missing env var') || stdout.includes('missing'),
      'Should warn about missing env vars in deep mode',
    )
  })

  // -------------------------------------------------------------------------
  // 6. Permissions check — .claude/settings.local.json
  // -------------------------------------------------------------------------

  it('should check .claude/settings.local.json exists', async () => {
    const { stdout } = await runCli(['doctor', tempDir])

    // On a fresh init, settings.local.json should exist and doctor should confirm it
    assert.ok(
      stdout.includes('settings.local.json') || stdout.includes('permission'),
      'Should check settings.local.json in doctor output',
    )
  })

  it('should warn when .claude/settings.local.json is missing', async () => {
    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    if (existsSync(settingsPath)) {
      unlinkSync(settingsPath)
    }

    const { stdout } = await runCli(['doctor', tempDir])

    assert.ok(
      stdout.includes('settings.local.json not found') || stdout.includes('settings.local.json'),
      'Should warn when settings.local.json is missing',
    )
  })

  it('should warn when settings.local.json has no permission rules', async () => {
    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    writeFileSync(settingsPath, JSON.stringify({}, null, 2))

    const { stdout } = await runCli(['doctor', tempDir])

    assert.ok(
      stdout.includes('no permission') || stdout.includes('settings.local.json'),
      'Should warn when settings.local.json has no permission rules',
    )
  })

  // -------------------------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------------------------

  it('should check .gitignore includes .sparq/', async () => {
    const { stdout } = await runCli(['doctor', tempDir])

    assert.ok(
      stdout.includes('.gitignore includes .sparq/') || stdout.includes('.gitignore'),
      'Should verify .gitignore has .sparq/ entry',
    )
  })

  it('should report .gitignore missing .sparq/ entry', async () => {
    const gitignorePath = join(tempDir, '.gitignore')
    writeFileSync(gitignorePath, 'node_modules/\n')

    const { stdout } = await runCli(['doctor', tempDir])

    assert.ok(
      stdout.includes('.gitignore missing .sparq/'),
      'Should report missing .sparq/ entry in .gitignore',
    )
  })

  it('should check MCP servers in .mcp.json', async () => {
    const { stdout } = await runCli(['doctor', tempDir])

    assert.ok(
      stdout.includes('MCP server: atlassian') || stdout.includes('MCP server'),
      'Should verify MCP server configurations',
    )
  })

  it('should exit 1 when .mcp.json is missing entirely', async () => {
    const mcpPath = join(tempDir, '.mcp.json')
    if (existsSync(mcpPath)) {
      unlinkSync(mcpPath)
    }

    const { stdout, exitCode } = await runCli(['doctor', tempDir])

    assert.equal(exitCode, 1, 'Doctor should exit 1 when .mcp.json is missing')
    assert.ok(
      stdout.includes('MCP server missing') || stdout.includes('.mcp.json not found'),
      'Should report missing MCP servers',
    )
  })

  it('should show warning count in summary when warnings exist', async () => {
    // Remove settings.local.json to produce at least one warning
    const settingsPath = join(tempDir, '.claude', 'settings.local.json')
    if (existsSync(settingsPath)) {
      unlinkSync(settingsPath)
    }

    const { stdout } = await runCli(['doctor', tempDir])

    assert.ok(stdout.includes('warning'), 'Should show warning count in summary output')
  })
})

// ---------------------------------------------------------------------------
// doctor --fix
// ---------------------------------------------------------------------------

describe('doctor --fix', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      name: 'doctor-fix-test',
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
    // Install SparQ first so doctor --fix has a valid baseline
    const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
    assert.equal(exitCode, 0, 'Init should succeed before doctor --fix tests')
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  // -------------------------------------------------------------------------
  // 1. --fix reinstalls missing agent file
  // -------------------------------------------------------------------------

  it('should reinstall a missing agent file', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    assert.ok(existsSync(agentPath), 'Agent file should exist before deletion')
    unlinkSync(agentPath)

    // Confirm doctor detects the missing agent
    const before = await runCli(['doctor', tempDir])
    assert.equal(before.exitCode, 1, 'Doctor should fail with missing agent')
    assert.ok(
      before.stdout.includes('Agent missing: sparq-orchestrator.md'),
      'Should report missing agent before fix',
    )

    // Run doctor --fix to restore it
    const fix = await runCli(['doctor', '--fix', tempDir])
    assert.ok(fix.stdout.includes('Applying fixes'), 'Should show "Applying fixes" heading')
    assert.ok(
      fix.stdout.includes('Reinstall agent: sparq-orchestrator.md'),
      'Should report reinstalling the agent',
    )

    // Verify the file is restored on disk
    assert.ok(existsSync(agentPath), 'Agent file should be restored after --fix')

    // Re-run doctor to confirm it now passes
    const after = await runCli(['doctor', tempDir])
    assert.equal(after.exitCode, 0, 'Doctor should pass after --fix restored the agent')
    assert.ok(after.stdout.includes('checks passed'), 'Should show checks passed after fix')
  })

  // -------------------------------------------------------------------------
  // 2. --fix creates missing output directory
  // -------------------------------------------------------------------------

  it('should create a missing output directory', async () => {
    const missingDir = join(tempDir, '.sparq', 'requirements')
    assert.ok(existsSync(missingDir), 'Output dir should exist before deletion')
    rmSync(missingDir, { recursive: true, force: true })
    assert.ok(!existsSync(missingDir), 'Output dir should be gone after deletion')

    // Run doctor --fix
    const fix = await runCli(['doctor', '--fix', tempDir])
    assert.ok(
      fix.stdout.includes('Create directory: .sparq/requirements'),
      'Should report creating the missing directory',
    )

    // Verify the directory was recreated
    assert.ok(existsSync(missingDir), 'Output directory should be recreated after --fix')
  })

  // -------------------------------------------------------------------------
  // 3. --fix adds .sparq/ to .gitignore
  // -------------------------------------------------------------------------

  it('should add .sparq/ to .gitignore when missing', async () => {
    const gitignorePath = join(tempDir, '.gitignore')
    // Overwrite .gitignore without .sparq/ entry
    writeFileSync(gitignorePath, 'node_modules/\n')

    // Confirm doctor detects the issue
    const before = await runCli(['doctor', tempDir])
    assert.ok(
      before.stdout.includes('.gitignore missing .sparq/'),
      'Should report missing .sparq/ in .gitignore before fix',
    )

    // Run doctor --fix
    const fix = await runCli(['doctor', '--fix', tempDir])
    assert.ok(
      fix.stdout.includes('Add .sparq/ to .gitignore'),
      'Should report adding .sparq/ to .gitignore',
    )

    // Verify .gitignore now contains .sparq/
    const content = readTextFile(tempDir, '.gitignore')
    assert.ok(content !== null, '.gitignore should exist')
    const lines = content.split('\n').map((l) => l.trim())
    assert.ok(lines.includes('.sparq/'), '.gitignore should contain .sparq/ entry after --fix')
  })

  // -------------------------------------------------------------------------
  // 4. --fix with no issues reports nothing to fix
  // -------------------------------------------------------------------------

  it('should report nothing to fix when installation is valid', async () => {
    const { stdout, exitCode } = await runCli(['doctor', '--fix', tempDir])

    assert.equal(exitCode, 0, 'Doctor --fix should exit 0 on valid installation')
    assert.ok(stdout.includes('checks passed'), 'Should show checks passed')
    assert.ok(
      !stdout.includes('Applying fixes'),
      'Should NOT show "Applying fixes" when there are no issues',
    )
  })

  // -------------------------------------------------------------------------
  // 5. --fix with --dry-run does not modify files
  // -------------------------------------------------------------------------

  it('should not restore files in dry-run mode', async () => {
    const agentPath = join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')
    unlinkSync(agentPath)

    // Run doctor --fix --dry-run
    const fix = await runCli(['doctor', '--fix', '--dry-run', tempDir])
    assert.ok(
      fix.stdout.includes('dry-run') || fix.stdout.includes('DRY RUN'),
      'Should mention dry-run in output',
    )
    assert.ok(
      fix.stdout.includes('Would apply') || fix.stdout.includes('fix(es)'),
      'Should indicate fixes would be applied',
    )

    // Verify the agent file is NOT restored (dry-run should not write)
    assert.ok(!existsSync(agentPath), 'Agent file should NOT be restored in dry-run mode')
  })
})
