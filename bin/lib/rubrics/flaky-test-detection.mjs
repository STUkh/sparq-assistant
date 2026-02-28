/**
 * Flaky test detection rubric — catches patterns that cause intermittent test failures.
 * Checks: arbitrary waits, hardcoded delays, proper wait strategies,
 * timing-dependent assertions, test data isolation.
 * Supports both Playwright and Cypress patterns.
 */

import { isTestContent } from './shared/content-detect.mjs'
import { finding, SEVERITY } from './shared/finding.mjs'

function checkNoArbitraryWaits(content) {
  const patterns = [
    { regex: /waitForTimeout\s*\(\s*\d+\s*\)/g, label: 'waitForTimeout(ms)' },
    { regex: /cy\.wait\s*\(\s*\d+\s*\)/g, label: 'cy.wait(ms)' },
    { regex: /setTimeout\s*\(/g, label: 'setTimeout()' },
  ]

  const found = []
  for (const { regex, label } of patterns) {
    regex.lastIndex = 0
    const matches = content.match(regex)
    if (matches) found.push(`${label} x${matches.length}`)
  }

  // Allow named alias waits: cy.wait('@alias') is correct usage
  if (found.length === 0) return null
  return finding(
    `Arbitrary waits found: ${found.join(', ')} — use explicit wait conditions instead (waitForSelector, expect().toBeVisible(), locator.waitFor())`,
    SEVERITY.critical,
  )
}

function checkNoHardcodedDelays(content) {
  const patterns = [/\bsleep\s*\(\s*\d/g, /\bdelay\s*\(\s*\d/g, /new Promise.*setTimeout/g]

  const found = patterns.filter((p) => {
    p.lastIndex = 0
    return p.test(content)
  })
  if (found.length === 0) return null
  return finding(
    'Hardcoded delay patterns found (sleep/delay/Promise+setTimeout)',
    SEVERITY.critical,
  )
}

function checkProperWaitStrategies(content) {
  const properPatterns = [
    // Playwright explicit waits
    /waitForSelector\s*\(/,
    /waitForResponse\s*\(/,
    /waitForURL\s*\(/,
    /waitForLoadState\s*\(/,
    /waitForEvent\s*\(/,
    /\.waitFor\s*\(/,
    // Playwright auto-retrying assertions (web-first) — comprehensive list
    /expect\s*\([^)]+\)\s*\.to(?:Be(?:Visible|Hidden|Enabled|Disabled|Checked|Editable|Attached|Detached)|Have(?:Text|URL|Title|Value|Values|Count|Attribute|Class|CSS)|ContainText)\s*\(/,
    // Cypress named alias waits
    /cy\.wait\s*\(\s*['"]@/,
    /cy\.intercept\s*\(/,
    // Cypress implicit wait assertions — all .should() chains retry
    /\.should\s*\(\s*['"]/,
  ]

  const hasProper = properPatterns.some((p) => p.test(content))
  if (hasProper) return null
  return finding(
    'No proper wait strategies found (use waitForSelector, expect().toBeVisible(), cy.intercept+cy.wait(@alias), or .should())',
    SEVERITY.warning,
  )
}

function checkNoTimingDependentAssertions(content) {
  // Detect pattern: goto/visit followed immediately by assertion without proper wait
  const lines = content.split('\n')
  let lastWasNavigation = false
  const issues = []

  // Auto-retrying assertions that are safe after navigation
  const autoRetryPattern =
    /expect\s*\([^)]*\)\s*\.to(?:Have(?:URL|Title|Text)|ContainText|Be(?:Visible|Hidden))\s*\(/

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip blank lines and comments — do not reset navigation flag
    if (trimmed.length === 0 || trimmed.startsWith('//')) continue

    if (/\.(goto|navigate)\s*\(/.test(trimmed) || /cy\.visit\s*\(/.test(trimmed)) {
      lastWasNavigation = true
      continue
    }

    if (lastWasNavigation && /\.(toHaveText|toContainText|toHaveURL)\s*\(/.test(trimmed)) {
      // Safe if it is an auto-retrying assertion (expect(locator).toHaveText())
      const isAutoRetry = autoRetryPattern.test(trimmed)
      const hasWaitFor = /waitFor/.test(trimmed)
      if (!isAutoRetry && !hasWaitFor) {
        issues.push(trimmed.slice(0, 60))
      }
    }

    // Any non-blank, non-comment line resets navigation state
    lastWasNavigation = false
  }

  if (issues.length === 0) return null
  return finding(
    `${issues.length} assertion(s) immediately after navigation without explicit wait or auto-retry`,
    SEVERITY.warning,
  )
}

function checkTestDataIsolation(content) {
  // Check for global mutable state: let/var at module level that gets assigned inside tests
  const globalMutablePattern = /^(?:let|var)\s+(\w+)/gm
  const globalVars = [...content.matchAll(globalMutablePattern)].map((m) => m[1])

  if (globalVars.length === 0) return null

  // Check if any global var is assigned inside a test/it block
  const testBlocks = content.split(/(?:test|it)\s*\(\s*['"`]/)

  // Also identify hook blocks for exclusion — beforeEach/beforeAll assignments are legitimate setup
  const hookBlocks = content.split(/(?:test\.)?(?:before|after)(?:Each|All)\s*\(/)

  const mutatedInTests = globalVars.filter((varName) => {
    const inTest = testBlocks.some(
      (block, i) => i > 0 && new RegExp(`\\b${varName}\\s*=`).test(block),
    )
    if (!inTest) return false

    // If the variable is also set in a hook block, it is likely legitimate setup
    const inHook = hookBlocks.some(
      (block, i) => i > 0 && new RegExp(`\\b${varName}\\s*=`).test(block),
    )
    return !inHook
  })

  if (mutatedInTests.length === 0) return null
  return finding(
    `Shared mutable state: ${mutatedInTests.join(', ')} — tests should not share mutable variables`,
    SEVERITY.warning,
  )
}

const CHECKS = [
  checkNoArbitraryWaits,
  checkNoHardcodedDelays,
  checkProperWaitStrategies,
  checkNoTimingDependentAssertions,
  checkTestDataIsolation,
]

export function evaluate(content, _checks = [], _options = {}) {
  if (!isTestContent(content)) {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  const findings = []
  let score = 0

  for (const checkFn of CHECKS) {
    const result = checkFn(content)
    if (result) {
      findings.push(result)
    } else {
      score++
    }
  }

  return { score, maxScore: CHECKS.length, findings }
}
