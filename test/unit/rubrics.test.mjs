import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const FIXTURES_DIR = resolve(import.meta.dirname, '..', 'evals', 'fixtures')
const RUBRICS_DIR = resolve(import.meta.dirname, '..', 'evals', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

function readFixture(name) {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8')
}

// ---------------------------------------------------------------------------
// regression-compliance against existing-login-spec fixture
// ---------------------------------------------------------------------------

describe('regression-compliance rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result, 'should have score')
    assert.ok('maxScore' in result, 'should have maxScore')
    assert.ok('findings' in result, 'should have findings')
    assert.ok(Array.isArray(result.findings), 'findings should be array')
  })

  it('should score 1/6 for empty content (only single-spec check passes)', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const result = evaluate('', [])
    // Empty content has 0 test.describe blocks, which satisfies <= 1 check
    assert.equal(result.score, 1)
    assert.equal(result.maxScore, 6)
    assert.equal(result.findings.length, 5)
  })

  it('should score high for content with all regression markers', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const content = `
import { LoginPage } from '../pages'
test.describe('BUG-42 regression', () => {
  // @regression REG-BUG-42-001
  test('should reproduce form crash', async ({ page }) => {
    await page.navigate('/form')
    await page.click('[data-testid="submit"]')
    // step 1: enter invalid data
  })
})
`
    const result = evaluate(content, [])
    assert.equal(result.score, 6, `Expected 6/6, got ${result.score}/6: ${result.findings}`)
    assert.equal(result.maxScore, 6)
    assert.equal(result.findings.length, 0)
  })
})

// ---------------------------------------------------------------------------
// playwright-syntax against existing-login-spec fixture
// ---------------------------------------------------------------------------

describe('playwright-syntax rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const result = evaluate('', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should validate existing-login-spec fixture', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = readFixture('existing-login-spec.fixture.txt')
    const result = evaluate(content, [])

    // The fixture imports from ../../fixtures (correct) and ../../pages (correct)
    // It uses loginPage.emailInput (get accessor style — this should pass)
    assert.ok(result.score > 0, `Should score > 0, got ${result.score}: ${result.findings}`)
    assert.ok(result.maxScore > 0, 'Should have max score > 0')
  })

  it('should detect no_pattern for @playwright/test import', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const badContent = `import { test } from '@playwright/test'`
    const checks = [{ no_pattern: "from '@playwright/test'" }]
    const result = evaluate(badContent, checks)

    // Should lose points for direct @playwright/test import
    assert.ok(result.findings.length > 0, 'Should report findings for bad import')
  })
})

// ---------------------------------------------------------------------------
// naming-conventions against fixtures
// ---------------------------------------------------------------------------

describe('naming-conventions rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const result = evaluate('', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should validate manual-test-cases-login.md fixture', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const content = readFixture('manual-test-cases-login.md')
    const result = evaluate(content, [])

    // This fixture should contain TC-login-HP-001, REQ-login-001, SRC-L patterns
    assert.ok(result.score > 0, `Should score > 0, got ${result.score}: ${result.findings}`)
  })

  it('should detect duplicate IDs', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const content = 'TC-login-HP-001\nTC-login-HP-001\nTC-login-HP-001\nREQ-login-001'
    const result = evaluate(content, [])

    assert.ok(
      result.findings.some((f) => f.toLowerCase().includes('duplicate')),
      'Should detect duplicate TC IDs',
    )
  })

  it('should score max for content with valid unique IDs', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const content = `
REQ-login-001 REQ-login-002
TC-login-HP-001 TC-login-VE-001
SRC-J SRC-C
VF-1 VF-2
`
    const result = evaluate(content, [])
    assert.equal(result.score, result.maxScore, `Expected max score: ${result.findings}`)
  })

  it('should accept kebab-case REQ IDs', async () => {
    const evaluate = await loadRubric('naming-conventions')
    const content = 'REQ-login-flow-001 REQ-user-auth-002'
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => f.includes('Invalid REQ')),
      `Should accept kebab-case REQ IDs: ${result.findings}`,
    )
  })
})

// ---------------------------------------------------------------------------
// handoff-compliance against handoff JSON
// ---------------------------------------------------------------------------

describe('handoff-compliance rubric', () => {
  it('should return 0/8 for empty content', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const result = evaluate('', [])
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 8)
    assert.ok(result.findings.some((f) => f.includes('No handoff JSON')))
  })

  it('should score 8/8 for a valid complete handoff', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const content = JSON.stringify({
      version: '1.0',
      from: 'sparq-requirements-analyst',
      to: 'orchestrator',
      scenario: 'S1',
      phase: 'P1',
      status: 'success',
      report: {
        counts: { requirements: 5 },
        artifacts: ['.sparq/requirements/REQ-login.md'],
      },
    })
    const result = evaluate(content, [])
    assert.equal(result.score, 8, `Expected 8/8, findings: ${result.findings}`)
    assert.equal(result.maxScore, 8)
  })

  it('should require non-empty gaps when status is failed', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const content = JSON.stringify({
      version: '1.0',
      from: 'sparq-requirements-analyst',
      to: 'orchestrator',
      scenario: 'S1',
      phase: 'P1',
      status: 'failed',
      report: { counts: {}, artifacts: [] },
    })
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.includes('gaps')),
      'Should flag missing gaps for failed status',
    )
  })

  it('should not require gaps when status is success', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const content = JSON.stringify({
      version: '1.0',
      from: 'sparq-automation-engineer',
      to: 'orchestrator',
      scenario: 'S3',
      phase: 'P2',
      status: 'success',
      report: { counts: { tests: 5 }, artifacts: ['e2e/specs/login.spec.ts'] },
    })
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => f.includes('gaps')),
      'Should not flag gaps for success status',
    )
  })
})

// ---------------------------------------------------------------------------
// template-compliance
// ---------------------------------------------------------------------------

describe('template-compliance rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('template-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should detect requirements template structure', async () => {
    const evaluate = await loadRubric('template-compliance')
    const content = `
# Requirements: Login Feature
## Metadata
## Sources
## User Journey
## Requirements
### REQ-login-001
## UI Elements
`
    const result = evaluate(content, [])
    assert.ok(result.score > 0, `Should score > 0, got ${result.score}: ${result.findings}`)
  })

  it('should detect validation report template structure', async () => {
    const evaluate = await loadRubric('template-compliance')
    const content = `
# Validation Report
## Summary
| Severity | Count |
## Findings
### VF-1: Stale selector
## Recommendations
`
    const result = evaluate(content, [])
    assert.ok(result.score > 0, `Should score > 0, got ${result.score}: ${result.findings}`)
  })
})

// ---------------------------------------------------------------------------
// progress-signal-compliance
// ---------------------------------------------------------------------------

describe('progress-signal-compliance rubric', () => {
  it('should score high for properly formatted signals', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = `
[sparq] P0 -- Starting classification
[sparq] P0 -- Classification complete: S3
[sparq] P1 -- Starting requirements analysis
[sparq] P1 -- Requirements complete (5 reqs)
[sparq] P2 -- Starting E2E generation
[sparq] P2 -- Retry: Figma MCP timed out, attempt 2/3
[sparq] P2 -- E2E generation complete
`
    const result = evaluate(content, [])
    assert.ok(result.score >= 4, `Expected >= 4/5, got ${result.score}/5: ${result.findings}`)
  })

  it('should flag signals without [sparq] prefix', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = 'P1 -- Starting analysis\nDone with phase 1'
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some(
        (f) => f.toLowerCase().includes('sparq') || f.toLowerCase().includes('prefix'),
      ),
      'Should flag missing [sparq] prefix',
    )
  })
})

// ---------------------------------------------------------------------------
// resume-state-compliance
// ---------------------------------------------------------------------------

describe('resume-state-compliance rubric', () => {
  it('should validate resume-state-interrupted.json fixture', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const content = readFixture('resume-state-interrupted.json')
    const result = evaluate(content, [])

    // The fixture has a valid state structure
    assert.ok(result.score >= 5, `Expected >= 5/7, got ${result.score}/7: ${result.findings}`)
  })

  it('should score 0 for empty content', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const result = evaluate('', [])
    assert.equal(result.score, 0)
  })

  it('should score 0 for invalid JSON', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const result = evaluate('not json at all', [])
    assert.equal(result.score, 0)
  })
})

// ---------------------------------------------------------------------------
// format-compliance
// ---------------------------------------------------------------------------

describe('format-compliance rubric', () => {
  it('should validate manual-test-cases-login.md fixture', async () => {
    const evaluate = await loadRubric('format-compliance')
    const content = readFixture('manual-test-cases-login.md')
    const result = evaluate(content, [])

    // Should find TC and REQ IDs
    assert.ok(result.score >= 1, `Should find at least TC or REQ IDs: ${result.findings}`)
  })
})

// ---------------------------------------------------------------------------
// error-handling-compliance
// ---------------------------------------------------------------------------

describe('error-handling-compliance rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should mark skipped when no error conditions present', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const result = evaluate('Clean output with no errors at all', [])
    assert.equal(result.skipped, true, 'Should be skipped for clean content')
    assert.equal(result.maxScore, 0)
  })

  it('should score when error conditions are present', async () => {
    const evaluate = await loadRubric('error-handling-compliance')
    const content = `
MCP error: Jira connection refused
[sparq] P1 Fallback: Jira unavailable -- using user text input
"gaps": ["Jira unavailable - fallback to user input"]
"status": "partial"
`
    const result = evaluate(content, [])
    assert.ok(result.maxScore > 0, 'Should have checks when errors present')
    assert.ok(result.score > 0, `Should score > 0: ${result.findings}`)
  })
})

// ---------------------------------------------------------------------------
// assertion-detection (GAP 1.1)
// ---------------------------------------------------------------------------

describe('assertion-detection rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const result = evaluate('', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should skip for non-test content', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const result = evaluate('const x = 1\nfunction foo() {}', [])
    assert.equal(result.skipped, true)
    assert.equal(result.maxScore, 0)
  })

  it('should score 0 for test without assertions', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('login', () => {
  test('should navigate to login', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'test@example.com')
    await page.click('#submit')
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 0, `Expected 0, findings: ${result.findings}`)
    assert.ok(result.findings.some((f) => f.includes('No assertions')))
  })

  it('should score 3/3 for well-asserted test', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('login', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'test@example.com')
    await page.click('#submit')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('.welcome')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 3, `Expected 3/3, findings: ${result.findings}`)
    assert.equal(result.maxScore, 3)
  })

  it('should flag low assertion density', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('login', () => {
  test('should login', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'a@b.com')
    await page.fill('#password', 'pass')
    await page.click('#submit')
    await page.click('#confirm')
    await page.click('#ok')
    await page.click('#next')
    await expect(page).toHaveURL('/done')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.includes('assertion density')),
      `Should flag low density: ${result.findings}`,
    )
  })
})

// ---------------------------------------------------------------------------
// requirement-coverage (GAP 1.3)
// ---------------------------------------------------------------------------

describe('requirement-coverage rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('', [], { scenario: 'S1' })
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should skip for classification scenario', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('REQ-login-001', [], { scenario: 'classification' })
    assert.equal(result.skipped, true)
  })

  it('should skip for S4 scenario', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('VF-1 VF-2', [], { scenario: 'S4' })
    assert.equal(result.skipped, true)
  })

  it('should score 3/3 for S1 with sufficient REQs', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const content = `
REQ-login-001: Email input
REQ-login-002: Password input
REQ-login-003: Submit button
REQ-login-004: Remember me
TC-login-HP-001: Successful login (REQ-login-001)
TC-login-VE-001: Wrong password (REQ-login-002)
TC-login-SEC-001: Brute force (REQ-login-003)
`
    const result = evaluate(content, [], { scenario: 'S1' })
    assert.equal(result.score, 3, `Expected 3/3, findings: ${result.findings}`)
    assert.equal(result.maxScore, 3)
  })

  it('should flag low REQ count for S1', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const content = 'REQ-login-001: Only one requirement'
    const result = evaluate(content, [], { scenario: 'S1' })
    assert.ok(
      result.findings.some((f) => f.includes('Low requirement count')),
      `Should flag low count: ${result.findings}`,
    )
  })

  it('should check REG ID for S6 scenario', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const content = 'REG-BUG-42-001: Form crash regression'
    const result = evaluate(content, [], { scenario: 'S6' })
    assert.ok(result.score >= 2, `S6 with REG ID should score >= 2: ${result.findings}`)
  })

  it('should flag missing REG ID for S6 scenario', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const content = 'test("should not crash", async () => {})'
    const result = evaluate(content, [], { scenario: 'S6' })
    assert.ok(
      result.findings.some((f) => f.includes('No REG IDs')),
      `Should flag missing REG IDs: ${result.findings}`,
    )
  })
})

// ---------------------------------------------------------------------------
// executability-check (GAP 1.2)
// ---------------------------------------------------------------------------

describe('executability-check rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('executability-check')
    const result = evaluate('', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should skip for non-test content', async () => {
    const evaluate = await loadRubric('executability-check')
    const result = evaluate('const x = 1\nfunction foo() {}', [])
    assert.equal(result.skipped, true)
    assert.equal(result.maxScore, 0)
  })

  it('should score 4/4 for well-structured test', async () => {
    const evaluate = await loadRubric('executability-check')
    const content = `
import { test, expect } from '../../../fixtures'
import { LoginPage } from '../../../pages'

test.describe('Login', () => {
  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.emailInput.fill('test@example.com')
    await loginPage.submitButton.click()
    await expect(page).toHaveURL('/dashboard')
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 4, `Expected 4/4, findings: ${result.findings}`)
    assert.equal(result.maxScore, 4)
  })

  it('should flag @playwright/test import', async () => {
    const evaluate = await loadRubric('executability-check')
    const content = `
import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test('should work', async ({ page }) => {
    await page.goto('/login')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.includes('@playwright/test')),
      `Should flag @playwright/test import: ${result.findings}`,
    )
  })

  it('should flag tests not wrapped in test.describe', async () => {
    const evaluate = await loadRubric('executability-check')
    const content = `
import { test } from '../fixtures'

test('should work', async ({ page }) => {
  await page.goto('/login')
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.includes('test.describe')),
      `Should flag missing describe: ${result.findings}`,
    )
  })

  it('should flag page object without page parameter', async () => {
    const evaluate = await loadRubric('executability-check')
    const content = `
import { test } from '../fixtures'

test.describe('Login', () => {
  test('should work', async ({ page }) => {
    const loginPage = new LoginPage()
    await loginPage.goto()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.includes('without page parameter')),
      `Should flag bad instantiation: ${result.findings}`,
    )
  })
})

// ---------------------------------------------------------------------------
// regression-compliance: generic ticket pattern
// ---------------------------------------------------------------------------

describe('regression-compliance ticket pattern', () => {
  it('should accept any Jira-style ticket prefix', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const content = `
import { AuthPage } from '../pages'
test.describe('AUTH-99 regression', () => {
  // @regression REG-AUTH-99-001
  test('should reproduce auth crash', async ({ page }) => {
    await page.navigate('/auth')
    await page.click('[data-testid="login"]')
  })
})
`
    const result = evaluate(content, [])
    assert.equal(result.score, 6, `Expected 6/6, got ${result.score}/6: ${result.findings}`)
  })
})
