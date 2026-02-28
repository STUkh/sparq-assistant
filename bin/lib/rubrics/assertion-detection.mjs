/**
 * Assertion detection rubric — validates generated test code contains assertions.
 * GAP 1.1 fix: catches tests that navigate/interact but never verify outcomes.
 * Checks: expect() calls, assertion density, assertion-to-action ratio.
 * Supports both Playwright (expect/toHave*) and Cypress (.should/.and) patterns.
 * Recognizes assertion delegation via page object methods (verify*, assert*, etc.).
 */

import { ASSERTION_DELEGATION_PREFIXES, ASSERTION_DENSITY_THRESHOLD } from './shared/constants.mjs'

const ASSERTION_PATTERNS = [
  /expect\s*\(/g,
  /\.toHaveURL\s*\(/g,
  /\.toHaveTitle\s*\(/g,
  /\.toHaveText\s*\(/g,
  /\.toBeVisible\s*\(/g,
  /\.toBeHidden\s*\(/g,
  /\.toBeEnabled\s*\(/g,
  /\.toBeDisabled\s*\(/g,
  /\.toBeChecked\s*\(/g,
  /\.toContainText\s*\(/g,
  /\.toHaveValue\s*\(/g,
  /\.toHaveAttribute\s*\(/g,
  /\.toHaveCount\s*\(/g,
  /\.toHaveClass\s*\(/g,
  /assert\.\w+\s*\(/g,
  // Cypress assertion patterns
  /\.should\s*\(/g,
  /\.and\s*\(/g,
]

const ACTION_PATTERNS = [
  /\.click\s*\(/g,
  /\.fill\s*\(/g,
  /\.type\s*\(/g,
  /\.press\s*\(/g,
  /\.check\s*\(/g,
  /\.selectOption\s*\(/g,
  /\.goto\s*\(/g,
  /\.navigate\s*\(/g,
  // Cypress action patterns
  /cy\.get\s*\(/g,
  /cy\.visit\s*\(/g,
  /cy\.type\s*\(/g,
  /cy\.click\s*\(/g,
  /cy\.intercept\s*\(/g,
  /cy\.contains\s*\(/g,
]

// Build delegation patterns from shared prefixes — require CamelCase after prefix
const delegationPrefixGroup = ASSERTION_DELEGATION_PREFIXES.join('|')
const ASSERTION_DELEGATION_PATTERNS = [
  // Page object method calls: await page.verifyLoggedIn(), this.verifyHeader()
  new RegExp(`\\.\\s*(?:${delegationPrefixGroup})[A-Z]\\w*\\s*\\(`, 'g'),
  // Standalone function calls: await verifyLoggedIn(page), assertDashboardLoaded(page)
  new RegExp(`(?:^|[;\\n]\\s*)(?:await\\s+)?(?:${delegationPrefixGroup})[A-Z]\\w+\\s*\\(`, 'gm'),
]

function countMatches(content, pattern) {
  pattern.lastIndex = 0
  return (content.match(pattern) || []).length
}

function hasAssertionDelegation(text) {
  return ASSERTION_DELEGATION_PATTERNS.some((p) => {
    p.lastIndex = 0
    return p.test(text)
  })
}

function countDelegationMatches(content) {
  return ASSERTION_DELEGATION_PATTERNS.reduce((sum, p) => sum + countMatches(content, p), 0)
}

function hasAssertion(text) {
  if (
    ASSERTION_PATTERNS.some((p) => {
      p.lastIndex = 0
      return p.test(text)
    })
  )
    return true
  return hasAssertionDelegation(text)
}

function isTestContent(content) {
  return (
    content.includes('test.describe') ||
    content.includes("test('") ||
    content.includes('test("') ||
    content.includes('describe(') ||
    content.includes("it('") ||
    content.includes('it("')
  )
}

function checkAssertionDensity(content) {
  const totalAssertions =
    ASSERTION_PATTERNS.reduce((sum, p) => sum + countMatches(content, p), 0) +
    countDelegationMatches(content)
  const totalActions = ACTION_PATTERNS.reduce((sum, p) => sum + countMatches(content, p), 0)
  if (totalActions === 0) return { pass: true }
  if (totalAssertions >= Math.ceil(totalActions * ASSERTION_DENSITY_THRESHOLD))
    return { pass: true }
  return {
    pass: false,
    finding:
      `Low assertion density: ${totalAssertions} assertion(s) for ${totalActions} action(s)` +
      ` (expected >= ${ASSERTION_DENSITY_THRESHOLD * 100}% ratio)`,
  }
}

function checkPerBlockAssertions(content) {
  // Split on both Playwright test(' and Cypress it(' block patterns
  // Use \b word boundary to avoid matching inside words (e.g., cy.visit(' has 'it(')
  const sections = content.split(/\b(?:test|it)\s*\(\s*['"`]/)
  if (sections.length <= 1) return { pass: true }
  const missing = []
  for (let i = 1; i < sections.length; i++) {
    if (!hasAssertion(sections[i])) {
      const name = sections[i].match(/^([^'"`]+)/)?.[1] ?? `test #${i}`
      missing.push(name)
    }
  }
  if (missing.length === 0) return { pass: true }
  return {
    pass: false,
    finding: `${missing.length} test(s) without assertions: ${missing.join(', ')}`,
  }
}

export function evaluate(content, _checks = [], _options = {}) {
  if (!isTestContent(content)) {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  const findings = []
  let score = 0

  // Check 1: At least one assertion exists
  if (hasAssertion(content)) {
    score++
  } else {
    findings.push(
      'No assertions found — test never verifies outcomes (missing expect() or assertion-delegating methods)',
    )
  }

  // Check 2: Assertion-to-action ratio >= threshold
  const density = checkAssertionDensity(content)
  if (density.pass) {
    score++
  } else {
    findings.push(density.finding)
  }

  // Check 3: Each test block has at least one assertion
  const perBlock = checkPerBlockAssertions(content)
  if (perBlock.pass) {
    score++
  } else {
    findings.push(perBlock.finding)
  }

  return { score, maxScore: 3, findings }
}
