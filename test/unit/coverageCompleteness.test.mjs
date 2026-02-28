// test/unit/coverageCompleteness.test.mjs — Unit tests for coverage-completeness rubric

import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric() {
  const { evaluate } = await import(join(RUBRICS_DIR, 'coverage-completeness.mjs'))
  return evaluate
}

// ---------------------------------------------------------------------------
// Always-on design — no skip logic
// ---------------------------------------------------------------------------
// coverage-completeness is an artifact rubric: lint.mjs routes it exclusively
// to .sparq/*.md files. It is intentionally always-on and reports missing
// categories even when no TC IDs are found — absence is itself a finding.

describe('coverage-completeness — always-on design', () => {
  it('should never return skipped:true for any content', async () => {
    const evaluate = await loadRubric()
    for (const content of ['', 'no tc ids here', 'some markdown', 'TC-AUTH-HP-001']) {
      const result = evaluate(content, [], {})
      assert.ok(!result.skipped, `Should not skip content: "${content.slice(0, 30)}"`)
    }
  })

  it('should always return score, maxScore=5, and findings array', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('', [], {})
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
    assert.ok(Array.isArray(result.findings))
    assert.equal(result.maxScore, 5)
  })

  it('should return score >= 0 and <= maxScore', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('', [], {})
    assert.ok(result.score >= 0)
    assert.ok(result.score <= result.maxScore)
  })
})

// ---------------------------------------------------------------------------
// Individual category detection
// ---------------------------------------------------------------------------

describe('coverage-completeness — category detection', () => {
  it('should detect HP (Happy Path) category', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('TC-LOGIN-HP-001 User can log in', [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('Happy Path')), 'HP should be detected')
    assert.ok(result.score >= 1)
  })

  it('should detect VE (Validation Errors) category', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('TC-LOGIN-VE-001 Invalid email shows error', [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('Validation Errors')), 'VE should be detected')
    assert.ok(result.score >= 1)
  })

  it('should detect SEC (Security) category', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('TC-LOGIN-SEC-001 SQL injection attempt rejected', [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('Security')), 'SEC should be detected')
    assert.ok(result.score >= 1)
  })

  it('should detect EC (Edge Cases) category', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('TC-LOGIN-EC-001 Empty password field', [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('Edge Cases')), 'EC should be detected')
    assert.ok(result.score >= 1)
  })

  it('should detect A11Y (Accessibility) category', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('TC-LOGIN-A11Y-001 Login form keyboard navigation', [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('Accessibility')), 'A11Y should be detected')
    assert.ok(result.score >= 1)
  })
})

// ---------------------------------------------------------------------------
// Missing category reporting
// ---------------------------------------------------------------------------

describe('coverage-completeness — missing category findings', () => {
  it('should report all 5 missing categories for empty content', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('', [], {})
    assert.equal(result.score, 0)
    assert.equal(result.findings.length, 5)
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(msgs.some((m) => m.includes('Happy Path')))
    assert.ok(msgs.some((m) => m.includes('Validation Errors')))
    assert.ok(msgs.some((m) => m.includes('Security')))
    assert.ok(msgs.some((m) => m.includes('Edge Cases')))
    assert.ok(msgs.some((m) => m.includes('Accessibility')))
  })

  it('should report only missing categories when some are present', async () => {
    const evaluate = await loadRubric()
    const content = `
TC-AUTH-HP-001 Happy path login
TC-AUTH-VE-001 Invalid credentials`
    const result = evaluate(content, [], {})
    assert.equal(result.score, 2)
    assert.equal(result.findings.length, 3)
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('Happy Path')), 'HP should not be in findings')
    assert.ok(!msgs.some((m) => m.includes('Validation Errors')), 'VE should not be in findings')
    assert.ok(msgs.some((m) => m.includes('Security')))
    assert.ok(msgs.some((m) => m.includes('Edge Cases')))
    assert.ok(msgs.some((m) => m.includes('Accessibility')))
  })

  it('should have no findings when all 5 categories are present', async () => {
    const evaluate = await loadRubric()
    const content = `
TC-AUTH-HP-001 Happy path login
TC-AUTH-VE-001 Invalid email
TC-AUTH-SEC-001 SQL injection
TC-AUTH-EC-001 Empty password
TC-AUTH-A11Y-001 Keyboard navigation`
    const result = evaluate(content, [], {})
    assert.equal(result.score, 5)
    assert.equal(result.findings.length, 0)
  })
})

// ---------------------------------------------------------------------------
// TC ID format matching
// ---------------------------------------------------------------------------

describe('coverage-completeness — TC ID format', () => {
  it('should match IDs from any feature area (not just AUTH)', async () => {
    const evaluate = await loadRubric()
    const content = `
TC-PROFILE-HP-001
TC-CHECKOUT-VE-001
TC-SEARCH-SEC-001
TC-DASHBOARD-EC-001
TC-SETTINGS-A11Y-001`
    const result = evaluate(content, [], {})
    assert.equal(result.score, 5)
    assert.equal(result.findings.length, 0)
  })

  it('should require 3-digit sequence number', async () => {
    const evaluate = await loadRubric()
    // TC-AUTH-HP-01 has only 2 digits — should NOT match
    const content = 'TC-AUTH-HP-01 short sequence number'
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('Happy Path')),
      `Should not match 2-digit sequence, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should not match A11Y pattern from bare A11 without Y', async () => {
    const evaluate = await loadRubric()
    // TC-AUTH-A11-001 is not A11Y — should still be flagged
    const content = `
TC-AUTH-HP-001
TC-AUTH-VE-001
TC-AUTH-SEC-001
TC-AUTH-EC-001
TC-AUTH-A11-001`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('Accessibility')),
      'A11-001 should not satisfy A11Y requirement',
    )
  })

  it('should accept multiple TC IDs per category', async () => {
    const evaluate = await loadRubric()
    const content = `
TC-AUTH-HP-001
TC-AUTH-HP-002
TC-AUTH-HP-003
TC-AUTH-VE-001
TC-AUTH-VE-002
TC-AUTH-SEC-001
TC-AUTH-EC-001
TC-AUTH-A11Y-001`
    const result = evaluate(content, [], {})
    assert.equal(result.score, 5)
    assert.equal(result.findings.length, 0)
  })
})

// ---------------------------------------------------------------------------
// Score range
// ---------------------------------------------------------------------------

describe('coverage-completeness — score range', () => {
  it('should score 5/5 for fully compliant content', async () => {
    const evaluate = await loadRubric()
    const content = `
# Test Cases

TC-AUTH-HP-001 Login with valid credentials
TC-AUTH-VE-001 Login with invalid password shows error
TC-AUTH-SEC-001 Brute force lockout after 5 attempts
TC-AUTH-EC-001 Login with very long email address
TC-AUTH-A11Y-001 Login form has correct ARIA labels`
    const result = evaluate(content, [], {})
    assert.equal(result.score, 5)
    assert.equal(result.maxScore, 5)
    assert.equal(result.findings.length, 0)
  })

  it('should score 0/5 and have 5 findings for empty content', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('', [], {})
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 5)
    assert.equal(result.findings.length, 5)
  })
})
