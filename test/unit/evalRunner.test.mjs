import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

const EVALS_DIR = resolve(import.meta.dirname, '..', 'evals')
const RUNNER_PATH = join(EVALS_DIR, 'run-eval.mjs')

// ---------------------------------------------------------------------------
// Golden output eval pipeline test
//
// Creates a fake project directory with realistic golden outputs, then runs
// the eval runner's internal functions against an existing case to verify
// the full scoring pipeline works end-to-end.
// ---------------------------------------------------------------------------

describe('eval runner pipeline', () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()

    // Create golden output files matching s6-bug-regression.yaml expected_outputs
    mkdirSync(join(tempDir, 'e2e', 'specs', 'regression'), { recursive: true })

    writeFileSync(
      join(tempDir, 'e2e', 'specs', 'regression', 'BUG-42.spec.ts'),
      `import { test, expect } from '../../../fixtures'
import { FormPage } from '../../../pages'

// @regression
test.describe('BUG-42: Form crash on submit', () => {
  // REG-BUG-42-001
  test('should reproduce form crash', async ({ page }) => {
    const formPage = new FormPage(page)
    await formPage.goto()
    // Step 1: Navigate to form page
    await formPage.nameInput.fill('Test User')
    // Step 2: Click submit without required fields
    await formPage.submitButton.click()
    // Step 3: Verify no crash
    await expect(page.locator('.error-message')).toBeVisible()
  })
})
`,
    )

    mkdirSync(join(tempDir, '.sparq'), { recursive: true })
    writeFileSync(
      join(tempDir, '.sparq', 'handoff.json'),
      JSON.stringify(
        {
          version: '1.0',
          from: 'sparq-automation-engineer',
          to: 'orchestrator',
          scenario: 'S6',
          phase: 'P2',
          status: 'success',
          report: {
            counts: { regressionTests: 1, pageObjectsReused: 1 },
            artifacts: ['e2e/specs/regression/BUG-42.spec.ts'],
          },
        },
        null,
        2,
      ),
    )
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should score s6-bug-regression case against golden outputs', async () => {
    // Dynamically import the eval runner's parsing function
    const _runnerPath = join(EVALS_DIR, 'run-eval.mjs')
    // We can't import main() since it calls process.exit, but we can import
    // individual rubrics and run them against our golden outputs
    const { evaluate: regCompliance } = await import(
      join(EVALS_DIR, 'rubrics', 'regression-compliance.mjs')
    )
    const { evaluate: fmtCompliance } = await import(
      join(EVALS_DIR, 'rubrics', 'format-compliance.mjs')
    )
    const { evaluate: namingConventions } = await import(
      join(EVALS_DIR, 'rubrics', 'naming-conventions.mjs')
    )
    const { evaluate: handoffCompliance } = await import(
      join(EVALS_DIR, 'rubrics', 'handoff-compliance.mjs')
    )

    const specContent = `import { test, expect } from '../../../fixtures'
import { FormPage } from '../../../pages'

// @regression
test.describe('BUG-42: Form crash on submit', () => {
  // REG-BUG-42-001
  test('should reproduce form crash', async ({ page }) => {
    const formPage = new FormPage(page)
    await formPage.goto()
    await formPage.nameInput.fill('Test User')
    await formPage.submitButton.click()
    await expect(page.locator('.error-message')).toBeVisible()
  })
})`

    const handoffContent = JSON.stringify({
      version: '1.0',
      from: 'sparq-automation-engineer',
      to: 'orchestrator',
      scenario: 'S6',
      phase: 'P2',
      status: 'success',
      report: {
        counts: { regressionTests: 1 },
        artifacts: ['e2e/specs/regression/BUG-42.spec.ts'],
      },
    })

    const allContent = `${specContent}\n---\n${handoffContent}`

    // Run each rubric from s6-bug-regression.yaml
    const regResult = regCompliance(allContent, [])
    assert.equal(regResult.score, 6, `regression: ${regResult.findings}`)
    assert.equal(regResult.maxScore, 6)

    const fmtResult = fmtCompliance(allContent, [], { scenario: 'S6' })
    assert.ok(fmtResult.maxScore > 0, 'format should have checks')
    assert.equal(fmtResult.score, 1, `format S6 should find REG ID: ${fmtResult.findings}`)

    const namingResult = namingConventions(allContent, [])
    assert.ok(namingResult.score > 0, `naming: ${namingResult.findings}`)

    const handoffResult = handoffCompliance(allContent, [])
    assert.equal(handoffResult.score, 8, `handoff: ${handoffResult.findings}`)
    assert.equal(handoffResult.maxScore, 8)

    // Combined score should be high
    const totalScore = regResult.score + fmtResult.score + namingResult.score + handoffResult.score
    const totalMax =
      regResult.maxScore + fmtResult.maxScore + namingResult.maxScore + handoffResult.maxScore
    const pct = Math.round((totalScore / totalMax) * 100)

    assert.ok(
      pct >= 80,
      `Golden output should score >= 80%, got ${pct}% (${totalScore}/${totalMax})`,
    )
  })

  it('should score multi-rubric pipeline for S1 requirements output', async () => {
    const { evaluate: fmtCompliance } = await import(
      join(EVALS_DIR, 'rubrics', 'format-compliance.mjs')
    )
    const { evaluate: coverageCompleteness } = await import(
      join(EVALS_DIR, 'rubrics', 'coverage-completeness.mjs')
    )
    const { evaluate: namingConventions } = await import(
      join(EVALS_DIR, 'rubrics', 'naming-conventions.mjs')
    )
    const { evaluate: templateCompliance } = await import(
      join(EVALS_DIR, 'rubrics', 'template-compliance.mjs')
    )

    const goldenOutput = `# Requirements: Login Feature

## Metadata
- Feature: Login
- Source: Jira EP-14

## Sources
- SRC-J: Jira EP-14
- SRC-F: Figma Login Design

## User Journey
1. User navigates to login page
2. User enters credentials
3. User clicks sign in

## Requirements
### REQ-login-001: Email Input
Acceptance: User can enter email address
### REQ-login-002: Password Input
Acceptance: User can enter password
### REQ-login-003: Sign In Button
Acceptance: User can submit credentials

## UI Elements
- Email input field
- Password input field
- Sign in button

---

# Test Cases: Login Feature

## Happy Path
### TC-login-HP-001: Successful login
### TC-login-HP-002: Remember me
### TC-login-HP-003: Social login

## Validation & Error
### TC-login-VE-001: Wrong password
### TC-login-VE-002: Empty fields
### TC-login-VE-003: Locked account

## Security
### TC-login-SEC-001: Brute force
### TC-login-SEC-002: Session timeout

## Edge Cases
### TC-login-EC-001: Concurrent sessions
### TC-login-EC-002: Special characters

## Accessibility
### TC-login-A11Y-001: Keyboard navigation
### TC-login-A11Y-002: Screen reader
`

    const fmtResult = fmtCompliance(goldenOutput, [])
    assert.ok(fmtResult.score >= 2, `format: ${fmtResult.score}/${fmtResult.maxScore}`)

    const coverageResult = coverageCompleteness(goldenOutput, [])
    assert.equal(coverageResult.score, 5, `coverage: ${coverageResult.findings}`)
    assert.equal(coverageResult.maxScore, 5)

    const namingResult = namingConventions(goldenOutput, [])
    assert.ok(namingResult.score >= 3, `naming: ${namingResult.findings}`)

    const templateResult = templateCompliance(goldenOutput, [])
    assert.ok(templateResult.score > 0, `template: ${templateResult.findings}`)
  })

  it('should score S2 TMS read golden output with normalized test cases', async () => {
    const { evaluate: fmtCompliance } = await import(
      join(EVALS_DIR, 'rubrics', 'format-compliance.mjs')
    )
    const { evaluate: namingConventions } = await import(
      join(EVALS_DIR, 'rubrics', 'naming-conventions.mjs')
    )
    const { evaluate: handoffCompliance } = await import(
      join(EVALS_DIR, 'rubrics', 'handoff-compliance.mjs')
    )

    // Golden TMS-imported test cases (normalized from TestRail MCP read)
    const tmsImportContent = `# Test Cases: Auth (TMS Import)

## Metadata
- Feature: auth
- Source: TestRail project 1, suite 42
- Import: TMS read via mcp__testrail__get_cases

## Happy Path
### TC-auth-HP-001: Successful login with valid credentials
- tmsId: testrail:5001
- Priority: high
- Steps:
  1. Navigate to /login → Login form displayed
  2. Enter valid credentials → Fields accept input
  3. Click Sign In → Redirect to /dashboard

### TC-auth-HP-002: Remember me persists session
- tmsId: testrail:5002
- Priority: medium

## Validation & Error
### TC-auth-VE-001: Login with wrong password shows error
- tmsId: testrail:5003
- Priority: high

### TC-auth-VE-002: Empty fields show validation messages
- tmsId: testrail:5004
- Priority: medium

## Security
### TC-auth-SEC-001: Brute force lockout after 5 attempts
- tmsId: testrail:5005
- Priority: critical

## Edge Cases
### TC-auth-EC-001: Concurrent sessions handled correctly
- tmsId: testrail:5006
- Priority: low

## Accessibility
### TC-auth-A11Y-001: Login form keyboard navigable
- tmsId: testrail:5007
- Priority: medium
`

    const handoffJson = JSON.stringify({
      version: '1.0',
      from: 'sparq-orchestrator',
      to: 'sparq-automation-engineer',
      scenario: 'S2',
      phase: 'P1',
      status: 'success',
      report: {
        counts: { testCases: 7, automatable: 7, skipped: 1 },
        artifacts: ['.sparq/test-cases/TC-auth-tms-import.md'],
      },
    })

    const allContent = `${tmsImportContent}\n---\n${handoffJson}`

    // format-compliance: should find TC IDs (no REQ IDs expected in TMS import)
    const fmtResult = fmtCompliance(allContent, [])
    assert.ok(fmtResult.score >= 1, `format: ${fmtResult.score}/${fmtResult.maxScore}`)

    // naming-conventions: TC IDs should be well-formed
    const namingResult = namingConventions(allContent, [])
    assert.ok(namingResult.score >= 2, `naming: ${namingResult.findings}`)

    // handoff-compliance: S2 handoff structure
    const handoffResult = handoffCompliance(allContent, [])
    assert.equal(handoffResult.score, 8, `handoff: ${handoffResult.findings}`)
    assert.equal(handoffResult.maxScore, 8)

    // Combined score should be high
    const totalScore = fmtResult.score + namingResult.score + handoffResult.score
    const totalMax = fmtResult.maxScore + namingResult.maxScore + handoffResult.maxScore
    const pct = Math.round((totalScore / totalMax) * 100)

    assert.ok(
      pct >= 80,
      `S2 TMS read golden output should score >= 80%, got ${pct}% (${totalScore}/${totalMax})`,
    )
  })
})

// ---------------------------------------------------------------------------
// Execute mode: parseArtifacts
// ---------------------------------------------------------------------------

describe('parseArtifacts', () => {
  // Replicate the pure function from run-eval.mjs for direct testing
  function parseArtifacts(response) {
    const artifacts = new Map()
    for (const match of response.matchAll(
      /--- ARTIFACT:\s*(.+?)\s*---\n([\s\S]*?)--- END ARTIFACT ---/g,
    )) {
      artifacts.set(match[1].trim(), match[2].trim())
    }
    return artifacts
  }

  it('should extract single artifact', () => {
    const response = `--- ARTIFACT: e2e/specs/login.spec.ts ---
import { test } from '../fixtures'
test('login works', async () => {})
--- END ARTIFACT ---`
    const artifacts = parseArtifacts(response)
    assert.equal(artifacts.size, 1)
    assert.ok(artifacts.has('e2e/specs/login.spec.ts'))
    assert.ok(artifacts.get('e2e/specs/login.spec.ts').includes("test('login works'"))
  })

  it('should extract multiple artifacts', () => {
    const response = `--- ARTIFACT: spec.ts ---
code1
--- END ARTIFACT ---
Some text between
--- ARTIFACT: .sparq/handoff.json ---
{"status":"success"}
--- END ARTIFACT ---`
    const artifacts = parseArtifacts(response)
    assert.equal(artifacts.size, 2)
    assert.ok(artifacts.has('spec.ts'))
    assert.ok(artifacts.has('.sparq/handoff.json'))
  })

  it('should return empty map for no artifacts', () => {
    const response = 'Just some text without delimiters'
    const artifacts = parseArtifacts(response)
    assert.equal(artifacts.size, 0)
  })

  it('should handle empty artifact content', () => {
    const response = `--- ARTIFACT: empty.txt ---

--- END ARTIFACT ---`
    const artifacts = parseArtifacts(response)
    assert.equal(artifacts.size, 1)
    assert.equal(artifacts.get('empty.txt'), '')
  })
})

// ---------------------------------------------------------------------------
// PROVIDERS registry
// ---------------------------------------------------------------------------

describe('PROVIDERS registry', () => {
  const PROVIDERS = {
    mock: { type: 'mock' },
    haiku: { type: 'anthropic', modelId: 'claude-haiku-4-5-20251001' },
    sonnet: { type: 'anthropic', modelId: 'claude-sonnet-4-5-20250929' },
    opus: { type: 'anthropic', modelId: 'claude-opus-4-6' },
    local: { type: 'openai' },
  }

  it('should have all 5 provider entries', () => {
    const expected = ['mock', 'haiku', 'sonnet', 'opus', 'local']
    assert.deepEqual(Object.keys(PROVIDERS).sort(), expected.sort())
  })

  it('should have anthropic type with modelId for cloud models', () => {
    for (const key of ['haiku', 'sonnet', 'opus']) {
      assert.equal(PROVIDERS[key].type, 'anthropic')
      assert.ok(PROVIDERS[key].modelId.startsWith('claude-'), `${key} missing modelId`)
    }
  })

  it('should have openai type for local', () => {
    assert.equal(PROVIDERS.local.type, 'openai')
  })

  it('should have mock type for mock', () => {
    assert.equal(PROVIDERS.mock.type, 'mock')
  })
})

// ---------------------------------------------------------------------------
// SOURCE_TO_TOOL mapping
// ---------------------------------------------------------------------------

describe('SOURCE_TO_TOOL mapping', () => {
  const SOURCE_TO_TOOL = {
    jira: 'mcp__atlassian__jira_get_issue',
    confluence: 'mcp__atlassian__confluence_get_page',
    figma: 'mcp__figma__get_design_context',
    local: 'filesystem read',
    state: 'filesystem read (.sparq/state/)',
    testrail_sections: 'mcp__testrail__get_sections',
    testrail_cases: 'mcp__testrail__get_cases',
    qase_suites: 'mcp__qase__list_suites',
    qase_cases: 'mcp__qase__list_cases',
    conventions: 'project conventions (filesystem read)',
    existing_spec: 'existing test file (filesystem read)',
  }

  it('should have all 11 source type entries', () => {
    assert.equal(Object.keys(SOURCE_TO_TOOL).length, 11)
  })

  it('should include conventions and existing_spec entries', () => {
    assert.ok(SOURCE_TO_TOOL.conventions, 'conventions key missing')
    assert.ok(SOURCE_TO_TOOL.existing_spec, 'existing_spec key missing')
  })

  it('should have MCP tool names for external sources', () => {
    for (const key of ['jira', 'confluence', 'figma']) {
      assert.ok(SOURCE_TO_TOOL[key].startsWith('mcp__'), `${key} should start with mcp__`)
    }
  })
})

// ---------------------------------------------------------------------------
// Execute mode: calculateCost
// ---------------------------------------------------------------------------

describe('calculateCost', () => {
  const MODEL_PRICING = {
    haiku: [1, 5],
    sonnet: [3, 15],
    opus: [5, 25],
  }

  function calculateCost(stats, modelKey) {
    const pricing = MODEL_PRICING[modelKey]
    if (!pricing) return 0
    const inputCost = (stats.inputTokens / 1_000_000) * pricing[0]
    const outputCost = (stats.outputTokens / 1_000_000) * pricing[1]
    return inputCost + outputCost
  }

  it('should calculate haiku cost correctly', () => {
    const stats = { inputTokens: 20_000, outputTokens: 3_000 }
    const cost = calculateCost(stats, 'haiku')
    // (20000/1M)*1 + (3000/1M)*5 = 0.02 + 0.015 = 0.035
    assert.ok(Math.abs(cost - 0.035) < 0.0001)
  })

  it('should calculate opus cost correctly', () => {
    const stats = { inputTokens: 100_000, outputTokens: 5_000 }
    const cost = calculateCost(stats, 'opus')
    // (100000/1M)*5 + (5000/1M)*25 = 0.5 + 0.125 = 0.625
    assert.ok(Math.abs(cost - 0.625) < 0.0001)
  })

  it('should calculate zero cost for zero tokens', () => {
    const stats = { inputTokens: 0, outputTokens: 0 }
    assert.equal(calculateCost(stats, 'haiku'), 0)
  })

  it('should return zero for local model (no pricing)', () => {
    const stats = { inputTokens: 100_000, outputTokens: 5_000 }
    const cost = calculateCost(stats, 'local')
    assert.equal(cost, 0)
  })
})

// ---------------------------------------------------------------------------
// Execute mode: SCENARIO_PIPELINES coverage
// ---------------------------------------------------------------------------

describe('SCENARIO_PIPELINES', () => {
  const SCENARIO_PIPELINES = {
    classification: [{ agent: 'orchestrator', phase: 'P0' }],
    S1: [
      { agent: 'requirements-analyst', phase: 'P1' },
      { agent: 'manual-test-writer', phase: 'P2' },
    ],
    S2: [{ agent: 'automation-engineer', phase: 'P2' }],
    S3: [
      { agent: 'requirements-analyst', phase: 'P1' },
      { agent: 'automation-engineer', phase: 'P2' },
    ],
    S4: [{ agent: 'test-validator', phase: 'P2' }],
    S5: [
      { agent: 'requirements-analyst', phase: 'P1' },
      { agent: 'test-validator', phase: 'P1' },
    ],
    S6: [{ agent: 'automation-engineer', phase: 'P2' }],
    'S1+S2': [
      { agent: 'requirements-analyst', phase: 'P1' },
      { agent: 'manual-test-writer', phase: 'P2' },
      { agent: 'automation-engineer', phase: 'P2' },
    ],
  }

  it('should cover all 8 scenario types', () => {
    const expected = ['classification', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S1+S2']
    assert.deepEqual(Object.keys(SCENARIO_PIPELINES).sort(), expected.sort())
  })

  it('should have valid agent names in all pipelines', () => {
    const validAgents = new Set([
      'orchestrator',
      'requirements-analyst',
      'manual-test-writer',
      'automation-engineer',
      'test-validator',
    ])
    for (const [scenario, pipeline] of Object.entries(SCENARIO_PIPELINES)) {
      for (const step of pipeline) {
        assert.ok(validAgents.has(step.agent), `Invalid agent "${step.agent}" in ${scenario}`)
      }
    }
  })

  it('should have non-empty pipelines for all scenarios', () => {
    for (const [scenario, pipeline] of Object.entries(SCENARIO_PIPELINES)) {
      assert.ok(pipeline.length > 0, `Empty pipeline for ${scenario}`)
    }
  })
})

// ---------------------------------------------------------------------------
// Rubric Weighting (GAP 1.5)
// ---------------------------------------------------------------------------

describe('rubric weighting', () => {
  const SUBSTANCE_RUBRICS = new Set([
    'assertion-detection',
    'requirement-coverage',
    'executability-check',
    'coverage-completeness',
    'playwright-syntax',
  ])

  const BEHAVIORAL_RUBRICS = new Set(['error-handling-compliance', 'progress-signal-compliance'])

  function getRubricWeight(name) {
    if (SUBSTANCE_RUBRICS.has(name)) return 2
    if (BEHAVIORAL_RUBRICS.has(name)) return 1.5
    return 1
  }

  it('should weight substance rubrics at 2x', () => {
    assert.equal(getRubricWeight('assertion-detection'), 2)
    assert.equal(getRubricWeight('requirement-coverage'), 2)
    assert.equal(getRubricWeight('executability-check'), 2)
    assert.equal(getRubricWeight('playwright-syntax'), 2)
    assert.equal(getRubricWeight('coverage-completeness'), 2)
  })

  it('should weight behavioral rubrics at 1.5x', () => {
    assert.equal(getRubricWeight('error-handling-compliance'), 1.5)
    assert.equal(getRubricWeight('progress-signal-compliance'), 1.5)
  })

  it('should weight structural rubrics at 1x', () => {
    assert.equal(getRubricWeight('format-compliance'), 1)
    assert.equal(getRubricWeight('naming-conventions'), 1)
    assert.equal(getRubricWeight('handoff-compliance'), 1)
    assert.equal(getRubricWeight('regression-compliance'), 1)
  })
})

// ---------------------------------------------------------------------------
// Execute mode: extractAgentReferences
// ---------------------------------------------------------------------------

describe('extractAgentReferences', () => {
  function extractAgentReferences(agentContent) {
    const refsBlock = agentContent.match(/<references>([\s\S]*?)<\/references>/)
    if (!refsBlock) return []
    const paths = []
    for (const [, path] of refsBlock[1].matchAll(/- [`']?([^`'\n]+\.(?:md|json))[`']?/g)) {
      const cleaned = path
        .replace(/^\.\/?/, '')
        .trim()
        .split(/\s+--/)[0]
        .trim()
      paths.push(cleaned)
    }
    return paths
  }

  it('should extract references from agent markdown', () => {
    const content = `# Agent
<references>
Load at startup:
- \`.claude/skills/sparq-shared/references/handoff-schema.md\` -- handoff protocol
- \`.claude/skills/sparq-shared/references/progress-protocol.md\` -- progress signals
</references>`
    const refs = extractAgentReferences(content)
    assert.equal(refs.length, 2)
    assert.ok(refs[0].includes('handoff-schema.md'))
    assert.ok(refs[1].includes('progress-protocol.md'))
  })

  it('should return empty array when no references block', () => {
    assert.deepEqual(extractAgentReferences('# Agent\nNo refs here'), [])
  })

  it('should strip -- description suffixes', () => {
    const content = `<references>
- \`.claude/refs/foo.md\` -- description here
</references>`
    const refs = extractAgentReferences(content)
    assert.equal(refs.length, 1)
    assert.ok(!refs[0].includes('--'))
  })

  it('should parse real agent references', () => {
    const agentContent = readFileSync(
      resolve(import.meta.dirname, '../../claude/agents/sparq-automation-engineer.md'),
      'utf-8',
    )
    const refs = extractAgentReferences(agentContent)
    assert.ok(refs.length >= 4, `Expected >= 4 refs, got ${refs.length}`)
    assert.ok(refs.some((r) => r.includes('handoff-schema.md')))
    assert.ok(refs.some((r) => r.includes('playwright-patterns.md')))
  })
})

// ---------------------------------------------------------------------------
// CLI mode banner output
// ---------------------------------------------------------------------------

describe('eval runner CLI', () => {
  function runEval(args, env = {}) {
    try {
      const output = execFileSync(process.execPath, [RUNNER_PATH, ...args], {
        encoding: 'utf-8',
        timeout: 10_000,
        env: { ...process.env, ...env },
      })
      return { status: 0, output }
    } catch (err) {
      return {
        status: err.status ?? 1,
        output: (err.stdout ?? '') + (err.stderr ?? ''),
      }
    }
  }

  it('should show mock mode banner by default', () => {
    const { status, output } = runEval(['s6-bug-regression'])
    assert.equal(status, 2, 'strict default should fail policy when case is not evaluated')
    assert.ok(output.includes('Mode: Mock'), 'Should show Mock mode in banner')
    assert.ok(output.includes('Policy: strict'), 'Should display strict policy banner')
  })

  it('should show mock mode banner with explicit --model mock', () => {
    const { status, output } = runEval(['--model', 'mock', 's6-bug-regression'])
    assert.equal(status, 2, 'strict default should fail policy when case is not evaluated')
    assert.ok(output.includes('Mode: Mock'), 'Should show Mock mode in banner')
  })

  it('should exit with error when --model haiku is used without API key', () => {
    const { status, output } = runEval(['--model', 'haiku', 's6-bug-regression'], {
      ANTHROPIC_API_KEY: '',
    })
    assert.equal(status, 1, `Expected exit code 1, got ${status}`)
    assert.ok(output.includes('ANTHROPIC_API_KEY'), 'Should mention ANTHROPIC_API_KEY')
  })

  it('should exit with error when --model local is used without SPARQ_LOCAL_MODEL_URL', () => {
    const { status, output } = runEval(['--model', 'local', 's6-bug-regression'], {
      SPARQ_LOCAL_MODEL_URL: '',
    })
    assert.equal(status, 1, `Expected exit code 1, got ${status}`)
    assert.ok(output.includes('SPARQ_LOCAL_MODEL_URL'), 'Should mention SPARQ_LOCAL_MODEL_URL')
  })

  it('should exit with error for unknown model', () => {
    const { status, output } = runEval(['--model', 'gpt4', 's6-bug-regression'])
    assert.equal(status, 1, `Expected exit code 1, got ${status}`)
    assert.ok(output.includes('Unknown model'), 'Should mention unknown model')
    assert.ok(output.includes('Shortcuts'), 'Should list shortcuts')
    assert.ok(output.includes('claude-*'), 'Should mention custom model IDs')
  })

  it('should accept custom claude-* model ID (exits with API key error)', () => {
    const { status, output } = runEval(
      ['--model', 'claude-3-haiku-20240307', 's6-bug-regression'],
      {
        ANTHROPIC_API_KEY: '',
      },
    )
    assert.equal(status, 1, `Expected exit code 1, got ${status}`)
    assert.ok(output.includes('ANTHROPIC_API_KEY'), 'Should require API key for custom model')
  })

  it('should print verdict and next action lines', () => {
    const { status, output } = runEval(['s6-bug-regression'])
    assert.equal(status, 2)
    assert.ok(output.includes('[sparq] EVAL_STATUS=FAIL'), 'Should emit machine-readable verdict')
    assert.ok(output.includes('[sparq] NEXT_ACTION='), 'Should emit machine-readable next action')
    assert.ok(output.includes('Duration:'), 'Should include summary duration')
  })
})

// ---------------------------------------------------------------------------
// Model-based grader helpers (GAP 1.4)
// ---------------------------------------------------------------------------

describe('model grader JSON parsing', () => {
  // Replicate the grader helpers for unit testing (they are module-private)
  function parseGraderResponse(text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      return null
    }
  }

  function graderJsonToResult(data) {
    const findings = []
    let score = 0
    let maxScore = 0
    for (const [key, val] of Object.entries(data)) {
      if (key === 'overallScore' || key === 'feedback') continue
      if (typeof val === 'number') {
        score += val
        maxScore += 5
      }
    }
    if (data.feedback) findings.push(data.feedback)
    return { score, maxScore, findings }
  }

  it('should parse code-quality-grader JSON response', () => {
    const response = `Here is my evaluation:\n\n\`\`\`json\n${JSON.stringify({
      pomAdherence: 5,
      selectorQuality: 4,
      bddStructure: 4,
      fixturePattern: 5,
      importConventions: 5,
      overallScore: 4.6,
      feedback: 'Excellent POM adherence.',
    })}\n\`\`\``
    const parsed = parseGraderResponse(response)
    assert.ok(parsed !== null)
    const result = graderJsonToResult(parsed)
    assert.equal(result.score, 23, 'Sum of dimension scores: 5+4+4+5+5')
    assert.equal(result.maxScore, 25, '5 dimensions × 5 max')
    assert.ok(result.findings[0].includes('POM'))
  })

  it('should parse error-handling-grader JSON response', () => {
    const response = JSON.stringify({
      retryProtocol: 4,
      fallbackBehavior: 3,
      gapDocumentation: 5,
      progressSignals: 4,
      overallScore: 4.0,
      feedback: 'Good retry handling.',
    })
    const parsed = parseGraderResponse(response)
    const result = graderJsonToResult(parsed)
    assert.equal(result.score, 16, 'Sum: 4+3+5+4')
    assert.equal(result.maxScore, 20, '4 dimensions × 5 max')
  })

  it('should return null for non-JSON response', () => {
    assert.equal(parseGraderResponse('No JSON here at all'), null)
  })

  it('should return null for malformed JSON', () => {
    assert.equal(parseGraderResponse('{ broken json }'), null)
  })
})
