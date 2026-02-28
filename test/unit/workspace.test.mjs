import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { resolveWorkspaceConfig } from '../../bin/lib/config.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRootConfig(overrides = {}) {
  return {
    version: '1.0.0',
    project: {
      testDir: 'e2e',
      sourceRoot: 'src',
      componentFileExtensions: ['.vue'],
    },
    sources: {
      jira: { enabled: true, projectKey: 'EP' },
      local: { enabled: true, requirementsDir: 'docs/specs' },
    },
    e2e: { detected: true, framework: 'playwright' },
    outputs: { tms: { provider: null } },
    preferences: { testMultiplier: 5, modelTier: 'premium' },
    workspaces: [{ path: 'packages/web', name: 'Web App' }, { path: 'packages/admin' }],
    ...overrides,
  }
}

function writeConfig(dir, config) {
  writeFileSync(join(dir, 'sparq.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
}

// ---------------------------------------------------------------------------
// resolveWorkspaceConfig — no workspace config file
// ---------------------------------------------------------------------------

describe('resolveWorkspaceConfig — no workspace config file', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('returns a config when no workspace sparq.config.json exists', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.ok(result, 'should return a config object')
    assert.equal(typeof result, 'object')
  })

  it('adjusts sourceRoot to workspace/src when root is at default "src"', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.project.sourceRoot, `${wsPath}/src`)
  })

  it('does not adjust sourceRoot when root has a custom (non-default) sourceRoot', () => {
    const rootConfig = makeRootConfig({ project: { testDir: 'e2e', sourceRoot: 'apps/main/src' } })
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.project.sourceRoot, 'apps/main/src')
  })

  it('strips the workspaces array from the resolved config', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.workspaces, undefined, 'workspaces must not appear in resolved config')
  })

  it('preserves all other root config fields', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.version, '1.0.0')
    assert.deepEqual(result.e2e, { detected: true, framework: 'playwright' })
    assert.equal(result.preferences.testMultiplier, 5)
    assert.equal(result.sources.jira.projectKey, 'EP')
  })
})

// ---------------------------------------------------------------------------
// resolveWorkspaceConfig — with workspace config file
// ---------------------------------------------------------------------------

describe('resolveWorkspaceConfig — with workspace config file', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('deep-merges workspace config over root config', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const wsConfig = {
      project: { testDir: 'tests', sourceRoot: 'packages/web/src' },
      e2e: { detected: true, framework: 'cypress' },
    }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.project.testDir, 'tests', 'workspace testDir should win')
    assert.equal(result.project.sourceRoot, 'packages/web/src', 'workspace sourceRoot should win')
    assert.equal(result.e2e.framework, 'cypress', 'workspace framework should win')
  })

  it('workspace wins over root on key conflicts', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const wsConfig = {
      preferences: { testMultiplier: 3, modelTier: 'balanced' },
    }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.preferences.testMultiplier, 3, 'workspace testMultiplier should win')
    assert.equal(result.preferences.modelTier, 'balanced', 'workspace modelTier should win')
  })

  it('root fields absent from workspace config are preserved', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    // Workspace only overrides e2e
    const wsConfig = { e2e: { detected: false, framework: 'none' } }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.version, '1.0.0', 'root version preserved')
    assert.equal(result.sources.jira.projectKey, 'EP', 'root jira key preserved')
    assert.deepEqual(
      result.project.componentFileExtensions,
      ['.vue'],
      'root componentFileExtensions preserved',
    )
  })

  it('workspaces array from root is not included in merged result', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const wsConfig = { project: { sourceRoot: 'packages/web/src' } }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.workspaces, undefined, 'workspaces must be stripped from merged result')
  })

  it('workspaces in workspace config file are also stripped', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    // workspace config accidentally has a workspaces key
    const wsConfig = {
      project: { sourceRoot: 'packages/web/src' },
      workspaces: [{ path: 'sub' }],
    }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.workspaces, undefined, 'workspaces from ws config must be stripped')
  })

  it('handles malformed workspace config gracefully — falls back to path-adjusted root', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    // Write intentionally invalid JSON
    writeFileSync(join(wsPath, 'sparq.config.json'), 'NOT VALID JSON', 'utf-8')

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.ok(result, 'should return a config even on parse error')
    assert.equal(result.version, '1.0.0', 'fallback should still have root version')
    // workspaces should still be stripped even on fallback
    assert.equal(result.workspaces, undefined)
  })

  it('preserves arrays in root config when workspace does not override them', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const wsConfig = { e2e: { framework: 'playwright' } }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.deepEqual(result.project.componentFileExtensions, ['.vue'])
  })

  it('workspace array values replace (not concat) root array values on same key', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    const wsConfig = {
      project: { componentFileExtensions: ['.tsx', '.jsx'] },
    }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.deepEqual(
      result.project.componentFileExtensions,
      ['.tsx', '.jsx'],
      'workspace array should replace root array',
    )
  })

  // E3a — 3-level deep merge
  it('deep-merges 3-level nested config (outputs.tms.testrail.projectId)', () => {
    const rootConfig = makeRootConfig({
      outputs: {
        tms: {
          provider: 'testrail',
          testrail: { projectId: 42, suiteId: 99 },
        },
      },
    })
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    // workspace overrides only outputs.tms.testrail.projectId — suiteId must be preserved from root
    const wsConfig = { outputs: { tms: { testrail: { projectId: 7 } } } }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.outputs.tms.provider, 'testrail', 'provider preserved from root')
    assert.equal(
      result.outputs.tms.testrail.projectId,
      7,
      'workspace projectId wins in 3-level merge',
    )
    assert.equal(result.outputs.tms.testrail.suiteId, 99, 'root suiteId preserved in 3-level merge')
  })

  // E3c — Test 1: empty array replaces root array
  it('workspace empty array fully replaces root array (no concatenation)', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    // workspace has componentFileExtensions: [] — must replace root's ['.vue']
    const wsConfig = { project: { componentFileExtensions: [] } }
    writeConfig(wsPath, wsConfig)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.deepEqual(
      result.project.componentFileExtensions,
      [],
      'Empty workspace array must replace root array entirely',
    )
  })

  // E3c — Test 2: both root and workspace configs having workspaces field → both stripped
  it('strips workspaces from result even when both root and workspace configs have workspaces field', () => {
    const rootConfig = makeRootConfig()
    const wsPath = join(tempDir, 'packages', 'web')
    mkdirSync(wsPath, { recursive: true })

    // workspace config has its own workspaces field — should be stripped from merged result
    const wsConfigWithWorkspaces = {
      project: { sourceRoot: 'custom/src' },
      workspaces: [{ path: 'nested/sub' }],
    }
    writeConfig(wsPath, wsConfigWithWorkspaces)

    const result = resolveWorkspaceConfig(rootConfig, wsPath)
    assert.equal(result.workspaces, undefined, 'workspaces must be absent from merged result')
    assert.equal(
      result.project.sourceRoot,
      'custom/src',
      'workspace sourceRoot still applied correctly',
    )
  })
})

// ---------------------------------------------------------------------------
// resolveWorkspaceConfig — nonexistent workspace path (E3b)
// ---------------------------------------------------------------------------

describe('resolveWorkspaceConfig — nonexistent workspace path', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('returns root config without throwing when workspace path does not exist', () => {
    const rootConfig = makeRootConfig()
    const nonExistentPath = join(tempDir, 'packages', 'does-not-exist')
    // nonExistentPath was never created with mkdirSync

    let result
    assert.doesNotThrow(() => {
      result = resolveWorkspaceConfig(rootConfig, nonExistentPath)
    }, 'Must not throw for non-existent workspace path')
    assert.ok(result, 'Should return a config object')
    assert.equal(result.version, '1.0.0', 'root version preserved')
    assert.equal(result.workspaces, undefined, 'workspaces stripped even on fallback path')
  })

  it('adjusts sourceRoot to workspace/src even when workspace directory does not exist', () => {
    // adjustPathsForWorkspace applies since no workspace config file is found —
    // it sets sourceRoot to `${workspacePath}/src` when root sourceRoot === 'src'
    const rootConfig = makeRootConfig()
    const nonExistentPath = join(tempDir, 'packages', 'does-not-exist')

    const result = resolveWorkspaceConfig(rootConfig, nonExistentPath)
    assert.equal(
      result.project.sourceRoot,
      `${nonExistentPath}/src`,
      `sourceRoot should be set to workspace path + /src, got: ${result.project.sourceRoot}`,
    )
  })
})
