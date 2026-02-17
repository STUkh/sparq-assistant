/**
 * Assertion detection rubric — validates generated test code contains assertions.
 * GAP 1.1 fix: catches tests that navigate/interact but never verify outcomes.
 * Checks: expect() calls, assertion density, assertion-to-action ratio.
 */

const ASSERTION_PATTERNS = [
  /expect\s*\(/,
  /\.toHaveURL\s*\(/,
  /\.toHaveTitle\s*\(/,
  /\.toHaveText\s*\(/,
  /\.toBeVisible\s*\(/,
  /\.toBeHidden\s*\(/,
  /\.toBeEnabled\s*\(/,
  /\.toBeDisabled\s*\(/,
  /\.toBeChecked\s*\(/,
  /\.toContainText\s*\(/,
  /\.toHaveValue\s*\(/,
  /\.toHaveAttribute\s*\(/,
  /\.toHaveCount\s*\(/,
  /\.toHaveClass\s*\(/,
  /assert\.\w+\s*\(/,
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
]

function countMatches(content, pattern) {
  return (content.match(pattern) || []).length
}

function hasAssertion(text) {
  return ASSERTION_PATTERNS.some((p) => p.test(text))
}

function isTestContent(content) {
  return (
    content.includes('test.describe') || content.includes("test('") || content.includes('test("')
  )
}

function checkAssertionDensity(content) {
  const totalAssertions = ASSERTION_PATTERNS.reduce((sum, p) => sum + countMatches(content, p), 0)
  const totalActions = ACTION_PATTERNS.reduce((sum, p) => sum + countMatches(content, p), 0)
  if (totalActions === 0) return { pass: true }
  if (totalAssertions >= Math.ceil(totalActions * 0.3)) return { pass: true }
  return {
    pass: false,
    finding:
      `Low assertion density: ${totalAssertions} assertion(s) for ${totalActions} action(s)` +
      ' (expected >= 30% ratio)',
  }
}

function checkPerBlockAssertions(content) {
  const sections = content.split(/test\s*\(\s*['"`]/)
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
    findings.push('No assertions found — test never verifies outcomes (missing expect())')
  }

  // Check 2: Assertion-to-action ratio >= 30%
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
