import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// Dynamically import the module under test
const {
  PASS_THRESHOLD,
  saveResults,
  compareToBaseline,
  auditPrompts,
  showTrends,
  detectConvergence,
  loadLatestResults,
  parseReflection,
  loadLatestReflection,
  atomicWriteSync,
} = await import('../../bin/lib/commands/eval-reflect.mjs')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResults(overrides = []) {
  return [
    { caseName: 'case-a', status: 'evaluated', score: 8, maxScore: 10, ...overrides[0] },
    { caseName: 'case-b', status: 'evaluated', score: 5, maxScore: 10, ...overrides[1] },
  ]
}

function makeStats() {
  return { apiCalls: 0, inputTokens: 0, outputTokens: 0, startTime: Date.now() }
}

function readDir(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
}

// ---------------------------------------------------------------------------
// 0. PASS_THRESHOLD
// ---------------------------------------------------------------------------

describe('PASS_THRESHOLD', () => {
  it('should be exported and equal 75', () => {
    assert.equal(PASS_THRESHOLD, 75)
  })
})

// ---------------------------------------------------------------------------
// 1. saveResults
// ---------------------------------------------------------------------------

describe('saveResults', () => {
  let logMock
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    logMock = mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    logMock.mock.restore()
    cleanTempDir(tempDir)
  })

  it('should create runs directory if missing', () => {
    const runsDir = join(tempDir, 'runs')
    assert.ok(!existsSync(runsDir), 'runs dir should not exist before test')
    saveResults([], makeStats(), 'mock', { dataDir: tempDir })
    assert.ok(existsSync(runsDir), 'runs dir should be created')
  })

  it('should save file with millisecond timestamp-model filename format', () => {
    const stats = { apiCalls: 1, inputTokens: 100, outputTokens: 50, startTime: Date.now() }
    saveResults([], stats, 'haiku', { dataDir: tempDir })
    const files = readDir(join(tempDir, 'runs'))
    assert.equal(files.length, 1)
    assert.match(files[0], /^\d{8}-\d{6}\.\d{3}-haiku\.json$/)
  })

  it('should save JSON with correct schema fields', () => {
    const results = makeResults()
    const stats = { apiCalls: 3, inputTokens: 500, outputTokens: 200, startTime: Date.now() - 100 }
    saveResults(results, stats, 'sonnet', { dataDir: tempDir })
    const files = readDir(join(tempDir, 'runs'))
    const data = JSON.parse(readFileSync(join(tempDir, 'runs', files[0]), 'utf-8'))

    assert.equal(data.version, '3.0')
    assert.ok(data.timestamp, 'should have timestamp')
    assert.equal(data.model, 'sonnet')
    assert.equal(data.passThreshold, 75)
    assert.ok(data.stats, 'should have stats')
    assert.ok(Array.isArray(data.cases), 'cases should be array')
    assert.ok(data.summary, 'should have summary')
  })

  it('should compute summary correctly', () => {
    const results = makeResults()
    saveResults(results, makeStats(), 'mock', { dataDir: tempDir })
    const files = readDir(join(tempDir, 'runs'))
    const data = JSON.parse(readFileSync(join(tempDir, 'runs', files[0]), 'utf-8'))

    assert.equal(data.summary.totalScore, 13) // 8 + 5
    assert.equal(data.summary.totalMaxScore, 20) // 10 + 10
    assert.equal(data.summary.percentage, 65) // round(13/20 * 100)
    assert.equal(data.summary.evaluated, 2)
    assert.equal(data.summary.passed, 1) // case-a at 80% >= 75, case-b at 50% < 75
    assert.equal(data.summary.failed, 1)
  })

  it('should also save baseline when options.baseline is true', () => {
    saveResults(makeResults(), makeStats(), 'haiku', { baseline: true, dataDir: tempDir })
    const modelDir = join(tempDir, 'baselines', 'haiku')
    assert.ok(existsSync(modelDir), 'baselines/haiku dir should be created')
    const files = readdirSync(modelDir).filter((f) => f.endsWith('.json'))
    assert.equal(files.length, 2, 'should save one baseline per evaluated case')
  })

  it('should produce valid JSON via atomic write', () => {
    saveResults(makeResults(), makeStats(), 'mock', { baseline: true, dataDir: tempDir })
    const files = readDir(join(tempDir, 'runs'))
    const data = JSON.parse(readFileSync(join(tempDir, 'runs', files[0]), 'utf-8'))
    assert.equal(data.version, '3.0')
    const modelDir = join(tempDir, 'baselines', 'mock')
    const bFiles = readdirSync(modelDir).filter((f) => f.endsWith('.json'))
    assert.ok(bFiles.length > 0, 'per-case baseline files should exist')
    const baseline = JSON.parse(readFileSync(join(modelDir, bFiles[0]), 'utf-8'))
    assert.equal(baseline.version, '3.0')
  })

  it('should leave no orphaned .tmp files after write', () => {
    saveResults(makeResults(), makeStats(), 'mock', { baseline: true, dataDir: tempDir })
    const runsTmp = readdirSync(join(tempDir, 'runs')).filter((f) => f.endsWith('.tmp'))
    assert.equal(runsTmp.length, 0, 'no .tmp files in runs/')
    const modelDir = join(tempDir, 'baselines', 'mock')
    const baselinesTmp = readdirSync(modelDir).filter((f) => f.endsWith('.tmp'))
    assert.equal(baselinesTmp.length, 0, 'no .tmp files in baselines/mock/')
  })

  it('should include agentChecksums in baseline metadata (GAP 6.2)', () => {
    saveResults(makeResults(), makeStats(), 'mock', { baseline: true, dataDir: tempDir })
    const modelDir = join(tempDir, 'baselines', 'mock')
    const bFiles = readdirSync(modelDir).filter((f) => f.endsWith('.json'))
    const baseline = JSON.parse(readFileSync(join(modelDir, bFiles[0]), 'utf-8'))
    assert.ok(baseline.agentChecksums, 'should have agentChecksums')
    assert.ok(typeof baseline.agentChecksums === 'object', 'agentChecksums should be object')
    // Should have at least the orchestrator
    const keys = Object.keys(baseline.agentChecksums)
    assert.ok(keys.length >= 5, `Expected >= 5 agent checksums, got ${keys.length}`)
    // Each checksum is an 8-char hex string
    for (const val of Object.values(baseline.agentChecksums)) {
      assert.match(val, /^[a-f0-9]{8}$/, `Invalid checksum format: ${val}`)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. compareToBaseline
// ---------------------------------------------------------------------------

describe('compareToBaseline', () => {
  let logMock
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    logMock = mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    logMock.mock.restore()
    cleanTempDir(tempDir)
  })

  it('should return null when no baseline file exists', () => {
    const result = compareToBaseline(makeResults(), 'nonexistent', { dataDir: tempDir })
    assert.equal(result, null)
  })

  it('should return correct delta when baseline exists', () => {
    // Create a baseline with 50% overall
    const baselinesDir = join(tempDir, 'baselines')
    mkdirSync(baselinesDir, { recursive: true })
    const baseline = {
      version: '1.0',
      model: 'mock',
      cases: [
        { caseName: 'case-a', status: 'evaluated', score: 5, maxScore: 10 },
        { caseName: 'case-b', status: 'evaluated', score: 5, maxScore: 10 },
      ],
      summary: {
        totalScore: 10,
        totalMaxScore: 20,
        percentage: 50,
        evaluated: 2,
        passed: 0,
        failed: 2,
      },
    }
    writeFileSync(join(baselinesDir, 'mock.json'), JSON.stringify(baseline), 'utf-8')

    // Current results: case-a=80%, case-b=50% -> overall 65%
    const result = compareToBaseline(makeResults(), 'mock', { dataDir: tempDir })
    assert.ok(result !== null)
    assert.equal(result.baselinePct, 50)
    assert.equal(result.currentPct, 65)
    assert.equal(result.delta, 15)
  })

  it('should identify regressions where current < baseline per-case', () => {
    const baselinesDir = join(tempDir, 'baselines')
    mkdirSync(baselinesDir, { recursive: true })
    const baseline = {
      version: '1.0',
      model: 'mock',
      cases: [
        { caseName: 'case-a', status: 'evaluated', score: 10, maxScore: 10 },
        { caseName: 'case-b', status: 'evaluated', score: 8, maxScore: 10 },
      ],
      summary: {
        totalScore: 18,
        totalMaxScore: 20,
        percentage: 90,
        evaluated: 2,
        passed: 2,
        failed: 0,
      },
    }
    writeFileSync(join(baselinesDir, 'mock.json'), JSON.stringify(baseline), 'utf-8')

    // Current: case-a=80% (regressed from 100%), case-b=50% (regressed from 80%)
    const result = compareToBaseline(makeResults(), 'mock', { dataDir: tempDir })
    assert.ok(result !== null)
    assert.deepEqual(result.regressions, ['case-a', 'case-b'])
  })

  it('should return direction field in comparison result (GAP 3.4)', () => {
    const baselinesDir = join(tempDir, 'baselines')
    mkdirSync(baselinesDir, { recursive: true })
    const baseline = {
      version: '1.0',
      model: 'mock',
      cases: [
        { caseName: 'case-a', status: 'evaluated', score: 5, maxScore: 10 },
        { caseName: 'case-b', status: 'evaluated', score: 5, maxScore: 10 },
      ],
      summary: {
        totalScore: 10,
        totalMaxScore: 20,
        percentage: 50,
        evaluated: 2,
        passed: 0,
        failed: 2,
      },
    }
    writeFileSync(join(baselinesDir, 'mock.json'), JSON.stringify(baseline), 'utf-8')

    const result = compareToBaseline(makeResults(), 'mock', { dataDir: tempDir })
    assert.ok(result !== null)
    assert.ok('direction' in result, 'should have direction field')
    // Delta is +15%, so direction should be improving
    assert.equal(result.direction, 'improving')
  })

  it('should report stable when delta is within ±2%', () => {
    const modelDir = join(tempDir, 'baselines', 'mock')
    mkdirSync(modelDir, { recursive: true })
    // Create per-case baselines matching current results almost exactly
    writeFileSync(
      join(modelDir, 'case-a.json'),
      JSON.stringify({
        version: '2.0',
        model: 'mock',
        case: { caseName: 'case-a', status: 'evaluated', score: 8, maxScore: 10 },
      }),
      'utf-8',
    )
    writeFileSync(
      join(modelDir, 'case-b.json'),
      JSON.stringify({
        version: '2.0',
        model: 'mock',
        case: { caseName: 'case-b', status: 'evaluated', score: 5, maxScore: 10 },
      }),
      'utf-8',
    )

    const result = compareToBaseline(makeResults(), 'mock', { dataDir: tempDir })
    assert.ok(result !== null)
    assert.equal(result.direction, 'stable')
  })
})

// ---------------------------------------------------------------------------
// 3. auditPrompts
// ---------------------------------------------------------------------------

describe('auditPrompts', () => {
  let logMock

  beforeEach(() => {
    logMock = mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    logMock.mock.restore()
  })

  it('should return agents array with expected properties', () => {
    const result = auditPrompts()
    assert.ok(Array.isArray(result.agents))
    assert.ok(result.agents.length >= 5, `Expected >= 5 agents, got ${result.agents.length}`)
    for (const agent of result.agents) {
      assert.ok(typeof agent.name === 'string')
      assert.ok(typeof agent.lines === 'number')
      assert.ok(typeof agent.hasRequiredSections === 'boolean')
      assert.ok(Array.isArray(agent.warnings))
    }
  })

  it('should detect agents exceeding 300 lines', () => {
    const result = auditPrompts()
    for (const agent of result.agents) {
      if (agent.lines > 300) {
        assert.ok(
          agent.warnings.some((w) => w.includes('>300')),
          `${agent.name} exceeds 300 lines but has no warning`,
        )
      }
    }
  })

  it('should detect missing required XML tags', () => {
    const result = auditPrompts()
    for (const agent of result.agents) {
      if (!agent.hasRequiredSections) {
        assert.ok(agent.warnings.length > 0, `${agent.name} missing sections but no warnings`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 4. showTrends
// ---------------------------------------------------------------------------

describe('showTrends', () => {
  let logMock
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    logMock = mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    logMock.mock.restore()
    cleanTempDir(tempDir)
  })

  it('should handle missing runs directory gracefully', () => {
    // Should not throw
    showTrends(undefined, { dataDir: tempDir })
  })

  it('should filter by modelKey when provided', () => {
    const runsDir = join(tempDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    const run = { summary: { percentage: 80 }, model: 'haiku', timestamp: '2025-01-01T00:00:00Z' }
    writeFileSync(join(runsDir, '20250101-000000-haiku.json'), JSON.stringify(run), 'utf-8')
    writeFileSync(
      join(runsDir, '20250101-000000-sonnet.json'),
      JSON.stringify({ ...run, model: 'sonnet' }),
      'utf-8',
    )

    showTrends('haiku', { dataDir: tempDir })
    // Verify it ran without error — the logMock captured output
    const calls = logMock.mock.calls.map((c) => c.arguments.join(' '))
    assert.ok(
      calls.some((c) => c.includes('haiku')),
      'Should show haiku in output',
    )
  })
})

// ---------------------------------------------------------------------------
// 5. loadLatestResults
// ---------------------------------------------------------------------------

describe('loadLatestResults', () => {
  let logMock
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    logMock = mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    logMock.mock.restore()
    cleanTempDir(tempDir)
  })

  it('should return null when no runs directory exists', () => {
    assert.equal(loadLatestResults(undefined, { dataDir: tempDir }), null)
  })

  it('should return null when no matching files exist', () => {
    mkdirSync(join(tempDir, 'runs'), { recursive: true })
    assert.equal(loadLatestResults('opus', { dataDir: tempDir }), null)
  })

  it('should return parsed JSON of the latest file', () => {
    const runsDir = join(tempDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    const older = { version: '1.0', model: 'mock', summary: { percentage: 60 } }
    const newer = { version: '1.0', model: 'mock', summary: { percentage: 80 } }
    writeFileSync(join(runsDir, '20250101-000000-mock.json'), JSON.stringify(older), 'utf-8')
    writeFileSync(join(runsDir, '20250102-000000-mock.json'), JSON.stringify(newer), 'utf-8')

    const result = loadLatestResults('mock', { dataDir: tempDir })
    assert.ok(result !== null)
    assert.equal(result.summary.percentage, 80)
  })

  it('should return null and warn when JSON is corrupted', () => {
    const runsDir = join(tempDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    writeFileSync(join(runsDir, '20250101-000000-mock.json'), 'NOT JSON', 'utf-8')
    const result = loadLatestResults('mock', { dataDir: tempDir })
    assert.equal(result, null)
  })

  it('should return latest across all models when modelKey is undefined', () => {
    const runsDir = join(tempDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    const haiku = { version: '1.0', model: 'haiku', summary: { percentage: 70 } }
    const sonnet = { version: '1.0', model: 'sonnet', summary: { percentage: 90 } }
    writeFileSync(join(runsDir, '20250101-000000-haiku.json'), JSON.stringify(haiku), 'utf-8')
    writeFileSync(join(runsDir, '20250102-000000-sonnet.json'), JSON.stringify(sonnet), 'utf-8')

    const result = loadLatestResults(undefined, { dataDir: tempDir })
    assert.ok(result !== null)
    assert.equal(result.model, 'sonnet')
  })
})

// ---------------------------------------------------------------------------
// 6. parseReflection (GAP 4.1)
// ---------------------------------------------------------------------------

describe('parseReflection', () => {
  it('should validate a well-formed reflection report', () => {
    const content = [
      '# Eval Reflection — 20260213',
      '',
      '## Metadata',
      '- Run: 20260213-120000.000-mock.json',
      '- Model: mock',
      '- Iteration: 1 since baseline',
      '- Convergence: healthy',
      '',
      '## Summary',
      '- Failing: 2/10 cases',
      '',
      '## Priority Fixes',
      '1. **sparq-automation-engineer** `<constants>` — convention_violation',
      '2. **sparq-automation-engineer** `<done_criteria>` — missing_pattern',
      '',
      '## Per-Case Analysis',
      '### s2-manual-to-e2e (60%)',
      '- playwright-syntax: no get accessors',
      '### s6-bug-regression (40%)',
      '- regression-compliance: missing REG IDs',
    ].join('\n')

    const result = parseReflection(content)
    assert.equal(result.valid, true, `Expected valid, errors: ${result.errors}`)
    assert.equal(result.metadata.Run, '20260213-120000.000-mock.json')
    assert.equal(result.metadata.Model, 'mock')
    assert.equal(result.fixes.length, 2)
    assert.equal(result.fixes[0].rank, 1)
    assert.ok(result.fixes[0].text.includes('sparq-automation-engineer'))
    assert.equal(result.cases.length, 2)
    assert.equal(result.cases[0].name, 's2-manual-to-e2e')
    assert.equal(result.cases[0].percentage, 60)
  })

  it('should report errors for missing sections', () => {
    const content = '# Eval Reflection\n\nSome text without proper sections'
    const result = parseReflection(content)
    assert.equal(result.valid, false)
    assert.ok(result.errors.length >= 3, `Expected >= 3 errors, got ${result.errors.length}`)
    assert.ok(result.errors.some((e) => e.includes('## Metadata')))
    assert.ok(result.errors.some((e) => e.includes('## Summary')))
    assert.ok(result.errors.some((e) => e.includes('## Priority Fixes')))
  })

  it('should report errors for missing metadata fields', () => {
    const content = [
      '## Metadata',
      '- Iteration: 1',
      '',
      '## Summary',
      '- Failing: 0',
      '',
      '## Priority Fixes',
      '1. **agent** fix',
    ].join('\n')

    const result = parseReflection(content)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('Run')))
    assert.ok(result.errors.some((e) => e.includes('Model')))
  })
})

// ---------------------------------------------------------------------------
// 7. loadLatestReflection (GAP 4.1)
// ---------------------------------------------------------------------------

describe('loadLatestReflection', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should return null when no reflections directory exists', () => {
    assert.equal(loadLatestReflection({ dataDir: tempDir }), null)
  })

  it('should return null when reflections directory is empty', () => {
    mkdirSync(join(tempDir, 'reflections'), { recursive: true })
    assert.equal(loadLatestReflection({ dataDir: tempDir }), null)
  })

  it('should return latest reflection file with parsed content', () => {
    const reflectDir = join(tempDir, 'reflections')
    mkdirSync(reflectDir, { recursive: true })
    const content = [
      '## Metadata',
      '- Run: 20260213-mock.json',
      '- Model: mock',
      '',
      '## Summary',
      '- Failing: 1/5',
      '',
      '## Priority Fixes',
      '1. **sparq-orchestrator** fix',
    ].join('\n')
    writeFileSync(join(reflectDir, '20260213-120000.md'), content, 'utf-8')

    const result = loadLatestReflection({ dataDir: tempDir })
    assert.ok(result !== null)
    assert.equal(result.filename, '20260213-120000.md')
    assert.ok(result.parsed.valid)
    assert.equal(result.parsed.metadata.Model, 'mock')
  })
})

// ---------------------------------------------------------------------------
// 8. atomicWriteSync (GAP 6.3)
// ---------------------------------------------------------------------------

describe('atomicWriteSync', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should write file atomically with no .tmp remnants', () => {
    const filePath = join(tempDir, 'test-file.json')
    atomicWriteSync(filePath, '{"test": true}')
    assert.ok(existsSync(filePath), 'File should exist')
    assert.equal(readFileSync(filePath, 'utf-8'), '{"test": true}')
    const tmpFiles = readdirSync(tempDir).filter((f) => f.endsWith('.tmp'))
    assert.equal(tmpFiles.length, 0, 'No .tmp files should remain')
  })

  it('should overwrite existing file atomically', () => {
    const filePath = join(tempDir, 'test-file.json')
    writeFileSync(filePath, 'old content', 'utf-8')
    atomicWriteSync(filePath, 'new content')
    assert.equal(readFileSync(filePath, 'utf-8'), 'new content')
  })
})

// ---------------------------------------------------------------------------
// 9. detectConvergence (GAP 3.1)
// ---------------------------------------------------------------------------

describe('detectConvergence', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  function writeRun(filename, caseName, score, maxScore) {
    const runsDir = join(tempDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    const payload = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      model: 'mock',
      cases: [{ caseName, status: 'evaluated', score, maxScore }],
    }
    writeFileSync(join(runsDir, filename), JSON.stringify(payload), 'utf-8')
  }

  it('should return insufficient-data when no runs exist', () => {
    const result = detectConvergence('case-a', 'mock', { dataDir: tempDir })
    assert.equal(result.status, 'insufficient-data')
    assert.equal(result.iterations, 0)
  })

  it('should return insufficient-data with only 1 run', () => {
    writeRun('20260101-000000.000-mock.json', 'case-a', 60, 100)
    const result = detectConvergence('case-a', 'mock', { dataDir: tempDir })
    assert.equal(result.status, 'insufficient-data')
    assert.equal(result.iterations, 1)
  })

  it('should detect oscillating scores across 3+ runs', () => {
    writeRun('20260101-000000.000-mock.json', 'case-a', 60, 100)
    writeRun('20260102-000000.000-mock.json', 'case-a', 70, 100)
    writeRun('20260103-000000.000-mock.json', 'case-a', 55, 100)
    writeRun('20260104-000000.000-mock.json', 'case-a', 75, 100)
    const result = detectConvergence('case-a', 'mock', { dataDir: tempDir })
    assert.equal(result.status, 'oscillating')
    assert.ok(result.message.includes('oscillating'))
    assert.deepEqual(result.scores, [60, 70, 55, 75])
  })

  it('should detect stagnant scores with < 2% range', () => {
    writeRun('20260101-000000.000-mock.json', 'case-a', 65, 100)
    writeRun('20260102-000000.000-mock.json', 'case-a', 65, 100)
    writeRun('20260103-000000.000-mock.json', 'case-a', 65, 100)
    const result = detectConvergence('case-a', 'mock', { dataDir: tempDir })
    assert.equal(result.status, 'stagnant')
    assert.ok(result.message.includes('stagnant'))
  })

  it('should detect exhausted after 5+ runs without improvement', () => {
    writeRun('20260101-000000.000-mock.json', 'case-a', 60, 100)
    writeRun('20260102-000000.000-mock.json', 'case-a', 58, 100)
    writeRun('20260103-000000.000-mock.json', 'case-a', 55, 100)
    writeRun('20260104-000000.000-mock.json', 'case-a', 53, 100)
    writeRun('20260105-000000.000-mock.json', 'case-a', 50, 100)
    const result = detectConvergence('case-a', 'mock', { dataDir: tempDir })
    assert.equal(result.status, 'exhausted')
    assert.ok(result.message.includes('without net improvement'))
  })

  it('should return healthy for improving scores', () => {
    writeRun('20260101-000000.000-mock.json', 'case-a', 50, 100)
    writeRun('20260102-000000.000-mock.json', 'case-a', 60, 100)
    writeRun('20260103-000000.000-mock.json', 'case-a', 70, 100)
    const result = detectConvergence('case-a', 'mock', { dataDir: tempDir })
    assert.equal(result.status, 'healthy')
    assert.deepEqual(result.scores, [50, 60, 70])
  })

  it('should filter by modelKey', () => {
    writeRun('20260101-000000.000-mock.json', 'case-a', 60, 100)
    writeRun('20260101-000000.000-haiku.json', 'case-a', 40, 100)
    writeRun('20260102-000000.000-mock.json', 'case-a', 70, 100)
    const result = detectConvergence('case-a', 'mock', { dataDir: tempDir })
    assert.equal(result.iterations, 2)
    assert.deepEqual(result.scores, [60, 70])
  })
})

// ---------------------------------------------------------------------------
// 10. loadLatestReflection freshness (GAP 4.3)
// ---------------------------------------------------------------------------

describe('loadLatestReflection freshness', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  function makeReflectionContent() {
    return [
      '## Metadata',
      '- Run: 20260210-120000',
      '- Model: mock',
      '',
      '## Summary',
      '2 cases failing',
      '',
      '## Priority Fixes',
      '1. **sparq-automation-engineer** add fixture import rule',
    ].join('\n')
  }

  it('should return staleWarning when 3+ runs are newer', () => {
    const reflectDir = join(tempDir, 'reflections')
    const runsDir = join(tempDir, 'runs')
    mkdirSync(reflectDir, { recursive: true })
    mkdirSync(runsDir, { recursive: true })

    writeFileSync(join(reflectDir, '20260210-120000.md'), makeReflectionContent(), 'utf-8')
    writeFileSync(join(runsDir, '20260211-000000.000-mock.json'), '{}', 'utf-8')
    writeFileSync(join(runsDir, '20260212-000000.000-mock.json'), '{}', 'utf-8')
    writeFileSync(join(runsDir, '20260213-000000.000-mock.json'), '{}', 'utf-8')

    const result = loadLatestReflection({ dataDir: tempDir })
    assert.ok(result.staleWarning)
    assert.ok(result.staleWarning.includes('3'))
    assert.ok(result.staleWarning.includes('stale'))
  })

  it('should return null staleWarning when fewer than 3 newer runs', () => {
    const reflectDir = join(tempDir, 'reflections')
    const runsDir = join(tempDir, 'runs')
    mkdirSync(reflectDir, { recursive: true })
    mkdirSync(runsDir, { recursive: true })

    writeFileSync(join(reflectDir, '20260210-120000.md'), makeReflectionContent(), 'utf-8')
    writeFileSync(join(runsDir, '20260211-000000.000-mock.json'), '{}', 'utf-8')

    const result = loadLatestReflection({ dataDir: tempDir })
    assert.equal(result.staleWarning, null)
  })
})
