import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluateRunPolicy } from '../../bin/lib/eval/policy.mjs'

describe('evaluateRunPolicy', () => {
  it('fails strict runs when a case is not evaluated', () => {
    const policy = evaluateRunPolicy(
      [
        {
          caseName: 's6',
          status: 'no-outputs',
          score: 0,
          maxScore: 0,
          skippedRubrics: [],
          requiredRubricsSkipped: 0,
        },
      ],
      { strict: true, allowSkips: false, passThreshold: 75 },
    )
    assert.equal(policy.runStatus, 'FAIL')
    assert.ok(policy.failures.some((f) => f.type === 'non-evaluated'))
  })

  it('allows non-evaluated cases in exploratory allow-skips mode', () => {
    const policy = evaluateRunPolicy(
      [
        {
          caseName: 's6',
          status: 'no-outputs',
          score: 0,
          maxScore: 0,
          skippedRubrics: [],
          requiredRubricsSkipped: 0,
        },
      ],
      { strict: true, allowSkips: true, passThreshold: 75 },
    )
    assert.equal(policy.runStatus, 'PASS')
    assert.equal(policy.failures.length, 0)
  })

  it('fails strict runs when required rubrics are skipped', () => {
    const policy = evaluateRunPolicy(
      [
        {
          caseName: 's2',
          status: 'evaluated',
          score: 80,
          maxScore: 100,
          skippedRubrics: [{ rubric: 'code-quality-grader', reason: 'model-required' }],
          requiredRubricsSkipped: 1,
        },
      ],
      { strict: true, allowSkips: false, passThreshold: 75 },
    )
    assert.equal(policy.runStatus, 'FAIL')
    assert.ok(policy.failures.some((f) => f.type === 'required-rubric-skipped'))
    assert.equal(policy.requiredRubricsSkipped, 1)
  })

  it('enforces optimize gate until strict clean pass is achieved', () => {
    const policy = evaluateRunPolicy(
      [
        {
          caseName: 's3',
          status: 'evaluated',
          score: 70,
          maxScore: 100,
          skippedRubrics: [],
          requiredRubricsSkipped: 0,
        },
      ],
      { strict: true, allowSkips: false, passThreshold: 75, optimizeGatePending: true },
    )
    assert.equal(policy.runStatus, 'FAIL')
    assert.equal(policy.gateCanClear, false)
    assert.ok(policy.failures.some((f) => f.type === 'optimize-gate'))
  })

  it('marks optimize gate clearable after strict clean pass', () => {
    const policy = evaluateRunPolicy(
      [
        {
          caseName: 's3',
          status: 'evaluated',
          score: 90,
          maxScore: 100,
          skippedRubrics: [],
          requiredRubricsSkipped: 0,
        },
      ],
      { strict: true, allowSkips: false, passThreshold: 75, optimizeGatePending: true },
    )
    assert.equal(policy.runStatus, 'PASS')
    assert.equal(policy.gateCanClear, true)
  })
})
