import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// cross-output-consistency rubric
// ---------------------------------------------------------------------------

describe('cross-output-consistency rubric', () => {
  it('should skip content with only one type of IDs', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    const result = evaluate('Some text with REQ-LOGIN-001 and REQ-LOGIN-002 only', [])
    assert.equal(result.skipped, true)
    assert.equal(result.maxScore, 0)
  })

  it('should score 5/5 for consistent REQ and TC IDs cross-referenced throughout', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    // REQ-LOGIN-001 appears as definition AND reference; TC-LOGIN-HP-001 appears twice
    const content = [
      '# Requirements',
      '- REQ-LOGIN-001: User can log in with email and password',
      '',
      '# Test Cases',
      '## Summary',
      '| TC-LOGIN-HP-001 | Happy path login | REQ-LOGIN-001 |',
      '',
      '## Test Cases',
      '### TC-LOGIN-HP-001',
      'Traces to: REQ-LOGIN-001',
      'Steps: navigate, fill, submit',
    ].join('\n')
    const result = evaluate(content, [])
    assert.equal(result.maxScore, 5)
    assert.equal(result.score, 5, `Expected 5/5, findings: ${JSON.stringify(result.findings)}`)
  })

  it('should produce a finding when REQ IDs are defined but never referenced in test content', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    // REQ-FEAT-001 defined once, TC-FEAT-HP-001 defined once — REQ orphaned
    const content = [
      '# Requirements',
      '- REQ-FEAT-001: Some requirement',
      '',
      '# Test Cases',
      '### TC-FEAT-HP-001',
      'Steps: do something',
    ].join('\n')
    const result = evaluate(content, [])
    // Both IDs appear only once — phantom check should fire
    assert.ok(result.findings.length > 0, `Should produce findings: ${JSON.stringify(result)}`)
  })

  it('should produce a finding for feature slug mismatch between REQ and TC', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    // REQ uses ALPHA slug, TC uses BETA slug — misaligned
    const content = [
      '# Requirements',
      '- REQ-ALPHA-001: Alpha feature requirement',
      '- REQ-ALPHA-001: Referenced again here',
      '',
      '# Test Cases',
      '### TC-BETA-HP-001',
      'TC-BETA-HP-001 Traces to: REQ-ALPHA-001',
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /slug/i.test(msg) || /mismatch/i.test(msg)
      }),
      `Should flag feature slug mismatch: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for phantom IDs that appear only once', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    // Many IDs each appear only once (high phantom rate)
    const content = [
      '# IDs only used once each',
      'REQ-FOO-001 and TC-FOO-HP-001',
      'REQ-FOO-002 and TC-FOO-HP-002',
      'REQ-FOO-003 and TC-FOO-HP-003',
      'REQ-FOO-004 and TC-FOO-HP-004',
      'REQ-FOO-005 and TC-FOO-HP-005',
    ].join('\n')
    const result = evaluate(content, [])
    // phantom rate > 20% should be flagged
    const hasPhantomFinding = result.findings.some((f) => {
      const msg = typeof f === 'string' ? f : (f.message ?? String(f))
      return /phantom/i.test(msg)
    })
    // With all IDs appearing only once, phantom rate = 100% — should fail check 4
    assert.ok(hasPhantomFinding, `Should flag phantom IDs: ${JSON.stringify(result.findings)}`)
  })

  it('should pass count consistency when handoff testCases count matches TC IDs present', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    // 2 TC IDs present, handoff says testCases: 2
    const content = [
      '"testCases": 2',
      'REQ-CART-001: Add item to cart',
      'REQ-CART-001: Referenced in test case below',
      '### TC-CART-HP-001',
      'TC-CART-HP-001 traces to REQ-CART-001',
      '### TC-CART-VE-001',
      'TC-CART-VE-001 traces to REQ-CART-001',
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /count mismatch/i.test(msg)
      }),
      `Should not flag count mismatch when counts match: ${JSON.stringify(result.findings)}`,
    )
  })
})
