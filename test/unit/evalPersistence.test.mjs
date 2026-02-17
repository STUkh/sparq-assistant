import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  getPromotionEligibility,
  readLatestRun,
  readLatestStrictRun,
  saveCaseBaselines,
  updateBaselinePolicyStateFromRun,
} from '../../bin/lib/eval/persistence.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

function makeCase(score, overrides = {}) {
  return {
    caseName: 'S6: Bug regression from Jira ticket',
    caseFile: 'test/evals/cases/s6-bug-regression.yaml',
    scenario: 'S6',
    status: 'evaluated',
    score,
    maxScore: 100,
    skippedRubrics: [],
    requiredRubricsSkipped: 0,
    ...overrides,
  }
}

describe('eval persistence policy state', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('requires 2 consecutive clean strict passes before promotion', () => {
    updateBaselinePolicyStateFromRun(
      [makeCase(90)],
      'mock',
      { strict: true, passThreshold: 75 },
      {
        dataDir: tempDir,
        optimizeGatePending: false,
      },
    )
    const first = getPromotionEligibility('mock', makeCase(90).caseName, { dataDir: tempDir })
    assert.equal(first.eligible, false)
    assert.ok(first.reason.includes('current: 1'))

    updateBaselinePolicyStateFromRun(
      [makeCase(88)],
      'mock',
      { strict: true, passThreshold: 75 },
      {
        dataDir: tempDir,
        optimizeGatePending: false,
      },
    )
    const second = getPromotionEligibility('mock', makeCase(90).caseName, { dataDir: tempDir })
    assert.equal(second.eligible, true)
  })

  it('resets strict pass streak after a failing run', () => {
    updateBaselinePolicyStateFromRun(
      [makeCase(90)],
      'mock',
      { strict: true, passThreshold: 75 },
      {
        dataDir: tempDir,
        optimizeGatePending: false,
      },
    )
    updateBaselinePolicyStateFromRun(
      [makeCase(60)],
      'mock',
      { strict: true, passThreshold: 75 },
      {
        dataDir: tempDir,
        optimizeGatePending: false,
      },
    )

    const eligibility = getPromotionEligibility('mock', makeCase(90).caseName, { dataDir: tempDir })
    assert.equal(eligibility.eligible, false)
    assert.ok(eligibility.reason.includes('current: 0'))
  })

  it('blocks promotion while optimize gate is pending', () => {
    updateBaselinePolicyStateFromRun(
      [makeCase(92)],
      'mock',
      { strict: true, passThreshold: 75, gateCanClear: false },
      { dataDir: tempDir, optimizeGatePending: true },
    )
    updateBaselinePolicyStateFromRun(
      [makeCase(93)],
      'mock',
      { strict: true, passThreshold: 75, gateCanClear: false },
      { dataDir: tempDir, optimizeGatePending: true },
    )

    const eligibility = getPromotionEligibility('mock', makeCase(90).caseName, { dataDir: tempDir })
    assert.equal(eligibility.eligible, false)
    assert.ok(eligibility.reason.includes('Optimize gate pending'))
  })

  it('saves per-case baseline payload and can read latest run from disk', () => {
    const { written } = saveCaseBaselines([makeCase(85)], 'mock', { dataDir: tempDir })
    assert.equal(written, 1)

    const runsDir = join(tempDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    writeFileSync(
      join(runsDir, '20260213-010101.000-mock.json'),
      JSON.stringify({
        version: '2.0',
        timestamp: '2026-02-13T01:01:01.000Z',
        model: 'mock',
        cases: [makeCase(85)],
      }),
      'utf-8',
    )

    const latest = readLatestRun({ dataDir: tempDir })
    assert.ok(latest)
    assert.equal(latest.run.model, 'mock')
    assert.equal(latest.run.version, '2.0')
  })

  it('reads latest strict run while remaining compatible with older schemas', () => {
    const runsDir = join(tempDir, 'runs')
    mkdirSync(runsDir, { recursive: true })

    writeFileSync(
      join(runsDir, '20260213-010101.000-mock.json'),
      JSON.stringify({
        version: '2.0',
        timestamp: '2026-02-13T01:01:01.000Z',
        model: 'mock',
        strict: false,
        cases: [makeCase(70)],
      }),
      'utf-8',
    )
    writeFileSync(
      join(runsDir, '20260213-020202.000-haiku.json'),
      JSON.stringify({
        version: '3.0',
        timestamp: '2026-02-13T02:02:02.000Z',
        model: 'haiku',
        policy: { strict: true, runStatus: 'PASS' },
        cases: [makeCase(90)],
      }),
      'utf-8',
    )

    const strictLatest = readLatestStrictRun({ dataDir: tempDir })
    assert.ok(strictLatest)
    assert.equal(strictLatest.run.model, 'haiku')
  })
})
