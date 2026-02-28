import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// handoff-compliance rubric
// ---------------------------------------------------------------------------

describe('handoff-compliance rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const result = evaluate('{}', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
    assert.equal(result.maxScore, 8)
  })

  it('should return score 0 with finding when no valid JSON found', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const result = evaluate('This is plain text with no JSON', [])
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 8)
    assert.ok(result.findings.length > 0)
    assert.ok(
      result.findings.some((f) => /no handoff/i.test(typeof f === 'string' ? f : f.message)),
    )
  })

  it('should score 8/8 for a valid handoff JSON with all required fields', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = JSON.stringify({
      version: '1.0',
      from: 'sparq-requirements-analyst',
      to: 'sparq-automation-engineer',
      scenario: 'S2',
      phase: 'P1',
      status: 'success',
      report: {
        counts: { requirements: 5, testCases: 10 },
        artifacts: ['requirements.md', 'test-cases.md'],
      },
    })
    const result = evaluate(handoff, [])
    assert.equal(result.score, 8, `Expected 8/8, findings: ${JSON.stringify(result.findings)}`)
    assert.equal(result.maxScore, 8)
    assert.equal(result.findings.length, 0)
  })

  it('should produce a finding for wrong version', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = JSON.stringify({
      version: '2.0',
      from: 'sparq-requirements-analyst',
      to: 'sparq-automation-engineer',
      scenario: 'S2',
      phase: 'P1',
      status: 'success',
      report: {
        counts: { requirements: 5 },
        artifacts: [],
      },
    })
    const result = evaluate(handoff, [])
    assert.ok(
      result.findings.some((f) => /version/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag wrong version: ${JSON.stringify(result.findings)}`,
    )
    assert.ok(result.score < 8)
  })

  it('should produce a finding when "from" does not start with sparq-', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = JSON.stringify({
      version: '1.0',
      from: 'requirements-analyst',
      to: 'sparq-automation-engineer',
      scenario: 'S1',
      phase: 'P0',
      status: 'success',
      report: { counts: {}, artifacts: [] },
    })
    const result = evaluate(handoff, [])
    assert.ok(
      result.findings.some((f) => /from/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag invalid "from": ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for an invalid status value', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = JSON.stringify({
      version: '1.0',
      from: 'sparq-orchestrator',
      to: 'sparq-automation-engineer',
      scenario: 'S3',
      phase: 'P2',
      status: 'pending',
      report: { counts: {}, artifacts: [] },
    })
    const result = evaluate(handoff, [])
    assert.ok(
      result.findings.some((f) => /status/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag invalid status: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding when status is "failed" and gaps array is missing', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = JSON.stringify({
      version: '1.0',
      from: 'sparq-automation-engineer',
      to: 'sparq-orchestrator',
      scenario: 'S2',
      phase: 'P2',
      status: 'failed',
      report: { counts: {}, artifacts: [] },
    })
    const result = evaluate(handoff, [])
    assert.ok(
      result.findings.some((f) => /gaps/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag missing gaps when status=failed: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass failed-gaps check when status is "failed" and gaps has entries', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = JSON.stringify({
      version: '1.0',
      from: 'sparq-automation-engineer',
      to: 'sparq-orchestrator',
      scenario: 'S2',
      phase: 'P2',
      status: 'failed',
      gaps: ['Could not access Jira'],
      report: { counts: {}, artifacts: [] },
    })
    const result = evaluate(handoff, [])
    assert.ok(
      !result.findings.some((f) => /gaps/i.test(typeof f === 'string' ? f : f.message)),
      `Should not flag gaps when present: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for an invalid scenario format', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = JSON.stringify({
      version: '1.0',
      from: 'sparq-orchestrator',
      to: 'sparq-requirements-analyst',
      scenario: 'S9',
      phase: 'P1',
      status: 'success',
      report: { counts: {}, artifacts: [] },
    })
    const result = evaluate(handoff, [])
    assert.ok(
      result.findings.some((f) => /scenario/i.test(typeof f === 'string' ? f : f.message)),
      `Should flag invalid scenario: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should accept handoff JSON embedded in a markdown fenced code block', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = {
      version: '1.0',
      from: 'sparq-requirements-analyst',
      to: 'sparq-orchestrator',
      scenario: 'S1',
      phase: 'P1',
      status: 'partial',
      report: { counts: { requirements: 3 }, artifacts: ['requirements.md'] },
    }
    const content = `## Handoff\n\`\`\`json\n${JSON.stringify(handoff, null, 2)}\n\`\`\``
    const result = evaluate(content, [])
    assert.equal(
      result.score,
      8,
      `Fenced block should score 8/8: ${JSON.stringify(result.findings)}`,
    )
  })
})
