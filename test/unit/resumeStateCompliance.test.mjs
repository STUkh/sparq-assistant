import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// resume-state-compliance rubric
// ---------------------------------------------------------------------------

describe('resume-state-compliance rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const result = evaluate('{}', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
    assert.equal(result.maxScore, 7)
  })

  it('should return score 0 with finding when no valid JSON state found', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const result = evaluate('plain text with no JSON', [])
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 7)
    assert.ok(result.findings.length > 0)
    assert.ok(
      result.findings.some((f) => /no valid json/i.test(typeof f === 'string' ? f : f.message)),
    )
  })

  it('should score 7/7 for a valid state JSON with all required fields', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = JSON.stringify({
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S2',
      phase: 'P1',
      phaseStatus: 'agent_dispatched',
      startedAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:30:00Z',
    })
    const result = evaluate(state, [])
    assert.equal(result.score, 7, `Expected 7/7, findings: ${JSON.stringify(result.findings)}`)
    assert.equal(result.maxScore, 7)
    assert.equal(result.findings.length, 0)
  })

  it('should produce a finding for an invalid phaseStatus value', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = JSON.stringify({
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S3',
      phase: 'P2',
      phaseStatus: 'running',
      startedAt: '2025-01-15T10:00:00Z',
    })
    const result = evaluate(state, [])
    assert.ok(
      result.findings.some((f) => /phaseStatus/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag invalid phaseStatus: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for an invalid scenario format', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = JSON.stringify({
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S1+S2',
      phase: 'P1',
      phaseStatus: 'starting',
      startedAt: '2025-01-15T10:00:00Z',
    })
    const result = evaluate(state, [])
    assert.ok(
      result.findings.some((f) => /scenario/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag combined scenario (resume only allows S1-S6): ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding when completedPhases entries are missing required fields', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = JSON.stringify({
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S2',
      phase: 'P2',
      phaseStatus: 'agent_dispatched',
      startedAt: '2025-01-15T10:00:00Z',
      completedPhases: [
        { phase: 'P1', completedAt: '2025-01-15T10:20:00Z' },
        // missing handoffPath and status
      ],
    })
    const result = evaluate(state, [])
    assert.ok(
      result.findings.some((f) => /completedPhases/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag incomplete completedPhases entries: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass completedPhases check when all entries have required fields', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = JSON.stringify({
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S2',
      phase: 'P2',
      phaseStatus: 'agent_dispatched',
      startedAt: '2025-01-15T10:00:00Z',
      completedPhases: [
        {
          phase: 'P1',
          completedAt: '2025-01-15T10:20:00Z',
          handoffPath: '.sparq/handoffs/p1.json',
          status: 'success',
        },
      ],
    })
    const result = evaluate(state, [])
    assert.ok(
      !result.findings.some((f) => /completedPhases/i.test(typeof f === 'string' ? f : f.message)),
      `Should not flag valid completedPhases: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for a non-ISO-8601-Z timestamp', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = JSON.stringify({
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S1',
      phase: 'P1',
      phaseStatus: 'checkpoint_pending',
      startedAt: '2025-01-15 10:00:00',
    })
    const result = evaluate(state, [])
    assert.ok(
      result.findings.some((f) => /timestamp/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag non-ISO-8601-Z timestamp: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding when only configHash is present without configSummary', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = JSON.stringify({
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S2',
      phase: 'P1',
      phaseStatus: 'starting',
      startedAt: '2025-01-15T10:00:00Z',
      configHash: 'abc123',
      // configSummary missing
    })
    const result = evaluate(state, [])
    assert.ok(
      result.findings.some((f) => /configSummary/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag missing configSummary: ${JSON.stringify(result.findings)}`,
    )
  })
})
