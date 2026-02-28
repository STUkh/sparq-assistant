import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// naming-conventions rubric
// ---------------------------------------------------------------------------

describe('naming-conventions rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const result = evaluate('TC-login-HP-001', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should handle content with no recognised IDs — only duplicate check counts', async () => {
    const evaluate = await loadRubric('naming-conventions')
    // No ID types found → only the duplicate check contributes (maxScore = 1, score = 1)
    const result = evaluate('plain text with no IDs whatsoever', [])
    assert.equal(result.maxScore, 1, 'Only duplicate check should count when no IDs found')
    assert.equal(result.score, 1, 'Should score 1 (no duplicates) when no IDs found')
    assert.equal(result.findings.length, 0)
  })

  it('should pass for content with properly named TC IDs', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const content = `
## Test Cases

| ID | Title |
|---|---|
| TC-login-HP-001 | Successful login |
| TC-login-VE-001 | Invalid credentials |
| TC-login-SEC-001 | Brute force protection |
| TC-login-EC-001 | Empty fields |
| TC-login-A11Y-001 | Screen reader accessible |
`
    const result = evaluate(content, [])
    const tcFinding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('TC IDs'),
    )
    assert.equal(
      tcFinding,
      undefined,
      `Should not flag valid TC IDs: ${JSON.stringify(result.findings)}`,
    )
    assert.ok(result.score <= result.maxScore)
  })

  it('should flag duplicate IDs appearing 3 or more times', async () => {
    const evaluate = await loadRubric('naming-conventions')
    // TC-login-HP-001 appears 3 times → should be flagged
    const content = `
TC-login-HP-001 - First occurrence in test case list
TC-login-HP-001 - Second occurrence in coverage matrix
TC-login-HP-001 - Third occurrence in spec file title
TC-login-VE-001 - Only appears once
`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('Duplicate'),
    )
    assert.ok(
      finding,
      `Should flag TC-login-HP-001 as duplicate: ${JSON.stringify(result.findings)}`,
    )
    assert.ok(
      (typeof finding === 'string' ? finding : finding.message).includes('TC-login-HP-001'),
      `Duplicate finding should name the offending ID: ${finding}`,
    )
  })

  it('should NOT flag REQ IDs appearing 3+ times (many-to-one traceability)', async () => {
    const evaluate = await loadRubric('naming-conventions')
    // Multiple tests trace back to the same requirement — legitimate traceability
    const content = `
test('TC-login-HP-001 - REQ-login-001 - should login with valid credentials', async () => {})
test('TC-login-VE-001 - REQ-login-001 - should show error for invalid email', async () => {})
test('TC-login-SEC-001 - REQ-login-001 - should enforce rate limiting', async () => {})
test('TC-login-EC-001 - REQ-login-002 - should handle empty fields', async () => {})
`
    const result = evaluate(content, [])
    const dupFinding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('Duplicate'),
    )
    assert.equal(
      dupFinding,
      undefined,
      `Should not flag REQ IDs as duplicates: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should NOT flag IDs appearing exactly twice (expected cross-referencing)', async () => {
    const evaluate = await loadRubric('naming-conventions')
    // Appearing twice is normal (requirements doc + coverage matrix)
    const content = `
REQ-auth-001 in requirements section.
REQ-auth-001 again in coverage matrix.
TC-auth-HP-001 in test cases.
TC-auth-HP-001 in spec title.
`
    const result = evaluate(content, [])
    const dupFinding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('Duplicate'),
    )
    assert.equal(
      dupFinding,
      undefined,
      `Should not flag 2-occurrence IDs: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag malformed REQ IDs that do not match kebab-case pattern', async () => {
    const evaluate = await loadRubric('naming-conventions')
    // find pattern: /REQ-[a-zA-Z][\w-]*-\d{3}/g — matches REQ-Login-001
    // valid pattern: /^REQ-[a-z]+(?:-[a-z]+)*-\d{3}$/ — requires lowercase
    const content = `
REQ-Login-001: Login requirement (PascalCase — invalid)
REQ-UserAuth-002: Auth requirement (camelCase — invalid)
`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('REQ IDs'),
    )
    assert.ok(finding, `Should flag malformed REQ IDs: ${JSON.stringify(result.findings)}`)
  })

  it('should pass for valid REG IDs in all-uppercase ticket format', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const content = `
## Regression Tests

REG-BUG-1234-001: Reproduce checkout crash
REG-ISSUE-567-001: Fix null reference in cart
`
    const result = evaluate(content, [])
    const regFinding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('REG IDs'),
    )
    assert.equal(
      regFinding,
      undefined,
      `Should not flag valid REG IDs: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should handle mixed ID types and validate each independently', async () => {
    const evaluate = await loadRubric('naming-conventions')
    // Valid REQ, valid TC, valid VF — all should pass; duplicate check should pass (no 3+ repeats)
    const content = `
REQ-checkout-001: User can complete purchase
REQ-checkout-002: Payment must be secure

TC-checkout-HP-001: Happy path purchase
TC-checkout-SEC-001: Secure payment validation

VF-1: Missing test coverage for edge cases
VF-2: Assertion style inconsistent
`
    const result = evaluate(content, [])
    assert.equal(
      result.findings.length,
      0,
      `Should have no findings: ${JSON.stringify(result.findings)}`,
    )
    // maxScore = REQ + TC + VF + duplicate = 4
    assert.equal(result.score, result.maxScore)
  })

  it('should flag invalid SRC labels not matching SRC-J/C/F/L', async () => {
    const evaluate = await loadRubric('naming-conventions')
    // find pattern: /SRC-[A-Z]/g — matches SRC-X
    // valid pattern: /^SRC-[JCFL]$/ — only J, C, F, L are valid
    const content = `
REQ-login-001: Login requirement
Source: SRC-X (invalid label)
`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('SRC labels'),
    )
    assert.ok(finding, `Should flag invalid SRC-X label: ${JSON.stringify(result.findings)}`)
  })

  it('should enforce score <= maxScore invariant across varied inputs', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const cases = [
      'TC-login-HP-001 TC-login-VE-001',
      'REQ-auth-001 REQ-auth-002',
      'REG-BUG-999-001',
      'VF-1 VF-2 SRC-J SRC-C',
      'TC-login-HP-001 TC-login-HP-001 TC-login-HP-001',
      'no ids here',
      'REQ-Login-001 (invalid casing)',
    ]
    for (const content of cases) {
      const result = evaluate(content, [])
      assert.ok(
        result.score <= result.maxScore,
        `score ${result.score} exceeds maxScore ${result.maxScore} for: "${content}"`,
      )
    }
  })
})
