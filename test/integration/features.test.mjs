import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  runCli,
} from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Agent filenames keyed by feature group (mirrors bin/lib/features.mjs)
// ---------------------------------------------------------------------------

const CORE_AGENTS = ['sparq-orchestrator.md']
const MANUAL_TESTS_AGENTS = ['sparq-requirements-analyst.md', 'sparq-manual-test-writer.md']
const E2E_AGENTS = ['sparq-automation-engineer.md', 'sparq-test-validator.md']
const ALL_AGENTS = [...CORE_AGENTS, ...MANUAL_TESTS_AGENTS, ...E2E_AGENTS]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentPath(dir, name) {
  return join(dir, '.claude', 'agents', name)
}

function agentExists(dir, name) {
  return existsSync(agentPath(dir, name))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature-based selective installation', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      dependencies: { vue: '^3.4.0' },
      withGit: true,
    })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  // -------------------------------------------------------------------------
  // 1. --features=e2e  (core + e2e agents only)
  // -------------------------------------------------------------------------

  it('--features=e2e should install core + e2e agents only', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=e2e', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    // Core agents must be present
    for (const agent of CORE_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `Core agent ${agent} should be installed`)
    }

    // E2E agents must be present
    for (const agent of E2E_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `E2E agent ${agent} should be installed`)
    }

    // Manual-tests agents must NOT be present
    for (const agent of MANUAL_TESTS_AGENTS) {
      assert.ok(!agentExists(tempDir, agent), `Manual-tests agent ${agent} should NOT be installed`)
    }
  })

  // -------------------------------------------------------------------------
  // 2. --features=manual-tests  (core + manual-tests agents only)
  // -------------------------------------------------------------------------

  it('--features=manual-tests should install core + manual-tests agents only', async () => {
    const { exitCode } = await runCli([
      'init',
      '--non-interactive',
      '--features=manual-tests',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Init should exit 0')

    // Core agents must be present
    for (const agent of CORE_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `Core agent ${agent} should be installed`)
    }

    // Manual-tests agents must be present
    for (const agent of MANUAL_TESTS_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `Manual-tests agent ${agent} should be installed`)
    }

    // E2E agents must NOT be present
    for (const agent of E2E_AGENTS) {
      assert.ok(!agentExists(tempDir, agent), `E2E agent ${agent} should NOT be installed`)
    }
  })

  // -------------------------------------------------------------------------
  // 3. --features=minimal  (preset — core agents only)
  // -------------------------------------------------------------------------

  it('--features=minimal preset should install only core agents', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=minimal', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    // Core agents must be present
    for (const agent of CORE_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `Core agent ${agent} should be installed`)
    }

    // All non-core agents must NOT be present
    const nonCoreAgents = [...MANUAL_TESTS_AGENTS, ...E2E_AGENTS]
    for (const agent of nonCoreAgents) {
      assert.ok(
        !agentExists(tempDir, agent),
        `Non-core agent ${agent} should NOT be installed with minimal preset`,
      )
    }
  })

  // -------------------------------------------------------------------------
  // 4. --features=bogus  (unknown feature — should fail)
  // -------------------------------------------------------------------------

  it('--features=bogus should fail with non-zero exit code', async () => {
    const { exitCode, stdout, stderr } = await runCli([
      'init',
      '--non-interactive',
      '--features=bogus',
      tempDir,
    ])

    assert.notEqual(exitCode, 0, 'Init should fail with non-zero exit code for unknown feature')

    const combined = stdout + stderr
    assert.ok(
      combined.includes('Unknown feature') || combined.includes('unknown feature'),
      'Output should mention the unknown feature',
    )
  })

  // -------------------------------------------------------------------------
  // 5. No --features flag  (default — install all 5 agents)
  // -------------------------------------------------------------------------

  it('no --features flag should install all agents (default behavior)', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    // All 5 agents must be present
    for (const agent of ALL_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `Agent ${agent} should be installed by default`)
    }
  })

  // -------------------------------------------------------------------------
  // 6. settings.local.json permissions match selected features
  // -------------------------------------------------------------------------

  it('--features=e2e should NOT include MCP permissions for unselected features', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=e2e', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    const settings = readJsonFile(tempDir, '.claude/settings.local.json')
    assert.ok(settings, 'settings.local.json should exist')
    assert.ok(settings.permissions, 'settings.local.json should have permissions')
    assert.ok(Array.isArray(settings.permissions.allow), 'permissions.allow should be an array')

    const allowList = settings.permissions.allow

    // e2e alone does not require any MCP servers, so MCP patterns should be absent
    assert.ok(
      !allowList.some((p) => p.includes('mcp__atlassian__')),
      'Atlassian MCP permission should NOT be present for e2e-only',
    )
    assert.ok(
      !allowList.some((p) => p.includes('mcp__figma__')),
      'Figma MCP permission should NOT be present for e2e-only',
    )
    assert.ok(
      !allowList.some((p) => p.includes('mcp__testrail__')),
      'TestRail MCP permission should NOT be present for e2e-only',
    )
  })

  it('--features=jira should include Atlassian MCP permission', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=jira', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    const settings = readJsonFile(tempDir, '.claude/settings.local.json')
    assert.ok(settings, 'settings.local.json should exist')

    const allowList = settings.permissions.allow
    assert.ok(
      allowList.some((p) => p.includes('mcp__atlassian__')),
      'Atlassian MCP permission should be present when jira feature is selected',
    )
  })

  it('--features=figma should include Figma MCP permission', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=figma', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    const settings = readJsonFile(tempDir, '.claude/settings.local.json')
    assert.ok(settings, 'settings.local.json should exist')

    const allowList = settings.permissions.allow
    assert.ok(
      allowList.some((p) => p.includes('mcp__figma__')),
      'Figma MCP permission should be present when figma feature is selected',
    )
  })

  // -------------------------------------------------------------------------
  // 7. Selective skills installation
  // -------------------------------------------------------------------------

  it('--features=e2e should install e2e-related skills but not manual-test skills', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=e2e', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    // E2E skills should be present
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-generate-e2e')),
      'sparq-generate-e2e skill should be installed',
    )
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-sync')),
      'sparq-sync skill should be installed',
    )
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-validate')),
      'sparq-validate skill should be installed',
    )
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-regression')),
      'sparq-regression skill should be installed',
    )
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-refactor')),
      'sparq-refactor skill should be installed',
    )

    // Core skills should always be present
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-analyze')),
      'sparq-analyze skill should be installed (core)',
    )
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-init')),
      'sparq-init skill should be installed (core)',
    )

    // Manual-test skills should NOT be present
    assert.ok(
      !existsSync(join(tempDir, '.claude', 'skills', 'sparq-generate-manual')),
      'sparq-generate-manual skill should NOT be installed for e2e-only',
    )
  })

  // -------------------------------------------------------------------------
  // 8. Comma-separated multiple features
  // -------------------------------------------------------------------------

  it('--features=e2e,jira should install both e2e agents and jira MCP permission', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=e2e,jira', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    // E2E agents must be present
    for (const agent of E2E_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `E2E agent ${agent} should be installed`)
    }

    // Core agents must be present
    for (const agent of CORE_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `Core agent ${agent} should be installed`)
    }

    // Manual-tests agents must NOT be present (not selected)
    for (const agent of MANUAL_TESTS_AGENTS) {
      assert.ok(!agentExists(tempDir, agent), `Manual-tests agent ${agent} should NOT be installed`)
    }

    // Jira MCP permission should be present
    const settings = readJsonFile(tempDir, '.claude/settings.local.json')
    assert.ok(
      settings.permissions.allow.some((p) => p.includes('mcp__atlassian__')),
      'Atlassian MCP permission should be present when jira feature is selected',
    )
  })

  // -------------------------------------------------------------------------
  // 9. all preset installs everything
  // -------------------------------------------------------------------------

  it('--features=all preset should install all agents', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=all', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    for (const agent of ALL_AGENTS) {
      assert.ok(agentExists(tempDir, agent), `Agent ${agent} should be installed with all preset`)
    }
  })

  // -------------------------------------------------------------------------
  // 10. Shared skills directory always installed
  // -------------------------------------------------------------------------

  it('sparq-shared skills directory should always be installed regardless of features', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', '--features=minimal', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')

    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-shared')),
      'sparq-shared skills directory should always be installed',
    )
  })
})
