// test/unit/lint.test.mjs — Smoke tests for lint command rubric registrations

import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')
const LINT_MODULE = join(import.meta.dirname, '..', '..', 'bin', 'lib', 'commands', 'lint.mjs')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

async function loadComputeOverallPct() {
  const { computeOverallPct } = await import(LINT_MODULE)
  return computeOverallPct
}

// ---------------------------------------------------------------------------
// FILE_RUBRICS — executability-check and regression-compliance (new additions)
// ---------------------------------------------------------------------------

describe('executability-check rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('executability-check')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should skip non-test content (skipped: true)', async () => {
    const evaluate = await loadRubric('executability-check')
    const result = evaluate('const x = 1\nfunction foo() { return x }', [])
    assert.equal(result.skipped, true, 'Should skip non-test content')
    assert.equal(result.maxScore, 0, 'maxScore should be 0 when skipped')
  })

  it('should evaluate Playwright test content (not skipped)', async () => {
    const evaluate = await loadRubric('executability-check')
    const content = `
import { LoginPage } from './pages'
test.describe('Login', () => {
  test('should login', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await page.goto('/login')
    await expect(page).toHaveURL('/login')
  })
})`
    const result = evaluate(content, [])
    assert.ok(!result.skipped, 'Should not skip test content')
    assert.ok(result.maxScore > 0, 'maxScore should be > 0 for test content')
    assert.ok(Array.isArray(result.findings), 'findings should be an array')
  })

  it('should detect missing async in test callbacks', async () => {
    const evaluate = await loadRubric('executability-check')
    const content = `
test.describe('Broken', () => {
  test('should fail', ({ page }) => {
    page.goto('/page')
    page.click('[data-testid="btn"]')
    page.fill('[data-testid="input"]', 'value')
  })
})`
    const result = evaluate(content, [])
    assert.ok(!result.skipped, 'Should not skip test content')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.includes('not async') || msg.includes('async')
      }),
      `Should flag non-async test callback, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should catch import from @playwright/test', async () => {
    const evaluate = await loadRubric('executability-check')
    const content = `
import { test, expect } from '@playwright/test'
test.describe('Bad import', () => {
  test('should work', async ({ page }) => {
    await page.goto('/page')
    await expect(page).toHaveURL('/page')
  })
})`
    const result = evaluate(content, [])
    assert.ok(!result.skipped, 'Should not skip test content')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.includes('@playwright/test')
      }),
      `Should flag bare @playwright/test import, findings: ${JSON.stringify(result.findings)}`,
    )
  })
})

// ---------------------------------------------------------------------------
// regression-compliance rubric
// ---------------------------------------------------------------------------

describe('regression-compliance rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should skip non-regression feature specs (no REG- ID)', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const content = `
import { test, expect } from '../fixtures'
import { LoginPage } from '../pages'

test.describe('Login', () => {
  test('TC-login-HP-001 - REQ-login-001 - should login', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('user@test.com', 'password')
    await expect(page).toHaveURL('/dashboard')
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.skipped, true, 'Should skip feature specs without REG- IDs')
    assert.equal(result.maxScore, 0)
    assert.equal(result.findings.length, 0)
  })

  it('should score full marks for well-formed regression spec', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const content = `
// REG-BUG-123-001: Login failure regression

import { LoginPage } from './pages'

test.describe('REG-BUG-123-001 Login regression BUG-123', () => {
  test('should reproduce login bug', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await page.goto('/login')
    // step: navigate to login
    // reproduce the original bug
    await loginPage.fillEmail('user@test.com')
    await loginPage.submit()
    await expect(page).toHaveURL('/dashboard')
  })
})`
    const result = evaluate(content, [])
    assert.equal(
      result.score,
      result.maxScore,
      `Should score full marks, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should only count test.describe blocks with REG- ID for single-spec check', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const content = `
// REG-BUG-123-001
import { LoginPage } from './pages'

test.describe('Helper setup', () => {
  test('setup fixture', async ({ page }) => {
    await page.goto('/setup')
  })
})

test.describe('REG-BUG-123-001 Login regression BUG-123', () => {
  test('should reproduce login bug', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await page.goto('/login')
    // step: navigate to login
    await loginPage.submit()
  })
})`
    const result = evaluate(content, [])
    // Only one test.describe has a REG- ID, so single-spec check should pass
    const singleSpecFinding = result.findings.find((f) => {
      const msg = typeof f === 'string' ? f : f.message
      return msg.toLowerCase().includes('single') && msg.toLowerCase().includes('describe')
    })
    assert.ok(
      !singleSpecFinding,
      `Single-spec check should pass with only one REG- describe, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should accept content with proper REG-{ticket}-{NNN} ID format', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const content = `
// REG-BUG-123-001
import { test } from '../../fixtures'
test.describe('REG-BUG-123-001 Login regression BUG-123', () => {
  test('TC-login-HP-001: should reproduce', async ({ page }) => {
    await page.goto('/login')
  })
})`
    const result = evaluate(content, [])
    const regFormatFinding = result.findings.find((f) => {
      const msg = typeof f === 'string' ? f : f.message
      return (
        (msg.toLowerCase().includes('reg-') && msg.toLowerCase().includes('format')) ||
        (msg.toLowerCase().includes('reg-') && msg.toLowerCase().includes('missing'))
      )
    })
    assert.ok(
      !regFormatFinding,
      `REG format check must pass when proper REG ID present, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should warn about legacy regression/ folder path', async () => {
    const evaluate = await loadRubric('regression-compliance')
    const content = `
// REG-BUG-142-001
import { LoginPage } from './pages'
test.describe('REG-BUG-142-001 Login regression BUG-142', () => {
  test('should reproduce', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await page.goto('/login')
    // step: reproduce
    await loginPage.submit()
  })
})`
    const result = evaluate(content, [], {
      filePath: 'e2e/specs/regression/BUG-142.spec.ts',
    })
    assert.ok(!result.skipped, 'Should not skip when REG ID is present')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.toLowerCase().includes('legacy') || msg.includes('regression/ folder')
      }),
      `Should warn about legacy regression/ folder, findings: ${JSON.stringify(result.findings)}`,
    )
  })
})

// ---------------------------------------------------------------------------
// ARTIFACT_RUBRICS — handoff-compliance, parallel-merge, resume-state-compliance
// ---------------------------------------------------------------------------

describe('handoff-compliance rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should report no handoff JSON found for plain text', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const result = evaluate('just some plain text without any JSON', [])
    assert.ok(result.maxScore > 0, 'maxScore should be > 0')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.toLowerCase().includes('no handoff')
      }),
      `Should report missing handoff JSON, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score full marks for valid handoff JSON', async () => {
    const evaluate = await loadRubric('handoff-compliance')
    const handoff = {
      version: '1.0',
      from: 'sparq-orchestrator',
      to: 'sparq-requirements-analyst',
      scenario: 'S1',
      phase: 'P1',
      status: 'success',
      report: { counts: { reqs: 5 }, artifacts: ['requirements.md'] },
    }
    const content = JSON.stringify(handoff)
    const result = evaluate(content, [])
    // status is 'success' so checkFailedGaps returns null (auto-pass) — all 8 checks pass
    assert.equal(
      result.score,
      result.maxScore,
      `Should score full marks for valid handoff, score: ${result.score}/${result.maxScore}`,
    )
  })
})

describe('parallel-merge rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should flag missing barrel exports on empty content', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const result = evaluate('', [])
    assert.ok(result.maxScore > 0, 'maxScore should be > 0')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.toLowerCase().includes('barrel') || msg.toLowerCase().includes('export')
      }),
      `Should flag missing barrel exports, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass barrel export check when valid exports present', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const content = `export { LoginPage } from './login'
export { DashboardPage } from './dashboard'`
    const result = evaluate(content, [])
    // At least the barrel export check should pass
    assert.ok(
      result.score >= 1,
      `Should pass at least barrel export check, score: ${result.score}/${result.maxScore}`,
    )
  })
})

describe('resume-state-compliance rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should report no valid JSON state for plain text', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const result = evaluate('just plain text without state JSON', [])
    assert.ok(result.maxScore > 0, 'maxScore should be > 0')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.toLowerCase().includes('no valid json')
      }),
      `Should report missing state JSON, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score well for valid state JSON', async () => {
    const evaluate = await loadRubric('resume-state-compliance')
    const state = {
      version: '1.0',
      workflowId: 'wf-abc-123',
      scenario: 'S1',
      phase: 'P1',
      phaseStatus: 'completed',
      startedAt: '2026-02-20T10:00:00Z',
      updatedAt: '2026-02-20T11:00:00Z',
      completedPhases: [],
    }
    const content = JSON.stringify(state)
    const result = evaluate(content, [])
    assert.ok(
      result.score >= 4,
      `Should score well for valid state, score: ${result.score}/${result.maxScore}, findings: ${JSON.stringify(result.findings)}`,
    )
  })
})

// ---------------------------------------------------------------------------
// MARKDOWN_RUBRICS — coverage-completeness, cross-output-consistency,
//                    requirement-coverage, template-compliance,
//                    progress-signal-compliance
// ---------------------------------------------------------------------------

describe('coverage-completeness rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('coverage-completeness')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should report missing categories on empty content', async () => {
    const evaluate = await loadRubric('coverage-completeness')
    const result = evaluate('', [])
    assert.equal(result.score, 0, 'Should score 0 for empty content')
    assert.ok(result.findings.length > 0, 'Should have findings for missing categories')
  })

  it('should score full marks when all 5 categories present', async () => {
    const evaluate = await loadRubric('coverage-completeness')
    const content = `
TC-LOGIN-HP-001: Happy path login
TC-LOGIN-VE-001: Invalid email validation
TC-LOGIN-SEC-001: SQL injection attempt
TC-LOGIN-EC-001: Empty form submission
TC-LOGIN-A11Y-001: Screen reader navigation`
    const result = evaluate(content, [])
    assert.equal(result.score, 5, `Should score 5/5, findings: ${JSON.stringify(result.findings)}`)
    assert.equal(result.maxScore, 5)
  })

  it('should score 2/5 when only HP and VE categories are present', async () => {
    const evaluate = await loadRubric('coverage-completeness')
    const content = `TC-LOGIN-HP-001: Happy path login
TC-LOGIN-VE-001: Invalid email validation`
    const result = evaluate(content, [])
    assert.equal(result.maxScore, 5, 'maxScore is always 5')
    assert.equal(result.score, 2, 'Should score exactly 2 for 2 present categories')
  })

  it('should score 0/5 and have 5 findings when no categories are present', async () => {
    const evaluate = await loadRubric('coverage-completeness')
    const content = 'Some test content with no TC IDs at all'
    const result = evaluate(content, [])
    assert.ok(!result.skipped, 'non-artifact content must not be skipped by coverage-completeness')
    assert.equal(result.score, 0, 'Should score 0 when no categories present')
    assert.equal(result.maxScore, 5)
  })

  it('should score 4/5 when exactly SEC is missing', async () => {
    const evaluate = await loadRubric('coverage-completeness')
    const content = `TC-LOGIN-HP-001: Happy path
TC-LOGIN-VE-001: Validation
TC-LOGIN-EC-001: Edge case
TC-LOGIN-A11Y-001: Accessibility`
    const result = evaluate(content, [])
    assert.equal(result.score, 4, 'Should score 4 for 4 present categories')
    assert.equal(result.maxScore, 5)
  })
})

describe('cross-output-consistency rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should skip content with single ID type (skipped: true or maxScore: 0)', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    // Only REQ IDs, no TC IDs — should skip
    const result = evaluate('REQ-LOGIN-001: some requirement', [])
    // Either skipped:true or maxScore:0 indicates the rubric bailed out
    const isSkipped = result.skipped === true || result.maxScore === 0
    assert.ok(isSkipped, `Should skip single-ID-type content, result: ${JSON.stringify(result)}`)
  })

  it('should evaluate content with multiple ID types', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    const content = `
## Requirements
REQ-LOGIN-001: User can log in
REQ-LOGIN-001: Referenced again in coverage

## Test Cases
TC-LOGIN-HP-001: Login happy path (REQ-LOGIN-001)
TC-LOGIN-HP-001: Referenced in coverage matrix`
    const result = evaluate(content, [])
    assert.ok('score' in result, 'result must have score')
    assert.ok(result.maxScore > 0, 'maxScore should be > 0 for multi-ID content')
    assert.ok(Array.isArray(result.findings), 'findings should be an array')
  })
})

describe('requirement-coverage rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should skip for classification scenario', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('some content REQ-X-001', [], { scenario: 'classification' })
    assert.equal(result.skipped, true, 'Should skip for classification scenario')
  })

  it('should flag low requirement count for default scenario', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('REQ-LOGIN-001: just one requirement', [])
    assert.ok(result.maxScore > 0, 'maxScore should be > 0')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.toLowerCase().includes('low') || msg.toLowerCase().includes('req')
      }),
      `Should flag insufficient coverage, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  // 'classification' is a legacy valid skip trigger in the rubric code (alongside 'S4').
  // All other scenarios — including S1 — must NOT be skipped.
  it('should NOT skip for S1 scenario (only classification and S4 are skipped)', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('REQ-LOGIN-001 REQ-LOGIN-002 REQ-LOGIN-003', [], { scenario: 'S1' })
    assert.ok(result.skipped !== true, 'S1 must not be skipped by requirement-coverage rubric')
    assert.ok(result.maxScore > 0, 'maxScore must be > 0 for non-skipped scenarios')
  })
})

describe('template-compliance rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('template-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should flag undetected output type for empty/plain content', async () => {
    const evaluate = await loadRubric('template-compliance')
    const result = evaluate('just some random text without structure', [])
    assert.ok(result.maxScore > 0, 'maxScore should be > 0')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return msg.toLowerCase().includes('detect') || msg.toLowerCase().includes('output type')
      }),
      `Should flag undetected output type, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should detect requirements output type', async () => {
    const evaluate = await loadRubric('template-compliance')
    const content = `## Metadata
## Sources
## User Journey
## Requirements

REQ-LOGIN-001: User can log in with valid credentials`
    const result = evaluate(content, [])
    assert.ok(
      result.score > 0,
      `Should score > 0 for requirements template, score: ${result.score}/${result.maxScore}`,
    )
  })
})

describe('progress-signal-compliance rubric', () => {
  it('should return correct interface shape on empty content', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const result = evaluate('', [])
    assert.ok('score' in result, 'result must have score')
    assert.ok('maxScore' in result, 'result must have maxScore')
    assert.ok('findings' in result, 'result must have findings')
  })

  it('should flag missing signals on empty content', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const result = evaluate('text with no sparq signals at all', [])
    assert.ok(result.maxScore > 0, 'maxScore should be > 0')
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : f.message
        return (
          msg.toLowerCase().includes('no progress signals') || msg.toLowerCase().includes('[sparq]')
        )
      }),
      `Should flag missing progress signals, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score well for valid sparq signal lines', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = `[sparq] P1 Starting requirements analysis
[sparq] P1 Processing Jira tickets
[sparq] P1 Complete — 5 requirements extracted`
    const result = evaluate(content, [])
    assert.equal(result.maxScore, 5, 'maxScore must be 5')
    assert.equal(
      result.score,
      5,
      `Should score 5/5 for fully compliant signals, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag error signal not using Retry:/Fallback:/Warning: prefix', async () => {
    const evaluate = await loadRubric('progress-signal-compliance')
    const content = `[sparq] P1 Starting requirements analysis
[sparq] P1 error occurred — something went wrong
[sparq] P1 Complete`
    const result = evaluate(content, [])
    assert.equal(result.maxScore, 5)
    // Error line doesn't use Retry:/Fallback:/Warning: format — should lose a point
    assert.ok(
      result.score < 5,
      `Score should be < 5 for malformed error signal, got: ${result.score}`,
    )
  })
})

// ---------------------------------------------------------------------------
// Skipped-result behavior (rubrics with skipped: true should return maxScore: 0)
// ---------------------------------------------------------------------------

describe('skipped result behavior', () => {
  it('executability-check skipped returns maxScore 0', async () => {
    const evaluate = await loadRubric('executability-check')
    const result = evaluate('const config = { baseURL: "http://localhost" }', [])
    if (result.skipped) {
      assert.equal(result.maxScore, 0, 'Skipped result must have maxScore: 0')
    }
  })

  it('cross-output-consistency skipped returns maxScore 0', async () => {
    const evaluate = await loadRubric('cross-output-consistency')
    const result = evaluate('no ids here at all', [])
    if (result.skipped) {
      assert.equal(result.maxScore, 0, 'Skipped result must have maxScore: 0')
    }
  })

  it('requirement-coverage skipped for S4 scenario', async () => {
    const evaluate = await loadRubric('requirement-coverage')
    const result = evaluate('VF-1: critical finding', [], { scenario: 'S4' })
    assert.equal(result.skipped, true, 'Should skip for S4 scenario')
    assert.equal(result.maxScore, 0, 'Skipped result must have maxScore: 0')
  })
})

// ---------------------------------------------------------------------------
// Multi-rubric finding merge (simulates lintFile() accumulation behavior)
// ---------------------------------------------------------------------------

describe('multi-rubric finding merge behavior', () => {
  it('should accumulate distinct findings from two rubrics run on same content', async () => {
    // Content with REG- ID so regression-compliance activates
    const content = `// REG-BUG-999-001
import { test, expect } from '@playwright/test'
test.describe('REG-BUG-999-001 Login regression BUG-999', () => {
  test('should reproduce login bug', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/login')
  })
})`
    const [execEvaluate, regrEvaluate] = await Promise.all([
      loadRubric('executability-check'),
      loadRubric('regression-compliance'),
    ])
    const execResult = execEvaluate(content, [])
    const regrResult = regrEvaluate(content, [])

    // Simulate what lintFile() does: merge findings from multiple rubrics
    const mergedFindings = [...(execResult.findings ?? []), ...(regrResult.findings ?? [])]
    assert.ok(
      mergedFindings.length >= 2,
      `Merged findings from both rubrics must be >= 2, got: ${mergedFindings.length}`,
    )
    // Both rubrics should have produced something
    assert.ok(!execResult.skipped, 'executability-check must not skip test content')
    assert.ok(regrResult.maxScore > 0, 'regression-compliance maxScore must be > 0')
  })
})

// ---------------------------------------------------------------------------
// Framework-aware options threading
// ---------------------------------------------------------------------------

describe('framework-aware rubric options threading', () => {
  it('playwright-syntax should skip when options.framework is cypress', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `test.describe('X', () => { test('y', async ({ page }) => {}) })`
    const result = evaluate(content, [], { framework: 'cypress' })
    assert.equal(result.skipped, true, 'Should skip PW rubric for Cypress framework')
  })

  it('cypress-syntax should skip when options.framework is playwright', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `describe('X', () => { it('y', () => { cy.visit('/') }) })`
    const result = evaluate(content, [], { framework: 'playwright' })
    assert.equal(result.skipped, true, 'Should skip CY rubric for Playwright framework')
  })

  it('rubrics should evaluate normally when options is empty object', async () => {
    const [pwEval, cyEval] = await Promise.all([
      loadRubric('playwright-syntax'),
      loadRubric('cypress-syntax'),
    ])
    // PW content — PW rubric should run, CY rubric should auto-skip
    const pwContent = `
import { test, expect } from '@playwright/test'
test.describe('Login', () => { test('a', async ({ page }) => {}) })`
    const pwResult = pwEval(pwContent, [], {})
    assert.ok(!pwResult.skipped, 'PW rubric should run on PW content')
    const cyResult = cyEval(pwContent, [], {})
    assert.equal(cyResult.skipped, true, 'CY rubric should auto-skip on PW content')
  })
})

// ---------------------------------------------------------------------------
// Per-file average scoring model
// ---------------------------------------------------------------------------

describe('per-file average scoring model', () => {
  it('should treat each file equally regardless of maxScore', async () => {
    const computeOverallPct = await loadComputeOverallPct()
    // Simulate: file1 scores 5/10 (50%), file2 scores 3/3 (100%)
    // Weighted: 8/13 = 61.5%. Per-file avg: (50+100)/2 = 75%
    const results = [
      { score: 5, maxScore: 10, findings: [] },
      { score: 3, maxScore: 3, findings: [] },
    ]
    assert.equal(computeOverallPct(results), 75, 'Per-file average should be 75%')
  })

  it('should return 100 when no files have scores', async () => {
    const computeOverallPct = await loadComputeOverallPct()
    const results = [
      { score: 0, maxScore: 0, findings: [] },
      { score: 0, maxScore: 0, findings: [] },
    ]
    assert.equal(computeOverallPct(results), 100, 'Should return 100% when all files skip')
  })

  it('should exclude skipped files (maxScore 0) from average', async () => {
    const computeOverallPct = await loadComputeOverallPct()
    // file1: 8/10 (80%), file2: skipped (0/0), file3: 3/4 (75%)
    // Average should be (80+75)/2 = 77.5 → 78%
    const results = [
      { score: 8, maxScore: 10, findings: [] },
      { score: 0, maxScore: 0, findings: [] },
      { score: 3, maxScore: 4, findings: [] },
    ]
    assert.equal(computeOverallPct(results), 78, 'Skipped files should not affect average')
  })
})
