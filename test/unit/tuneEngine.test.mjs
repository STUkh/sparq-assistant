import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AGENT_NAMES, TUNE_BUDGET } from '../../bin/lib/constants.mjs'
import { resetState, setDryRun } from '../../bin/lib/state.mjs'
import { getEnhancementsForAgent, TUNE_CATALOG } from '../../bin/lib/tune-catalog-user.mjs'
import {
  applyCachedGuidance,
  applyLayerOne,
  checkBudget,
  detectCurrentTier,
  getCachedGuidance,
  getRefineCount,
  getTuneStatus,
  incrementRefineCount,
  resetRefineCount,
  revertToDefault,
  saveCachedGuidance,
  updateAgentModels,
} from '../../bin/lib/tune-engine.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestAgent(dir, filename, model, content) {
  const agentsDir = join(dir, '.claude', 'agents')
  mkdirSync(agentsDir, { recursive: true })
  const body = `---\nname: ${filename.replace('.md', '')}\nmodel: ${model}\ncolor: yellow\n---\n${content}\n`
  writeFileSync(join(agentsDir, filename), body)
}

function createTestConfig(dir, overrides = {}) {
  const config = {
    version: '1.0.0',
    preferences: { modelTier: 'premium', ...overrides.preferences },
    ...overrides,
  }
  writeFileSync(join(dir, 'sparq.config.json'), JSON.stringify(config, null, 2))
}

function readAgent(dir, filename) {
  return readFileSync(join(dir, '.claude', 'agents', filename), 'utf-8')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tune-catalog-user', () => {
  it('catalog entries reference only valid agents', () => {
    const validAgents = AGENT_NAMES.map((n) => n.replace(/^sparq-/, '').replace(/\.md$/, ''))
    for (const entry of TUNE_CATALOG) {
      assert.ok(
        validAgents.includes(entry.agent),
        `Catalog entry references unknown agent: ${entry.agent}`,
      )
    }
  })

  it('catalog entries have unique markers per agent', () => {
    const seen = new Set()
    for (const entry of TUNE_CATALOG) {
      const key = `${entry.agent}:${entry.marker}`
      assert.ok(!seen.has(key), `Duplicate marker ${entry.marker} for agent ${entry.agent}`)
      seen.add(key)
    }
  })

  it('getEnhancementsForAgent returns nothing for premium', () => {
    const result = getEnhancementsForAgent('orchestrator', 'premium')
    assert.equal(result.length, 0)
  })

  it('getEnhancementsForAgent returns opus→sonnet entries for balanced', () => {
    const result = getEnhancementsForAgent('orchestrator', 'balanced')
    assert.ok(result.length > 0, 'Should have balanced enhancements for orchestrator')
    for (const entry of result) {
      assert.equal(entry.fromModel, 'opus')
    }
  })

  it('getEnhancementsForAgent returns nothing for balanced when agent is already sonnet', () => {
    const result = getEnhancementsForAgent('manual-test-writer', 'balanced')
    assert.equal(
      result.length,
      0,
      'manual-test-writer is already sonnet in premium, no balanced enhancement needed',
    )
  })

  it('getEnhancementsForAgent returns all entries for economy', () => {
    const result = getEnhancementsForAgent('automation-engineer', 'economy')
    assert.ok(result.length >= 3, 'Should have multiple economy enhancements')
  })
})

describe('tune-engine: detectCurrentTier', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('returns premium when no config exists', () => {
    assert.equal(detectCurrentTier(tmpDir), 'premium')
  })

  it('returns configured tier from config', () => {
    createTestConfig(tmpDir, { preferences: { modelTier: 'economy' } })
    assert.equal(detectCurrentTier(tmpDir), 'economy')
  })

  it('returns premium when config has no modelTier', () => {
    createTestConfig(tmpDir, { preferences: {} })
    assert.equal(detectCurrentTier(tmpDir), 'premium')
  })
})

describe('tune-engine: applyLayerOne', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('injects tier markers into agent files', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'opus', '<rules>\n- existing rule\n</rules>')
    createTestConfig(tmpDir)

    const results = applyLayerOne(tmpDir, 'balanced')
    const applied = results.filter((r) => r.status === 'applied')
    assert.ok(applied.length > 0, 'Should apply at least one enhancement')

    const content = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.ok(content.includes('[sparq:tier:'), 'Should contain tier markers')
  })

  it('is idempotent — does not duplicate markers', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'opus', '<rules>\n- existing rule\n</rules>')
    createTestConfig(tmpDir)

    applyLayerOne(tmpDir, 'balanced')
    const firstContent = readAgent(tmpDir, 'sparq-orchestrator.md')

    const results2 = applyLayerOne(tmpDir, 'balanced')
    const secondContent = readAgent(tmpDir, 'sparq-orchestrator.md')

    assert.equal(firstContent, secondContent, 'Second apply should not change content')
    const skipped = results2.filter((r) => r.status === 'skipped' && r.reason === 'already-applied')
    assert.ok(skipped.length > 0, 'Should report already-applied')
  })

  it('skips missing agent files', () => {
    createTestConfig(tmpDir)
    mkdirSync(join(tmpDir, '.claude', 'agents'), { recursive: true })

    const results = applyLayerOne(tmpDir, 'economy')
    for (const r of results) {
      assert.equal(r.status, 'skipped')
    }
  })
})

describe('tune-engine: updateAgentModels', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('updates model field in frontmatter', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'opus', '# Orchestrator')

    const results = updateAgentModels(tmpDir, 'economy')
    const changed = results.filter((r) => r.changed)
    assert.ok(changed.length > 0, 'Should change at least one model')

    const content = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.ok(content.includes('model: haiku'), 'Should have haiku model')
  })

  it('does not change if model already matches', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'haiku', '# Orchestrator')

    const results = updateAgentModels(tmpDir, 'economy')
    const changed = results.filter((r) => r.changed)
    assert.equal(changed.length, 0, 'Should not change already-matching model')
  })
})

describe('tune-engine: revertToDefault', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('removes tier markers and restores premium models', () => {
    createTestAgent(
      tmpDir,
      'sparq-orchestrator.md',
      'haiku',
      '<rules>\n- existing rule\n- [sparq:tier:economy] some enhancement\n</rules>',
    )

    const results = revertToDefault(tmpDir)
    const reverted = results.filter((r) => r.status === 'reverted')
    assert.ok(reverted.length > 0, 'Should revert at least one agent')

    const content = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.ok(!content.includes('[sparq:tier:'), 'Should remove tier markers')
    assert.ok(content.includes('model: opus'), 'Should restore opus model')
  })

  it('removes model_guidance blocks', () => {
    createTestAgent(
      tmpDir,
      'sparq-orchestrator.md',
      'sonnet',
      '# Agent\n\n<model_guidance tier="balanced">\nSome guidance\n</model_guidance>',
    )

    revertToDefault(tmpDir)
    const content = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.ok(!content.includes('<model_guidance'), 'Should remove model_guidance')
  })
})

describe('tune-engine: checkBudget', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('reports budget headroom per agent', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'opus', '# Agent\n'.repeat(50))

    const results = checkBudget(tmpDir)
    assert.ok(results.length > 0, 'Should check at least one agent')

    const orch = results.find((r) => r.agent === 'sparq-orchestrator.md')
    assert.ok(orch, 'Should include orchestrator')
    assert.ok(orch.lines > 0, 'Should count lines')
    assert.equal(orch.headroom, TUNE_BUDGET.agentTotalMax - orch.lines)
  })
})

describe('tune-engine: Layer 2 guidance cache', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('saves and retrieves cached guidance', () => {
    const guidance = '## Test Guidance\n- Rule 1\n- Rule 2'
    saveCachedGuidance(tmpDir, 'orchestrator', 'economy', guidance)

    const cached = getCachedGuidance(tmpDir, 'orchestrator', 'economy')
    assert.equal(cached, guidance)
  })

  it('returns null for uncached guidance', () => {
    assert.equal(getCachedGuidance(tmpDir, 'orchestrator', 'economy'), null)
  })

  it('applyCachedGuidance injects guidance block into agent', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'haiku', '# Orchestrator Agent')
    saveCachedGuidance(tmpDir, 'orchestrator', 'economy', '## Decision Tree\n- Step 1')

    const results = applyCachedGuidance(tmpDir, 'economy')
    const applied = results.filter((r) => r.status === 'applied')
    assert.ok(applied.length > 0, 'Should apply cached guidance')

    const content = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.ok(content.includes('<model_guidance tier="economy">'))
    assert.ok(content.includes('## Decision Tree'))
  })

  it('does not re-apply guidance if already present', () => {
    createTestAgent(
      tmpDir,
      'sparq-orchestrator.md',
      'haiku',
      '# Agent\n\n<model_guidance tier="economy">\nExisting\n</model_guidance>',
    )
    saveCachedGuidance(tmpDir, 'orchestrator', 'economy', 'New guidance')

    const results = applyCachedGuidance(tmpDir, 'economy')
    const present = results.filter((r) => r.status === 'already-present')
    assert.ok(present.length > 0)
  })
})

describe('tune-engine: refine count tracking', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('starts at zero', () => {
    assert.equal(getRefineCount(tmpDir, 'economy'), 0)
  })

  it('increments and reads correctly', () => {
    incrementRefineCount(tmpDir, 'economy')
    assert.equal(getRefineCount(tmpDir, 'economy'), 1)

    incrementRefineCount(tmpDir, 'economy')
    assert.equal(getRefineCount(tmpDir, 'economy'), 2)
  })

  it('tracks tiers independently', () => {
    incrementRefineCount(tmpDir, 'economy')
    incrementRefineCount(tmpDir, 'balanced')
    incrementRefineCount(tmpDir, 'economy')

    assert.equal(getRefineCount(tmpDir, 'economy'), 2)
    assert.equal(getRefineCount(tmpDir, 'balanced'), 1)
  })

  it('resets all counts', () => {
    incrementRefineCount(tmpDir, 'economy')
    incrementRefineCount(tmpDir, 'balanced')
    resetRefineCount(tmpDir)

    assert.equal(getRefineCount(tmpDir, 'economy'), 0)
    assert.equal(getRefineCount(tmpDir, 'balanced'), 0)
  })
})

describe('tune-engine: getTuneStatus', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('returns status with tier and agent details', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'opus', '# Agent')
    createTestConfig(tmpDir)

    const status = getTuneStatus(tmpDir)
    assert.equal(status.currentTier, 'premium')
    assert.equal(status.maxRefineRounds, TUNE_BUDGET.maxRefineRounds)
    assert.ok(status.agents.length > 0)

    const orch = status.agents.find((a) => a.agent === 'sparq-orchestrator.md')
    assert.ok(orch)
    assert.equal(orch.model, 'opus')
    assert.equal(orch.hasLayerOne, false)
    assert.equal(orch.hasLayerTwo, false)
  })

  it('detects Layer 1 and Layer 2 presence', () => {
    createTestAgent(
      tmpDir,
      'sparq-orchestrator.md',
      'haiku',
      '<rules>\n- [sparq:tier:economy] rule\n</rules>\n\n<model_guidance tier="economy">\nGuidance\n</model_guidance>',
    )
    createTestConfig(tmpDir, { preferences: { modelTier: 'economy' } })

    const status = getTuneStatus(tmpDir)
    const orch = status.agents.find((a) => a.agent === 'sparq-orchestrator.md')
    assert.equal(orch.hasLayerOne, true)
    assert.equal(orch.hasLayerTwo, true)
    assert.equal(orch.guidanceTier, 'economy')
  })
})

describe('tune-engine: full lifecycle', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
    createTestConfig(tmpDir)
    createTestAgent(
      tmpDir,
      'sparq-orchestrator.md',
      'opus',
      '<classification_rules>\n- rule 1\n</classification_rules>\n\n<rules>\n- rule 2\n</rules>',
    )
    createTestAgent(
      tmpDir,
      'sparq-automation-engineer.md',
      'opus',
      '<rules>\n- existing rule\n</rules>\n\n<done_criteria>\n- criterion 1\n</done_criteria>',
    )
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('apply economy → revert preserves original content semantics', () => {
    // Apply economy
    applyLayerOne(tmpDir, 'economy')
    updateAgentModels(tmpDir, 'economy')

    // Verify economy changes
    let content = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.ok(content.includes('[sparq:tier:'), 'Should have tier markers after apply')
    assert.ok(content.includes('model: haiku'), 'Should have haiku model after apply')

    // Revert
    revertToDefault(tmpDir)
    content = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.ok(!content.includes('[sparq:tier:'), 'Should not have tier markers after revert')
    assert.ok(content.includes('model: opus'), 'Should have opus model after revert')
    // Original sections preserved
    assert.ok(content.includes('- rule 1'))
    assert.ok(content.includes('- rule 2'))
  })
})

describe('tune-engine: dry-run mode', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
    setDryRun(true)
  })

  afterEach(() => {
    setDryRun(false)
    resetState()
    cleanTempDir(tmpDir)
  })

  it('applyLayerOne does not modify files in dry-run', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'opus', '<rules>\n- existing rule\n</rules>')
    const originalContent = readAgent(tmpDir, 'sparq-orchestrator.md')

    const results = applyLayerOne(tmpDir, 'balanced')
    const applied = results.filter((r) => r.status === 'applied')
    assert.ok(applied.length > 0, 'Should report applied (dry-run still returns results)')

    const afterContent = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.equal(afterContent, originalContent, 'File should not be modified in dry-run')
  })

  it('updateAgentModels does not modify files in dry-run', () => {
    createTestAgent(tmpDir, 'sparq-orchestrator.md', 'opus', '# Orchestrator')
    const originalContent = readAgent(tmpDir, 'sparq-orchestrator.md')

    updateAgentModels(tmpDir, 'economy')

    const afterContent = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.equal(afterContent, originalContent, 'File should not be modified in dry-run')
  })

  it('revertToDefault does not modify files in dry-run', () => {
    createTestAgent(
      tmpDir,
      'sparq-orchestrator.md',
      'haiku',
      '<rules>\n- [sparq:tier:economy] enhancement\n</rules>',
    )
    const originalContent = readAgent(tmpDir, 'sparq-orchestrator.md')

    revertToDefault(tmpDir)

    const afterContent = readAgent(tmpDir, 'sparq-orchestrator.md')
    assert.equal(afterContent, originalContent, 'File should not be modified in dry-run')
  })
})
