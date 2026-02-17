import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  auditPromptMaturity,
  DIMENSIONS,
  formatAuditReport,
  generatePromptFiles,
  updateRuleFileReferences,
} from '../../bin/lib/audit.mjs'
import {
  AUDIT_SENTINEL_END,
  AUDIT_SENTINEL_START,
  MATURITY_LEVELS,
  SPARQ_RULE_FILE,
} from '../../bin/lib/constants.mjs'
import { resetState, setDryRun } from '../../bin/lib/state.mjs'
import { captureLog, cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Content fixtures for different maturity levels
// ---------------------------------------------------------------------------

const LEVEL_1_CONTENT =
  '# Project\n\nThis is a web application built with Vue 3.\nWe use Playwright for E2E testing.'

const LEVEL_2_CONTENT = `# Project

## Testing

We use Playwright for E2E testing with page.goto and expect assertions.
We use data-testid locators for element selection.
Tests are in the e2e/ directory.
We also have test cases for QA with test data and fixtures.
Page objects follow the POM pattern.
Our naming convention uses .spec.ts files.
`

const LEVEL_3_CONTENT = `# Project

## Testing Architecture

We use Playwright for E2E testing with page.goto and expect assertions.
Locators use data-testid attributes with getByRole and getByText.

## Manual Testing
Test cases follow acceptance criteria with expected results and test steps.

## Naming Conventions
Files use .spec.ts naming pattern.
Tests use describe/should structure: describe('Login') > it('should display form').

## Coverage Requirements
Coverage threshold is minimum 80%.
We test happy path (HP), validation errors (VE), and edge cases (EC).

## CI/CD Integration
GitHub Actions runs npm test on every PR.
CI uses npx playwright test --list for smoke verification.

## Page Objects
All page objects extend BasePage with get accessor locators.
`

const LEVEL_4_CONTENT = `# Project

## Testing Architecture

We use Playwright for E2E testing with page.goto and expect assertions.
Locators use data-testid attributes with getByRole and getByText.

## Manual Testing
Test cases follow acceptance criteria with expected results and test steps.
QA checklist items have preconditions documented.

## Naming Conventions
Files use .spec.ts naming pattern.
Tests use test.describe and describe/should structure.

## Coverage Requirements
Coverage threshold is minimum 80%.
We test happy path (HP), validation errors (VE), security (SEC), edge cases (EC), and accessibility (A11Y).

## CI/CD Integration
GitHub Actions runs npm test on every PR.
CI uses npx playwright test for execution.

## Framework-Specific Patterns
Components use data-testid selectors with getByRole and getByLabel.
Vue components use v-if and $emit patterns for testability.

## Page Objects
All page objects extend BasePage with get accessor and get locator patterns.

## Test Data
Fixtures use seed data and factory patterns with example.com domains.
Tests use beforeEach for setup and afterEach for teardown.

## Error Handling in Tests
Tests handle timeout and retry for flaky/stability issues.
We use expect.toThrow for negative test assertions.

## Accessibility Testing
WCAG compliance is checked with axe-core and lighthouse.
We verify aria-label, getByRole, and tab order focus management.
`

// ---------------------------------------------------------------------------
// DIMENSIONS
// ---------------------------------------------------------------------------

describe('DIMENSIONS', () => {
  it('should define exactly 10 dimensions', () => {
    assert.equal(DIMENSIONS.length, 10)
  })

  it('should be frozen', () => {
    assert.ok(Object.isFrozen(DIMENSIONS), 'DIMENSIONS should be frozen')
  })

  it('should have id, label, mentionPatterns, and completePatterns on each dimension', () => {
    for (const dim of DIMENSIONS) {
      assert.equal(typeof dim.id, 'string', `dimension should have string id`)
      assert.equal(typeof dim.label, 'string', `dimension should have string label`)
      assert.ok(Array.isArray(dim.mentionPatterns), `${dim.id} should have mentionPatterns array`)
      assert.ok(Array.isArray(dim.completePatterns), `${dim.id} should have completePatterns array`)
      assert.ok(
        dim.mentionPatterns.length > 0,
        `${dim.id} should have at least one mention pattern`,
      )
      assert.ok(
        dim.completePatterns.length > 0,
        `${dim.id} should have at least one complete pattern`,
      )
    }
  })

  it('should contain all expected dimension ids', () => {
    const ids = DIMENSIONS.map((d) => d.id)
    const expected = [
      'e2e-patterns',
      'manual-testing',
      'naming-conventions',
      'coverage-requirements',
      'ci-integration',
      'framework-selectors',
      'page-objects',
      'test-data',
      'error-handling',
      'accessibility',
    ]
    assert.deepEqual(ids, expected)
  })

  it('should have regex patterns in mentionPatterns and completePatterns', () => {
    for (const dim of DIMENSIONS) {
      for (const p of dim.mentionPatterns) {
        assert.ok(p instanceof RegExp, `${dim.id} mentionPatterns should contain RegExp`)
      }
      for (const p of dim.completePatterns) {
        assert.ok(p instanceof RegExp, `${dim.id} completePatterns should contain RegExp`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// MATURITY_LEVELS
// ---------------------------------------------------------------------------

describe('MATURITY_LEVELS', () => {
  it('should define exactly 5 levels', () => {
    assert.equal(MATURITY_LEVELS.length, 5)
  })

  it('should be frozen', () => {
    assert.ok(Object.isFrozen(MATURITY_LEVELS), 'MATURITY_LEVELS should be frozen')
  })

  it('should have the correct level names in order', () => {
    assert.deepEqual(
      [...MATURITY_LEVELS],
      ['Bare', 'Scaffolded', 'Partial', 'Established', 'Production-Ready'],
    )
  })
})

// ---------------------------------------------------------------------------
// auditPromptMaturity
// ---------------------------------------------------------------------------

describe('auditPromptMaturity', () => {
  let dir

  beforeEach(() => {
    dir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(dir)
    resetState()
  })

  it('should return level 0 "Bare" for empty directory', () => {
    const result = auditPromptMaturity(dir)
    assert.equal(result.level, 0)
    assert.equal(result.levelName, 'Bare')
    assert.equal(result.totalScore, 0)
    assert.equal(result.maxScore, 20)
    assert.equal(result.filesScanned.length, 0)
    assert.equal(result.gaps.length, 10)
    assert.equal(result.recommendations.length, 10)
  })

  it('should return targetDirMissing for non-existent directory', () => {
    const result = auditPromptMaturity(join(dir, 'nonexistent'))
    assert.equal(result.level, 0)
    assert.equal(result.targetDirMissing, true)
    assert.equal(result.recommendations.length, 0)
  })

  it('should return correct structure from audit result', () => {
    const result = auditPromptMaturity(dir)
    assert.ok('level' in result)
    assert.ok('levelName' in result)
    assert.ok('totalScore' in result)
    assert.ok('maxScore' in result)
    assert.ok('dimensions' in result)
    assert.ok('filesScanned' in result)
    assert.ok('gaps' in result)
    assert.ok('recommendations' in result)
    assert.equal(typeof result.level, 'number')
    assert.equal(typeof result.levelName, 'string')
    assert.equal(typeof result.totalScore, 'number')
    assert.equal(typeof result.maxScore, 'number')
    assert.ok(typeof result.dimensions === 'object')
    assert.ok(Array.isArray(result.filesScanned))
    assert.ok(Array.isArray(result.gaps))
    assert.ok(Array.isArray(result.recommendations))
  })

  it('should return all dimensions as gaps at level 0', () => {
    const result = auditPromptMaturity(dir)
    const dimIds = DIMENSIONS.map((d) => d.id)
    assert.deepEqual(result.gaps, dimIds)
  })

  it('should return high-priority recommendations at level 0', () => {
    const result = auditPromptMaturity(dir)
    for (const rec of result.recommendations) {
      assert.equal(rec.priority, 'high')
      assert.ok(rec.action.startsWith('Add '))
      assert.ok('dimension' in rec)
      assert.ok('label' in rec)
    }
  })

  it('should return level 1 "Scaffolded" for generic CLAUDE.md', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), LEVEL_1_CONTENT)
    const result = auditPromptMaturity(dir)
    assert.equal(result.level, 1)
    assert.equal(result.levelName, 'Scaffolded')
    assert.ok(result.totalScore > 0)
    assert.ok(result.totalScore <= 5)
    assert.ok(result.filesScanned.includes('CLAUDE.md'))
  })

  it('should return level 2 "Partial" for CLAUDE.md with some testing content', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), LEVEL_2_CONTENT)
    const result = auditPromptMaturity(dir)
    assert.equal(result.level, 2)
    assert.equal(result.levelName, 'Partial')
    assert.ok(result.totalScore > 5)
    assert.ok(result.totalScore <= 10)
  })

  it('should return level 3 "Established" for rich testing content', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), LEVEL_3_CONTENT)
    const result = auditPromptMaturity(dir)
    assert.equal(result.level, 3)
    assert.equal(result.levelName, 'Established')
    assert.ok(result.totalScore > 10)
    assert.ok(result.totalScore <= 15)
  })

  it('should return level 4 "Production-Ready" for comprehensive content', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), LEVEL_4_CONTENT)
    const result = auditPromptMaturity(dir)
    assert.equal(result.level, 4)
    assert.equal(result.levelName, 'Production-Ready')
    assert.ok(result.totalScore > 15)
    assert.equal(result.gaps.length, 0)
    assert.equal(result.recommendations.length, 0)
  })

  it('should scan .claude/rules/*.md files', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project\n')
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    writeFileSync(
      join(dir, '.claude', 'rules', 'testing.md'),
      'Use Playwright for E2E testing with page.goto and expect assertions.\n',
    )
    const result = auditPromptMaturity(dir)
    assert.ok(result.filesScanned.includes('.claude/rules/testing.md'))
    assert.ok(result.dimensions['e2e-patterns'].score > 0)
  })

  it('should scan .claude/agents/*.md files', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project\n')
    mkdirSync(join(dir, '.claude', 'agents'), { recursive: true })
    writeFileSync(
      join(dir, '.claude', 'agents', 'qa-agent.md'),
      'Manual test cases with acceptance criteria and expected result.\n',
    )
    const result = auditPromptMaturity(dir)
    assert.ok(result.filesScanned.includes('.claude/agents/qa-agent.md'))
    assert.ok(result.dimensions['manual-testing'].score > 0)
  })

  it('should scan .claude/skills/*/SKILL.md files', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project\n')
    mkdirSync(join(dir, '.claude', 'skills', 'test-skill'), { recursive: true })
    writeFileSync(
      join(dir, '.claude', 'skills', 'test-skill', 'SKILL.md'),
      'Coverage threshold minimum 80%. Test happy path HP and edge cases EC.\n',
    )
    const result = auditPromptMaturity(dir)
    assert.ok(result.filesScanned.includes('.claude/skills/test-skill/SKILL.md'))
    assert.ok(result.dimensions['coverage-requirements'].score > 0)
  })

  it('should handle .claude directory without CLAUDE.md (level 0 gate)', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'rules', 'test.md'), 'Some content\n')
    // No CLAUDE.md and no .claude dir at root triggers level 0 — but .claude exists
    const result = auditPromptMaturity(dir)
    // With .claude existing, it scans but CLAUDE.md is absent
    assert.ok(result.level >= 0)
  })

  it('should combine content from multiple scanned files', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), 'We use Playwright for E2E testing.\n')
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    writeFileSync(
      join(dir, '.claude', 'rules', 'patterns.md'),
      'page.goto and expect assertions with getByRole locators.\n',
    )
    const result = auditPromptMaturity(dir)
    // Mention from CLAUDE.md + complete patterns from rules file should yield score 2
    assert.equal(result.dimensions['e2e-patterns'].score, 2)
  })
})

// ---------------------------------------------------------------------------
// Per-dimension scoring
// ---------------------------------------------------------------------------

describe('per-dimension scoring', { concurrency: false }, () => {
  let dir

  beforeEach(() => {
    dir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(dir)
    resetState()
  })

  describe('e2e-patterns', () => {
    it('should score 0 with no testing keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# My App\nA web application.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['e2e-patterns'].score, 0)
    })

    it('should score 1 with mention only (playwright)', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nWe use Playwright for testing.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['e2e-patterns'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nPlaywright tests use page.goto and expect assertions with data-testid.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['e2e-patterns'].score, 2)
    })
  })

  describe('manual-testing', () => {
    it('should score 0 with no manual testing keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nNo testing info here.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['manual-testing'].score, 0)
    })

    it('should score 1 with mention only (test case)', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nWe write test case documents.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['manual-testing'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nTest case docs have acceptance criteria, test steps, and expected result.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['manual-testing'].score, 2)
    })
  })

  describe('page-objects', () => {
    it('should score 0 with no page object keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nSimple project.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['page-objects'].score, 0)
    })

    it('should score 1 with mention only (page object)', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nWe use the page object pattern.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['page-objects'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nPage object pattern with extends BasePage and get accessor methods.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['page-objects'].score, 2)
    })
  })

  describe('accessibility', () => {
    it('should score 0 with no relevant keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nA simple web project with no testing docs.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions.accessibility.score, 0)
    })

    it('should score 1 with mention only (a11y)', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nWe check a11y compliance.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions.accessibility.score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nAccessibility testing with axe for tab order focus management and aria-label getByRole.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions.accessibility.score, 2)
    })
  })

  describe('naming-conventions', () => {
    it('should score 0 with no naming keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nNo guidance here.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['naming-conventions'].score, 0)
    })

    it('should score 1 with mention only', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nFollow a naming convention for files.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['naming-conventions'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nNaming convention: files use .spec.ts extension. describe blocks should test behavior.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['naming-conventions'].score, 2)
    })
  })

  describe('coverage-requirements', () => {
    it('should score 0 with no coverage keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nBasic project.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['coverage-requirements'].score, 0)
    })

    it('should score 1 with mention only', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nWe track test coverage metrics.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['coverage-requirements'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nCoverage thresholds: minimum 80%. Categories: HP, VE, SEC, EC, A11Y.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['coverage-requirements'].score, 2)
    })
  })

  describe('ci-integration', () => {
    it('should score 0 with no CI keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nJust a web app.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['ci-integration'].score, 0)
    })

    it('should score 1 with mention only', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nWe use CI/CD pipeline.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['ci-integration'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nCI/CD uses GitHub Actions. Run npm test in pipeline.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['ci-integration'].score, 2)
    })
  })

  describe('framework-selectors', () => {
    it('should score 0 with no selector keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nNo testing info.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['framework-selectors'].score, 0)
    })

    it('should score 1 with mention only', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nUse data-testid for selectors.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['framework-selectors'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nUse data-testid selectors. Prefer getByRole locators. Vue uses v-if directives.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['framework-selectors'].score, 2)
    })

    it('should score 2 for Svelte patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nUse data-testid selectors. Prefer getByRole locators. Svelte uses {#each} blocks.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['framework-selectors'].score, 2)
    })

    it('should score 2 for vanilla JS patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nUse data-testid selectors. Prefer getByRole locators. Use querySelector for DOM access.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['framework-selectors'].score, 2)
    })
  })

  describe('test-data', () => {
    it('should score 0 with no fixture keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nNothing about tests.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['test-data'].score, 0)
    })

    it('should score 1 with mention only', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nStore test data in fixture files.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['test-data'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nFixture files with factory helpers and seed data. Use beforeEach for setup.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['test-data'].score, 2)
    })
  })

  describe('error-handling', () => {
    it('should score 0 with no error handling keywords', () => {
      writeFileSync(join(dir, 'CLAUDE.md'), '# App\nSimple project docs.\n')
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['error-handling'].score, 0)
    })

    it('should score 1 with mention only', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nCover error handling and error state testing.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['error-handling'].score, 1)
    })

    it('should score 2 with mention + complete patterns', () => {
      writeFileSync(
        join(dir, 'CLAUDE.md'),
        '# App\nError handling tests: timeout and retry for flaky tests. Use expect toThrow.\n',
      )
      const result = auditPromptMaturity(dir)
      assert.equal(result.dimensions['error-handling'].score, 2)
    })
  })
})

// ---------------------------------------------------------------------------
// generatePromptFiles
// ---------------------------------------------------------------------------

describe('generatePromptFiles', () => {
  let dir

  beforeEach(() => {
    dir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(dir)
    resetState()
  })

  it('should generate all 6 files at level 0', () => {
    const auditResult = { level: 0, gaps: DIMENSIONS.map((d) => d.id) }
    captureLog(() => {
      const generated = generatePromptFiles(dir, auditResult, {})
      assert.equal(generated.length, 6)
    })
    assert.ok(existsSync(join(dir, '.sparq', 'prompts')))
  })

  it('should create .sparq/prompts/ directory', () => {
    const auditResult = { level: 0, gaps: DIMENSIONS.map((d) => d.id) }
    captureLog(() => {
      generatePromptFiles(dir, auditResult, {})
    })
    assert.ok(existsSync(join(dir, '.sparq', 'prompts')))
  })

  it('should generate only gap-relevant files at level 2', () => {
    // Level 2 with only e2e-patterns and page-objects as gaps
    const auditResult = { level: 2, gaps: ['e2e-patterns', 'page-objects'] }
    captureLog(() => {
      const generated = generatePromptFiles(dir, auditResult, {})
      // testing-architecture covers e2e-patterns, page-object-conventions covers page-objects
      assert.ok(generated.includes('testing-architecture.md'))
      assert.ok(generated.includes('page-object-conventions.md'))
      // Files whose dimensions have no gap should be skipped
      assert.ok(!generated.includes('test-coverage-strategy.md'))
    })
  })

  it('should generate only level-applicable files at level 3', () => {
    // At level 3, only templates with level 3 in their levels array are eligible
    const auditResult = { level: 3, gaps: DIMENSIONS.map((d) => d.id) }
    captureLog(() => {
      const generated = generatePromptFiles(dir, auditResult, {})
      // testability-guidelines (levels [0,1,2,3]) and test-coverage-strategy (levels [0,1,2,3])
      assert.ok(generated.includes('testability-guidelines.md'))
      assert.ok(generated.includes('test-coverage-strategy.md'))
      // testing-architecture (levels [0,1,2]) should NOT be generated at level 3
      assert.ok(!generated.includes('testing-architecture.md'))
    })
  })

  it('should generate no files at level 4', () => {
    const auditResult = { level: 4, gaps: [] }
    captureLog(() => {
      const generated = generatePromptFiles(dir, auditResult, {})
      assert.equal(generated.length, 0)
    })
  })

  it('should generate Playwright-specific content when config.e2e.framework is playwright', () => {
    const auditResult = { level: 0, gaps: DIMENSIONS.map((d) => d.id) }
    const config = { e2e: { framework: 'playwright' } }
    captureLog(() => {
      generatePromptFiles(dir, auditResult, config)
    })
    const archContent = readFileSync(
      join(dir, '.sparq', 'prompts', 'testing-architecture.md'),
      'utf-8',
    )
    assert.ok(archContent.includes('Playwright'))
    assert.ok(archContent.includes('@playwright/test'))
  })

  it('should generate Cypress-specific content when config.e2e.framework is cypress', () => {
    const auditResult = { level: 0, gaps: DIMENSIONS.map((d) => d.id) }
    const config = { e2e: { framework: 'cypress' } }
    captureLog(() => {
      generatePromptFiles(dir, auditResult, config)
    })
    const archContent = readFileSync(
      join(dir, '.sparq', 'prompts', 'testing-architecture.md'),
      'utf-8',
    )
    assert.ok(archContent.includes('Cypress'))
    assert.ok(archContent.includes('cypress/support'))
  })

  it('should respect dry-run mode and not write files', () => {
    setDryRun(true)
    const auditResult = { level: 0, gaps: DIMENSIONS.map((d) => d.id) }
    captureLog(() => {
      const generated = generatePromptFiles(dir, auditResult, {})
      assert.ok(generated.length > 0, 'should still return file names')
    })
    assert.ok(
      !existsSync(join(dir, '.sparq', 'prompts')),
      'should not create directory in dry-run mode',
    )
  })

  it('should generate files with non-empty content', () => {
    const auditResult = { level: 0, gaps: DIMENSIONS.map((d) => d.id) }
    captureLog(() => {
      const generated = generatePromptFiles(dir, auditResult, {})
      for (const file of generated) {
        const content = readFileSync(join(dir, '.sparq', 'prompts', file), 'utf-8')
        assert.ok(content.length > 0, `${file} should have non-empty content`)
        assert.ok(content.startsWith('#'), `${file} should start with a markdown heading`)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// updateRuleFileReferences
// ---------------------------------------------------------------------------

describe('updateRuleFileReferences', () => {
  let dir

  beforeEach(() => {
    dir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(dir)
    resetState()
  })

  it('should append sentinel block when no sentinel exists', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    const ruleFile = join(dir, '.claude', 'rules', SPARQ_RULE_FILE)
    writeFileSync(ruleFile, '# SparQ QA Assistant\n\nExisting content here.\n')

    captureLog(() => {
      updateRuleFileReferences(dir, ['testing-architecture.md', 'page-object-conventions.md'])
    })

    const content = readFileSync(ruleFile, 'utf-8')
    assert.ok(content.includes(AUDIT_SENTINEL_START))
    assert.ok(content.includes(AUDIT_SENTINEL_END))
    assert.ok(content.includes('@.sparq/prompts/testing-architecture.md'))
    assert.ok(content.includes('@.sparq/prompts/page-object-conventions.md'))
  })

  it('should replace existing sentinel block content', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    const ruleFile = join(dir, '.claude', 'rules', SPARQ_RULE_FILE)
    const initial = [
      '# SparQ QA Assistant\n',
      AUDIT_SENTINEL_START,
      '## Testing Architecture',
      '',
      '@.sparq/prompts/old-file.md',
      AUDIT_SENTINEL_END,
      '\nMore content after.\n',
    ].join('\n')
    writeFileSync(ruleFile, initial)

    captureLog(() => {
      updateRuleFileReferences(dir, ['testing-architecture.md'])
    })

    const content = readFileSync(ruleFile, 'utf-8')
    assert.ok(!content.includes('old-file.md'), 'old reference should be removed')
    assert.ok(content.includes('@.sparq/prompts/testing-architecture.md'))
    assert.ok(content.includes('More content after'), 'non-audit content should be preserved')
  })

  it('should preserve non-audit content in rule file', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    const ruleFile = join(dir, '.claude', 'rules', SPARQ_RULE_FILE)
    const existing = '# SparQ QA Assistant\n\nConfig: `sparq.config.json`\n\nCustom rules here.\n'
    writeFileSync(ruleFile, existing)

    captureLog(() => {
      updateRuleFileReferences(dir, ['test-coverage-strategy.md'])
    })

    const content = readFileSync(ruleFile, 'utf-8')
    assert.ok(content.includes('Custom rules here'), 'existing content should be preserved')
    assert.ok(content.includes('sparq.config.json'), 'original config reference should remain')
    assert.ok(content.includes(AUDIT_SENTINEL_START))
  })

  it('should warn when rule file does not exist', () => {
    // No .claude/rules directory created
    const output = captureLog(() => {
      updateRuleFileReferences(dir, ['testing-architecture.md'])
    })
    assert.ok(output.includes('Rule file not found'), 'should warn about missing rule file')
  })

  it('should list correct @path references', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    const ruleFile = join(dir, '.claude', 'rules', SPARQ_RULE_FILE)
    writeFileSync(ruleFile, '# SparQ\n')
    const files = [
      'testing-architecture.md',
      'page-object-conventions.md',
      'testability-guidelines.md',
    ]

    captureLog(() => {
      updateRuleFileReferences(dir, files)
    })

    const content = readFileSync(ruleFile, 'utf-8')
    for (const f of files) {
      assert.ok(content.includes(`@.sparq/prompts/${f}`), `should contain @path for ${f}`)
    }
  })

  it('should respect dry-run mode and not modify rule file', () => {
    setDryRun(true)
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
    const ruleFile = join(dir, '.claude', 'rules', SPARQ_RULE_FILE)
    const original = '# SparQ\n\nOriginal only.\n'
    writeFileSync(ruleFile, original)

    captureLog(() => {
      updateRuleFileReferences(dir, ['testing-architecture.md'])
    })

    const content = readFileSync(ruleFile, 'utf-8')
    assert.equal(content, original, 'file should not be modified in dry-run mode')
  })
})

// ---------------------------------------------------------------------------
// formatAuditReport
// ---------------------------------------------------------------------------

describe('formatAuditReport', () => {
  afterEach(() => {
    resetState()
  })

  it('should output level and score information', () => {
    const result = auditResultFixture(0, 'Bare', 0)
    const output = captureLog(() => formatAuditReport(result))
    assert.ok(output.includes('Bare'), 'should display level name')
    assert.ok(output.includes('0/20'), 'should display score')
  })

  it('should list all dimension statuses', () => {
    const result = auditResultFixture(4, 'Production-Ready', 20)
    const output = captureLog(() => formatAuditReport(result))
    assert.ok(output.includes('Dimensions'), 'should display Dimensions heading')
    for (const dim of DIMENSIONS) {
      assert.ok(output.includes(dim.label), `should include dimension label "${dim.label}"`)
    }
  })

  it('should show recommendations when gaps exist', () => {
    const result = auditResultFixture(0, 'Bare', 0)
    const output = captureLog(() => formatAuditReport(result))
    assert.ok(output.includes('Recommendations'), 'should display Recommendations heading')
    assert.ok(output.includes('--fix'), 'should mention --fix flag')
  })

  it('should show success message when no gaps exist', () => {
    const result = auditResultFixture(4, 'Production-Ready', 20)
    result.recommendations = []
    const output = captureLog(() => formatAuditReport(result))
    assert.ok(output.includes('production-ready'), 'should show production-ready message')
  })

  it('should show scanned files when present', () => {
    const result = auditResultFixture(2, 'Partial', 8)
    result.filesScanned = ['CLAUDE.md', '.claude/rules/testing.md']
    const output = captureLog(() => formatAuditReport(result))
    assert.ok(output.includes('Scanned'), 'should mention scanned files')
    assert.ok(output.includes('CLAUDE.md'), 'should list CLAUDE.md')
  })
})

// ---------------------------------------------------------------------------
// Helper: create an audit result fixture for formatAuditReport tests
// ---------------------------------------------------------------------------

function auditResultFixture(level, levelName, totalScore) {
  const dimensions = {}
  for (const dim of DIMENSIONS) {
    dimensions[dim.id] = {
      score: totalScore === 20 ? 2 : 0,
      findings: [],
      label: dim.label,
    }
  }
  return {
    level,
    levelName,
    totalScore,
    maxScore: 20,
    dimensions,
    filesScanned: [],
    gaps: totalScore === 20 ? [] : DIMENSIONS.map((d) => d.id),
    recommendations:
      totalScore === 20
        ? []
        : DIMENSIONS.map((d) => ({
            dimension: d.id,
            label: d.label,
            action: `Add ${d.label.toLowerCase()} guidance`,
            priority: 'high',
          })),
  }
}
