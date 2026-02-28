import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// error-handling-compliance rubric
// ---------------------------------------------------------------------------

describe('error-handling-compliance rubric', () => {
  // -- Skip behavior --

  it('should skip when no checks are applicable', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'This is a normal agent output with no error handling patterns.'
    const result = evaluate(content, [])
    assert.equal(result.skipped, true)
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 0)
    assert.deepEqual(result.findings, [])
  })

  // -- Check 1: MCP error with retry signal --

  it('should pass when MCP error has [sparq] Retry signal', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `MCP error: connection timeout on playwright tool
[sparq] Retry: Playwright MCP — attempt 2 of 3`
    const result = evaluate(content, [])
    assert.ok(result.score >= 1, `Expected score >= 1, got ${result.score}`)
    assert.ok(!result.findings.some((f) => f.includes?.('Retry') || f.includes?.('retry signal')))
  })

  it('should pass when MCP error has [sparq] Fallback signal', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `MCP timeout on Jira fetch
[sparq] Fallback: Jira unavailable — requesting user text input
"gaps": ["jira requirements missing"]
"status": "partial"`
    const result = evaluate(content, [])
    const mcpFinding = result.findings.find((f) => f.includes('no [sparq] Retry/Fallback signal'))
    assert.equal(mcpFinding, undefined, 'Should not flag MCP error when Fallback signal present')
  })

  it('should fail when MCP error has no retry/fallback signal', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'MCP error: connection refused on playwright tool. Proceeding anyway.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no [sparq] Retry/Fallback signal'))
    assert.ok(finding, `Should flag missing retry signal: ${JSON.stringify(result.findings)}`)
  })

  it('should trigger on MCP timeout keyword', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'mcp timeout: tool did not respond within 30s'
    const result = evaluate(content, [])
    assert.ok(result.maxScore >= 1, 'MCP timeout should trigger check 1')
  })

  // -- Check 2: Fallback with gap entry --

  it('should pass when fallback signal has non-empty gaps array', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `[sparq] Fallback: Jira unavailable — using user text input
"gaps": ["REQ-LOGIN-001 acceptance criteria not verified against Jira"]
"status": "partial"`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('gaps array is empty'))
    assert.equal(finding, undefined, 'Should not flag when gaps array is populated')
  })

  it('should fail when fallback signal has empty gaps array', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `[sparq] Fallback: Confluence unavailable — skipping
"gaps": []
"status": "partial"`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('gaps array is empty'))
    assert.ok(finding, `Should flag empty gaps array: ${JSON.stringify(result.findings)}`)
  })

  it('should fail when fallback signal has no gaps field at all', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `[sparq] Fallback: Figma unavailable — using codebase grep
"status": "partial"`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('gaps array is empty or missing'))
    assert.ok(finding, `Should flag missing gaps field: ${JSON.stringify(result.findings)}`)
  })

  // -- Check 3: Source failure with fallback action --

  it('should pass when Jira unavailable has fallback action', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'Jira unavailable: connection refused. Using user input as fallback.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no fallback action'))
    assert.equal(finding, undefined, 'Should not flag when fallback action present')
  })

  it('should pass when Confluence failed has skip action', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'Confluence failed to respond within timeout. Will skip Confluence content.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no fallback action'))
    assert.equal(finding, undefined, 'Should not flag when skip action documented')
  })

  it('should pass when Figma timeout has grep fallback', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'Figma timeout — falling back to codebase grep for selectors.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no fallback action'))
    assert.equal(finding, undefined, 'Should not flag when grep fallback documented')
  })

  it('should pass when TestRail unavailable has alternative documented', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'TestRail unavailable: 503. Using alternative local TMS export.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no fallback action'))
    assert.equal(finding, undefined, 'Should not flag when alternative action documented')
  })

  it('should pass when Qase failed has degraded mode', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'Qase failed: 429 rate limit exceeded. Running in degraded mode.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no fallback action'))
    assert.equal(finding, undefined, 'Should not flag when degraded mode documented')
  })

  it('should fail when source failure has no fallback action', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'Jira unavailable: connection refused. Continuing with next step.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no fallback action'))
    assert.ok(finding, `Should flag missing fallback action: ${JSON.stringify(result.findings)}`)
  })

  it('should fail when Confluence timeout has no documented action', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'Confluence timeout: could not retrieve page. Moving on.'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no fallback action'))
    assert.ok(
      finding,
      `Should flag missing fallback for Confluence: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- Check 4: Degraded execution with partial status --

  it('should pass when fallback has partial status in handoff', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `[sparq] Fallback: Jira unavailable — user input substituted
"gaps": ["REQ-LOGIN-001 not verified"]
"status": "partial"`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('status is not "partial"'))
    assert.equal(finding, undefined, 'Should not flag when status is partial')
  })

  it('should fail when fallback has no partial status', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `[sparq] Fallback: Jira unavailable — user input substituted
"gaps": ["REQ-LOGIN-001 not verified"]
"status": "complete"`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('status is not "partial"'))
    assert.ok(finding, `Should flag non-partial status: ${JSON.stringify(result.findings)}`)
  })

  it('should fail when fallback has missing status field', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `[sparq] Fallback: Confluence down — skipping
"gaps": ["confluence pages missing"]`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('status is not "partial"'))
    assert.ok(finding, `Should flag missing status field: ${JSON.stringify(result.findings)}`)
  })

  // -- Check 5: Circuit breaker signal --

  it('should pass when multiple retries have circuit breaker warning', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `retry attempt 2 — backoff 4s
retry attempt 3 — backoff 8s
[sparq] Warning: circuit breaker OPEN for Jira MCP`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no circuit breaker'))
    assert.equal(finding, undefined, 'Should not flag when circuit breaker signal present')
  })

  it('should pass when 2 failures trigger circuit breaker OPEN signal', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `2 failures in 60s for Playwright MCP
[sparq] Warning: circuit breaker OPEN — switching to manual verification`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no circuit breaker'))
    assert.equal(finding, undefined, 'Should not flag when OPEN signal present')
  })

  it('should fail when multiple retries have no circuit breaker signal', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `retry attempt 2 — backoff 4s
retry attempt 3 — backoff 8s
Giving up on Jira fetch.`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no circuit breaker'))
    assert.ok(
      finding,
      `Should flag missing circuit breaker signal: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should trigger circuit breaker check on "2 failures" pattern', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = '2 failures detected in the last minute. No further action taken.'
    const result = evaluate(content, [])
    assert.ok(result.maxScore >= 1, 'Should trigger circuit breaker check')
    const finding = result.findings.find((f) => f.includes('no circuit breaker'))
    assert.ok(finding, 'Should flag missing warning signal')
  })

  it('should trigger circuit breaker check on "circuit" keyword', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'Circuit state: checking MCP health...\n[sparq] Warning: OPEN'
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.includes('no circuit breaker'))
    assert.equal(finding, undefined, 'Should pass when [sparq] Warning present')
  })

  // -- Combined scenarios --

  it('should score full marks when all applicable checks pass', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `MCP error: Jira connection timeout
Jira unavailable — switching to fallback
[sparq] Fallback: Jira MCP unavailable — requesting user text input
"gaps": ["REQ-LOGIN-001 source not verified via Jira"]
"status": "partial"
retry attempt 2 backoff
[sparq] Warning: circuit breaker OPEN for Jira`
    const result = evaluate(content, [])
    assert.equal(
      result.score,
      result.maxScore,
      `Expected full score, got ${result.score}/${result.maxScore}: ${JSON.stringify(result.findings)}`,
    )
    assert.deepEqual(result.findings, [])
  })

  it('should report multiple findings when multiple checks fail', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `MCP error: Jira connection timeout
Jira unavailable — proceeding without data
[sparq] Fallback: Jira MCP unavailable
"gaps": []
"status": "complete"
retry attempt 2 backoff
Gave up on connection.`
    const result = evaluate(content, [])
    // Check 1 passes (Fallback signal present for MCP error)
    // Check 2 fails (gaps array empty)
    // Check 3 fails (no fallback/degraded/skip/grep/user input/alternative)
    // Check 4 fails (status not partial)
    // Check 5 fails (no circuit breaker warning)
    assert.ok(
      result.findings.length >= 3,
      `Expected at least 3 findings, got ${result.findings.length}`,
    )
    assert.ok(result.score < result.maxScore, 'Score should be less than maxScore')
  })

  // -- checks and options parameters (unused but part of interface) --

  it('should accept checks array without error', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'MCP error: timeout\n[sparq] Retry: attempt 2'
    const result = evaluate(content, [{ has_pattern: 'Retry' }])
    assert.ok('score' in result)
  })

  it('should accept options object without error', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = 'MCP error: timeout\n[sparq] Retry: attempt 2'
    const result = evaluate(content, [], { framework: 'playwright' })
    assert.ok('score' in result)
  })
})
