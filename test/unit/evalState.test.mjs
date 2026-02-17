import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

const {
  validateAgentFiles,
  saveTuneRecord,
  loadTuneHistory,
  getProtectedSections,
  checkOptimizeGate,
  setOptimizeMarker,
  clearOptimizeMarker,
} = await import('../../bin/lib/commands/eval-state.mjs')

// ---------------------------------------------------------------------------
// GAP 4.4: validateAgentFiles
// ---------------------------------------------------------------------------

describe('validateAgentFiles', () => {
  it('should find existing agent files', () => {
    const result = validateAgentFiles(['orchestrator', 'automation-engineer'])
    assert.ok(result.valid.includes('sparq-orchestrator.md'))
    assert.ok(result.valid.includes('sparq-automation-engineer.md'))
    assert.equal(result.missing.length, 0)
  })

  it('should report missing agent files', () => {
    const result = validateAgentFiles(['nonexistent-agent'])
    assert.equal(result.valid.length, 0)
    assert.ok(result.missing.includes('sparq-nonexistent-agent.md'))
    assert.equal(result.warnings.length, 1)
    assert.ok(result.warnings[0].includes('not found'))
  })

  it('should handle mixed valid and missing agents', () => {
    const result = validateAgentFiles(['orchestrator', 'fake-agent'])
    assert.equal(result.valid.length, 1)
    assert.equal(result.missing.length, 1)
    assert.ok(result.valid.includes('sparq-orchestrator.md'))
    assert.ok(result.missing.includes('sparq-fake-agent.md'))
  })

  it('should normalize sparq- prefix and .md extension', () => {
    const result = validateAgentFiles([
      'sparq-orchestrator',
      'sparq-orchestrator.md',
      'orchestrator',
    ])
    assert.equal(result.valid.length, 3)
    assert.equal(result.missing.length, 0)
  })
})

// ---------------------------------------------------------------------------
// GAP 4.2: saveTuneRecord + loadTuneHistory
// ---------------------------------------------------------------------------

describe('saveTuneRecord', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should write a tune record file', () => {
    const record = {
      reflectionSource: '20260210-120000.md',
      modelTier: 'sonnet',
      fixes: [
        {
          agent: 'sparq-automation-engineer',
          section: '<constants>',
          technique: 'PE-2',
          rubricChecks: ['playwright-syntax'],
          expectedDelta: 5,
          finding: 'missing fixture import rule',
        },
      ],
    }
    const result = saveTuneRecord(record, { tuneDir: tempDir })
    assert.ok(result.filename.endsWith('-tune.json'))
    assert.ok(existsSync(result.path))

    const saved = JSON.parse(readFileSync(result.path, 'utf-8'))
    assert.equal(saved.modelTier, 'sonnet')
    assert.equal(saved.fixes.length, 1)
    assert.equal(saved.fixes[0].agent, 'sparq-automation-engineer')
    assert.equal(saved.fixes[0].technique, 'PE-2')
    assert.deepEqual(saved.fixes[0].rubricChecks, ['playwright-syntax'])
  })

  it('should handle record with no fixes', () => {
    const result = saveTuneRecord({}, { tuneDir: tempDir })
    const saved = JSON.parse(readFileSync(result.path, 'utf-8'))
    assert.equal(saved.fixes.length, 0)
    assert.equal(saved.modelTier, 'unknown')
    assert.equal(saved.reflectionSource, null)
  })
})

describe('loadTuneHistory', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should return empty array when no tune dir exists', () => {
    const nonExistent = join(tempDir, 'nonexistent')
    const result = loadTuneHistory({ tuneDir: nonExistent })
    assert.deepEqual(result, [])
  })

  it('should load and sort tune records', () => {
    mkdirSync(tempDir, { recursive: true })
    const rec1 = { timestamp: '2026-01-01', fixes: [], modelTier: 'mock' }
    const rec2 = { timestamp: '2026-01-02', fixes: [], modelTier: 'mock' }
    writeFileSync(join(tempDir, '2026-01-02T00-00-00-tune.json'), JSON.stringify(rec2), 'utf-8')
    writeFileSync(join(tempDir, '2026-01-01T00-00-00-tune.json'), JSON.stringify(rec1), 'utf-8')

    const result = loadTuneHistory({ tuneDir: tempDir })
    assert.equal(result.length, 2)
    assert.equal(result[0].timestamp, '2026-01-01')
    assert.equal(result[1].timestamp, '2026-01-02')
  })

  it('should skip malformed JSON files', () => {
    mkdirSync(tempDir, { recursive: true })
    writeFileSync(join(tempDir, '2026-01-01T00-00-00-tune.json'), 'not json', 'utf-8')
    writeFileSync(
      join(tempDir, '2026-01-02T00-00-00-tune.json'),
      JSON.stringify({ timestamp: 'ok', fixes: [] }),
      'utf-8',
    )
    const result = loadTuneHistory({ tuneDir: tempDir })
    assert.equal(result.length, 1)
  })
})

// ---------------------------------------------------------------------------
// GAP 3.2: getProtectedSections
// ---------------------------------------------------------------------------

describe('getProtectedSections', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should return empty object when no history exists', () => {
    const result = getProtectedSections({ tuneDir: join(tempDir, 'none') })
    assert.deepEqual(result, {})
  })

  it('should aggregate sections across multiple tune records', () => {
    mkdirSync(tempDir, { recursive: true })
    const rec1 = {
      timestamp: '2026-01-01',
      fixes: [
        { agent: 'sparq-automation-engineer', section: '<constants>', technique: 'PE-2' },
        { agent: 'sparq-automation-engineer', section: '<done_criteria>', technique: 'PE-1' },
      ],
    }
    const rec2 = {
      timestamp: '2026-01-02',
      fixes: [
        { agent: 'sparq-test-validator', section: '<constants>', technique: 'PE-4' },
        { agent: 'sparq-automation-engineer', section: '<few_shot_examples>', technique: 'PE-3' },
      ],
    }
    writeFileSync(join(tempDir, '2026-01-01T00-00-00-tune.json'), JSON.stringify(rec1), 'utf-8')
    writeFileSync(join(tempDir, '2026-01-02T00-00-00-tune.json'), JSON.stringify(rec2), 'utf-8')

    const result = getProtectedSections({ tuneDir: tempDir })
    assert.ok(result['sparq-automation-engineer'])
    assert.ok(result['sparq-automation-engineer'].includes('<constants>'))
    assert.ok(result['sparq-automation-engineer'].includes('<done_criteria>'))
    assert.ok(result['sparq-automation-engineer'].includes('<few_shot_examples>'))
    assert.ok(result['sparq-test-validator'])
    assert.ok(result['sparq-test-validator'].includes('<constants>'))
  })

  it('should deduplicate sections within same agent', () => {
    mkdirSync(tempDir, { recursive: true })
    const rec = {
      timestamp: '2026-01-01',
      fixes: [
        { agent: 'sparq-orchestrator', section: '<constants>', technique: 'PE-2' },
        { agent: 'sparq-orchestrator', section: '<constants>', technique: 'PE-4' },
      ],
    }
    writeFileSync(join(tempDir, '2026-01-01T00-00-00-tune.json'), JSON.stringify(rec), 'utf-8')

    const result = getProtectedSections({ tuneDir: tempDir })
    assert.equal(result['sparq-orchestrator'].length, 1)
  })
})

// ---------------------------------------------------------------------------
// GAP 3.3: optimize gate
// ---------------------------------------------------------------------------

describe('optimize gate', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should return needsReeval=false when no marker exists', () => {
    const result = checkOptimizeGate({ dataDir: tempDir })
    assert.equal(result.needsReeval, false)
  })

  it('should return needsReeval=true after setOptimizeMarker', () => {
    setOptimizeMarker({ dataDir: tempDir })
    const result = checkOptimizeGate({ dataDir: tempDir })
    assert.equal(result.needsReeval, true)
    assert.ok(result.reason.includes('re-eval required'))
  })

  it('should clear marker with clearOptimizeMarker', () => {
    setOptimizeMarker({ dataDir: tempDir })
    assert.equal(checkOptimizeGate({ dataDir: tempDir }).needsReeval, true)
    clearOptimizeMarker({ dataDir: tempDir })
    assert.equal(checkOptimizeGate({ dataDir: tempDir }).needsReeval, false)
  })

  it('should handle clearOptimizeMarker when no marker exists', () => {
    assert.doesNotThrow(() => clearOptimizeMarker({ dataDir: tempDir }))
  })
})
