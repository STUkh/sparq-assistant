import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// progress-signal-compliance rubric
// ---------------------------------------------------------------------------

describe('progress-signal-compliance rubric', () => {
  it('should return correct interface shape with maxScore 5', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const result = evaluate('[sparq] P1 Starting phase 1', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
    assert.equal(result.maxScore, 5)
  })

  it('should return score 0 with finding when no [sparq] signals found', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const result = evaluate('No signals here. Just plain content without any sparq prefix.', [])
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 5)
    assert.ok(result.findings.length > 0)
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /no progress signals/i.test(msg) || /\[sparq\]/i.test(msg)
      }),
      `Should report missing signals: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score 5/5 for fully compliant progress signals', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = [
      '[sparq] P1 Starting requirements analysis',
      '[sparq] P1 Fetching Jira ticket PROJ-123',
      '[sparq] P1 Complete — 5 requirements extracted',
    ].join('\n')
    const result = evaluate(content, [])
    assert.equal(result.score, 5, `Expected 5/5, findings: ${JSON.stringify(result.findings)}`)
    assert.equal(result.findings.length, 0)
  })

  it('should produce a finding when signal lines lack [sparq] prefix', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    // Lines include [sparq] (so not skipped) but also lines without prefix
    const content = [
      '[sparq] P1 Starting analysis',
      'P1 This line has no sparq prefix but mentions phase',
      '[sparq] P1 Complete',
    ].join('\n')
    // Only lines with [sparq] are extracted as signal lines, so prefix check passes
    // The line without [sparq] is not considered a signal line at all
    // This test verifies rubric correctly isolates only [sparq] lines
    const result = evaluate(content, [])
    assert.equal(result.maxScore, 5)
    // All extracted signal lines do start with [sparq], so check 1 passes
    assert.ok(
      result.score >= 1,
      `Prefix check should pass for valid [sparq] lines: ${JSON.stringify(result)}`,
    )
  })

  it('should produce a finding when phase tags are missing from all signal lines', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = [
      '[sparq] Starting analysis without phase tag',
      '[sparq] Fetching data without phase tag',
      '[sparq] Done without phase tag',
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /phase tag/i.test(msg) || /P0|P1|P2/i.test(msg)
      }),
      `Should flag missing phase tags: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding when phase boundary signals (Starting/Complete) are absent', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = [
      '[sparq] P1 Fetching Jira ticket PROJ-123',
      '[sparq] P1 Processing 5 requirements',
      '[sparq] P1 Generating test cases',
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /boundary/i.test(msg) || /Starting/i.test(msg) || /Complete/i.test(msg)
      }),
      `Should flag missing boundary signals: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding when error signals lack Retry:/Fallback:/Warning: format', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = [
      '[sparq] P1 Starting analysis',
      '[sparq] P1 Complete — done',
      '[sparq] P1 error occurred while fetching data',
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /Retry:|Fallback:|Warning:/i.test(msg) || /error signal/i.test(msg)
      }),
      `Should flag malformatted error signal: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass error format check when error signals use Retry: format', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = [
      '[sparq] P1 Starting analysis',
      '[sparq] P1 Warning: Confluence unreachable, using fallback',
      '[sparq] P1 Retry: Jira timeout — attempt 2/3',
      '[sparq] P1 Complete — requirements extracted',
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /error signal/i.test(msg)
      }),
      `Should not flag properly formatted error signals: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding when signal lines contain emoji characters', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = ['[sparq] P1 Starting analysis \u{1F680}', '[sparq] P1 Complete \u2705'].join(
      '\n',
    )
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /emoji/i.test(msg)
      }),
      `Should flag emoji in signal lines: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should satisfy score <= maxScore invariant for any input', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const cases = [
      'no signals at all',
      '[sparq] P1 Starting test\n[sparq] P1 Complete',
      '[sparq] no phase tag here\n[sparq] also no phase',
      '[sparq] P2 Starting\n[sparq] P2 error bad\n[sparq] P2 Complete',
    ]
    for (const content of cases) {
      const result = evaluate(content, [])
      assert.ok(
        result.score <= result.maxScore,
        `score ${result.score} exceeds maxScore ${result.maxScore} for: ${content.slice(0, 40)}`,
      )
    }
  })
})
