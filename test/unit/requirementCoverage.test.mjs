// test/unit/requirementCoverage.test.mjs — Unit tests for requirement-coverage rubric

import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric() {
  const { evaluate } = await import(join(RUBRICS_DIR, 'requirement-coverage.mjs'))
  return evaluate
}

// ---------------------------------------------------------------------------
// Skipped scenarios
// ---------------------------------------------------------------------------

describe('requirement-coverage — skipped scenarios', () => {
  it('should skip when scenario is "classification"', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('REQ-LOGIN-001 TC-LOGIN-HP-001', [], { scenario: 'classification' })
    assert.equal(result.skipped, true)
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 0)
    assert.ok(Array.isArray(result.findings))
  })

  it('should skip when scenario is "S4"', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('REQ-LOGIN-001 TC-LOGIN-HP-001', [], { scenario: 'S4' })
    assert.equal(result.skipped, true)
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 0)
  })

  it('should NOT skip when no scenario is provided', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('REQ-LOGIN-001', [], {})
    assert.ok(!result.skipped)
    assert.equal(result.maxScore, 3)
  })
})

// ---------------------------------------------------------------------------
// Interface shape
// ---------------------------------------------------------------------------

describe('requirement-coverage — interface shape', () => {
  it('should always return score, maxScore, and findings', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('some content without any IDs', [], {})
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
    assert.ok(Array.isArray(result.findings))
    assert.equal(result.maxScore, 3)
  })

  it('should return score >= 0 and score <= maxScore', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('', [], {})
    assert.ok(result.score >= 0)
    assert.ok(result.score <= result.maxScore)
  })
})

// ---------------------------------------------------------------------------
// Minimum quantity check
// ---------------------------------------------------------------------------

describe('requirement-coverage — minimum quantity', () => {
  it('should pass quantity check with >= 3 distinct REQ IDs', async () => {
    const evaluate = await loadRubric()
    const content = `
REQ-LOGIN-001 REQ-LOGIN-002 REQ-LOGIN-003
TC-LOGIN-HP-001 (REQ-LOGIN-001)
TC-LOGIN-HP-002 (REQ-LOGIN-002)
TC-LOGIN-HP-003 (REQ-LOGIN-003)
Traceability: REQ-LOGIN-001 → TC-LOGIN-HP-001`
    const result = evaluate(content, [], {})
    assert.equal(result.score, 3, 'All 3 checks should pass')
    assert.equal(result.findings.length, 0)
  })

  it('should fail quantity check with < 3 REQ IDs and no TC IDs', async () => {
    const evaluate = await loadRubric()
    const content = 'REQ-LOGIN-001 REQ-LOGIN-002'
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(
      msgs.some((m) => m.includes('Low requirement count') || m.includes('expected >= 3')),
      `Should report low quantity, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass quantity check in S2/S3 with >= 3 TC IDs even without REQ IDs', async () => {
    const evaluate = await loadRubric()
    const content = `
TC-AUTH-HP-001 test a
TC-AUTH-HP-002 test b
TC-AUTH-HP-003 test c`
    const result = evaluate(content, [], { scenario: 'S3' })
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(
      !msgs.some((m) => m.includes('Low output volume') || m.includes('expected >= 3')),
      `S3 with 3 TC IDs should pass quantity check, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should fail quantity check in S3 with < 3 of each', async () => {
    const evaluate = await loadRubric()
    const content = 'TC-AUTH-HP-001 TC-AUTH-HP-002'
    const result = evaluate(content, [], { scenario: 'S3' })
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(
      msgs.some((m) => m.includes('Low output volume') || m.includes('expected >= 3')),
      `S3 with only 2 TC IDs should fail quantity check`,
    )
  })
})

// ---------------------------------------------------------------------------
// Traceability check
// ---------------------------------------------------------------------------

describe('requirement-coverage — traceability', () => {
  it('should pass traceability when TC IDs reference REQ IDs inline', async () => {
    const evaluate = await loadRubric()
    const content = `
REQ-LOGIN-001 REQ-LOGIN-002 REQ-LOGIN-003
TC-LOGIN-HP-001 REQ-LOGIN-001
TC-LOGIN-HP-002 REQ-LOGIN-002
TC-LOGIN-HP-003 REQ-LOGIN-003`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(!msgs.some((m) => m.includes('traceability')), 'Should not flag traceability')
  })

  it('should pass traceability when "Coverage Matrix" heading is present', async () => {
    const evaluate = await loadRubric()
    const content = `
REQ-LOGIN-001 REQ-LOGIN-002 REQ-LOGIN-003
TC-LOGIN-HP-001 TC-LOGIN-HP-002 TC-LOGIN-HP-003
## Coverage Matrix`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(!msgs.some((m) => m.includes('traceability')))
  })

  it('should pass traceability when both REQ and TC IDs exist (even in separate sections)', async () => {
    const evaluate = await loadRubric()
    // The dotAll regex matches any REQ followed anywhere by any TC (or vice versa),
    // so co-presence of both ID types is sufficient for the traceability check to pass.
    const content = `
REQ-LOGIN-001
REQ-LOGIN-002
REQ-LOGIN-003

TC-PROFILE-HP-001
TC-PROFILE-HP-002
TC-PROFILE-HP-003`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(
      !msgs.some((m) => m.includes('traceability')),
      `Both ID types present → traceability should pass, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should skip traceability check when no REQ IDs exist', async () => {
    const evaluate = await loadRubric()
    // Only TC IDs, no REQ IDs — traceability check requires both
    const content = 'TC-LOGIN-HP-001 TC-LOGIN-HP-002 TC-LOGIN-HP-003'
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(
      !msgs.some((m) => m.includes('traceability')),
      'Should not flag traceability when no REQ IDs present',
    )
  })
})

// ---------------------------------------------------------------------------
// Diversity check
// ---------------------------------------------------------------------------

describe('requirement-coverage — diversity', () => {
  it('should pass diversity with at least one feature area', async () => {
    const evaluate = await loadRubric()
    const content = `
REQ-LOGIN-001 REQ-LOGIN-002 REQ-LOGIN-003
TC-LOGIN-HP-001 REQ-LOGIN-001`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : f.message))
    assert.ok(!msgs.some((m) => m.includes('feature areas')))
  })
})

// ---------------------------------------------------------------------------
// Score range
// ---------------------------------------------------------------------------

describe('requirement-coverage — score range', () => {
  it('should score 3/3 for fully compliant output', async () => {
    const evaluate = await loadRubric()
    const content = `
# Requirements
REQ-AUTH-001 User can log in
REQ-AUTH-002 Invalid credentials show error
REQ-AUTH-003 Session expires after 30 minutes

# Test Cases
TC-AUTH-HP-001 REQ-AUTH-001 Happy path login
TC-AUTH-HP-002 REQ-AUTH-002 Invalid creds
TC-AUTH-HP-003 REQ-AUTH-003 Session timeout

## Coverage Matrix
REQ-AUTH-001 → TC-AUTH-HP-001`
    const result = evaluate(content, [], {})
    assert.equal(result.score, 3)
    assert.equal(result.maxScore, 3)
    assert.equal(result.findings.length, 0)
  })

  it('should score 1/3 for completely empty content', async () => {
    const evaluate = await loadRubric()
    // Empty: quantity fails (0 REQs), traceability passes (skipped — both counts 0),
    // diversity fails (no feature areas) → score = 1
    const result = evaluate('', [], {})
    assert.equal(result.score, 1)
    assert.equal(result.maxScore, 3)
  })
})
