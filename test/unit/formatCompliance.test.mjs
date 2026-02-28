import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// format-compliance rubric
// ---------------------------------------------------------------------------

describe('format-compliance rubric', () => {
  it('should pass for content with valid TC ID format', async () => {
    const evaluate = await loadRubric('format-compliance')
    const content = `
## Test Cases

### TC-login-HP-001: Valid Login
**Description:** User logs in with valid credentials.

### TC-login-VE-001: Invalid Password
**Description:** User logs in with wrong password.
`
    const result = evaluate(content, [], {})
    const tcFinding = result.findings.find((f) => f.includes('TC'))
    assert.equal(
      tcFinding,
      undefined,
      `Should not flag valid TC IDs: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for invalid TC ID format', async () => {
    const evaluate = await loadRubric('format-compliance')
    // No valid TC IDs — only malformed ones (missing category abbreviation)
    const content = `
## Test Cases

### TC001: Login Test
**Description:** User logs in.

### TC002: Logout Test
`
    const result = evaluate(content, [], {})
    const finding = result.findings.find((f) => f.includes('TC'))
    assert.ok(finding, `Should flag missing/invalid TC IDs: ${JSON.stringify(result.findings)}`)
  })

  it('should pass for content with valid REQ ID format', async () => {
    const evaluate = await loadRubric('format-compliance')
    const content = `
## Requirements

### REQ-login-001
User must be able to authenticate with email and password.

### REQ-login-002
System must lock account after 5 failed attempts.

## Test Cases

### TC-login-HP-001: Happy Path Login
Linked to REQ-login-001.
`
    const result = evaluate(content, [], {})
    const reqFinding = result.findings.find((f) => f.includes('REQ'))
    assert.equal(
      reqFinding,
      undefined,
      `Should not flag valid REQ IDs: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding when REQ IDs are missing', async () => {
    const evaluate = await loadRubric('format-compliance')
    // Has TC IDs but no REQ IDs — default scenario expects both
    const content = `
## Test Cases

### TC-checkout-HP-001: Place Order
User adds item and completes checkout.

### TC-checkout-EC-001: Empty Cart Checkout
User tries to checkout with empty cart.
`
    const result = evaluate(content, [], {})
    const finding = result.findings.find((f) => f.includes('REQ'))
    assert.ok(finding, `Should flag missing REQ IDs: ${JSON.stringify(result.findings)}`)
  })

  it('should check both TC and REQ IDs for scenario S6 (Publish Results)', async () => {
    const evaluate = await loadRubric('format-compliance')
    // S6 = Publish Results — treated same as S3/S1: check TC + REQ IDs
    const content = 'TC-checkout-HP-001 TC-checkout-VE-001 REQ-checkout-001'
    const result = evaluate(content, [], { scenario: 'S6' })
    assert.equal(result.maxScore, 2, 'S6 should have 2 checks (TC IDs + REQ IDs)')
    assert.equal(result.score, 2, `Should pass both checks: ${JSON.stringify(result.findings)}`)
  })

  it('should treat S6 (Publish Results) like any other scenario — check TC and REQ IDs', async () => {
    const evaluate = await loadRubric('format-compliance')
    // S6 = Publish Results — no special REG-only path; standard TC+REQ checks apply
    const content = 'TC-login-HP-001 REQ-login-001'
    const result = evaluate(content, [], { scenario: 'S6' })
    assert.ok(
      result.score > 0,
      `S6 with valid TC+REQ IDs should pass: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should skip REQ check for scenario S2 but still check TC IDs', async () => {
    const evaluate = await loadRubric('format-compliance')
    // S2: Manual to E2E — skipTc = false (only classification/S4 skip TC),
    // skipReq = true (S2 skips REQ check). So only TC check runs (maxScore = 1).
    // Content has valid TC IDs → score = 1.
    const content = 'TC-checkout-HP-001 TC-checkout-VE-001'
    const result = evaluate(content, [], { scenario: 'S2' })
    assert.equal(result.maxScore, 1, 'S2 should only have 1 check (TC IDs, no REQ check)')
    assert.equal(
      result.score,
      1,
      `Should pass TC ID check in S2: ${JSON.stringify(result.findings)}`,
    )
    // No REQ finding because REQ check is skipped
    const reqFinding = result.findings.find((f) => f.includes('REQ'))
    assert.equal(reqFinding, undefined, 'S2 should skip REQ ID check')
  })

  it('should produce a finding for missing TC IDs with all required categories', async () => {
    const evaluate = await loadRubric('format-compliance')
    // Content has some TC IDs but none with valid ABBR (HP/VE/SEC/EC/A11Y)
    const content = `
## Requirements

REQ-cart-001: User can add items to cart.

## Test Cases

TC-CART-POSITIVE-001: Add to cart happy path.
TC-CART-NEGATIVE-001: Add unavailable item.
`
    const result = evaluate(content, [], {})
    // The TC regex requires specific categories (HP|VE|SEC|EC|A11Y) — 'POSITIVE' won't match
    const tcFinding = result.findings.find((f) => f.includes('TC'))
    assert.ok(tcFinding, `Should flag malformed TC IDs: ${JSON.stringify(result.findings)}`)
  })
})
