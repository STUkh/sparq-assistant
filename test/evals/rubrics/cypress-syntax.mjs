/**
 * Cypress syntax rubric - validates generated code follows Cypress conventions.
 * Checks: describe/it blocks, cy.* commands, no Playwright imports, custom commands,
 * no addInitScript, support barrel imports.
 */

/**
 * Extract spec-file content from combined content (split on --- delimiter).
 * Returns only sections that look like spec files, excluding support/page objects.
 */
function extractSpecContent(content) {
  const sections = content.split('\n---\n')
  const specSections = sections.filter((s) => s.includes('.cy.') || s.includes('describe('))
  return specSections.join('\n---\n')
}

/**
 * Check spec-file-specific conventions (describe/it blocks, no Playwright patterns).
 */
function checkSpecConventions(content, findings) {
  let score = 0
  let maxScore = 0
  const specContent = extractSpecContent(content)

  if (specContent) {
    // Must use describe/it blocks (not test.describe/test)
    maxScore++
    if (/describe\(/.test(specContent) && /\bit\(/.test(specContent)) {
      score++
    } else {
      findings.push('Spec should use describe()/it() blocks, not test.describe()/test()')
    }

    // Must NOT have test.describe or standalone test() from Playwright
    maxScore++
    if (!/test\.describe\(/.test(specContent) && !/\btest\(/.test(specContent)) {
      score++
    } else {
      findings.push('Found Playwright test.describe()/test() pattern (should use describe/it)')
    }

    // Must NOT import from @playwright/test
    maxScore++
    if (!specContent.includes("from '@playwright/test'")) {
      score++
    } else {
      findings.push('Spec imports from @playwright/test (should not use Playwright imports)')
    }

    // Must NOT contain await page.* Playwright patterns
    maxScore++
    if (!/await page\./.test(specContent)) {
      score++
    } else {
      findings.push('Found await page.* Playwright pattern (should use cy.* commands)')
    }
  }

  return { score, maxScore }
}

/**
 * Run core Cypress convention checks on the full content.
 */
function checkCoreConventions(content, findings) {
  let score = 0
  let maxScore = 0

  // Check: uses cy.* commands
  maxScore++
  if (/cy\.(get|visit|intercept|contains|find|request|wait|should|type|click)\b/.test(content)) {
    score++
  } else {
    findings.push('No cy.* commands found (expected: cy.get, cy.visit, cy.intercept, etc.)')
  }

  // Check: custom commands use Cypress.Commands.add() pattern
  maxScore++
  const hasCustomCommands = /Cypress\.Commands\.add\(/.test(content)
  const hasCommandsFile = /support\/commands/.test(content) || hasCustomCommands
  if (hasCommandsFile) {
    score++
  } else {
    findings.push('No Cypress.Commands.add() pattern found for custom commands')
  }

  // Check: no addInitScript (should use cy.session())
  maxScore++
  if (!/addInitScript/.test(content)) {
    score++
  } else {
    findings.push('Found addInitScript (should use cy.session() for Cypress)')
  }

  // Check: no @playwright/test imports anywhere
  maxScore++
  if (!content.includes("from '@playwright/test'") && !content.includes('@playwright/test')) {
    score++
  } else {
    findings.push('Found @playwright/test import (Cypress code must not import Playwright)')
  }

  // Check: no await page.* Playwright patterns anywhere
  maxScore++
  if (!/await page\./.test(content)) {
    score++
  } else {
    findings.push('Found await page.* pattern (Cypress uses cy.* chainable commands)')
  }

  return { score, maxScore }
}

/**
 * Run dynamic pattern checks from eval case configuration.
 */
function checkDynamicPatterns(checks, content, findings) {
  let score = 0
  let maxScore = 0

  for (const check of checks) {
    if (check.has_pattern) {
      maxScore++
      if (new RegExp(check.has_pattern).test(content)) {
        score++
      } else {
        findings.push(`Pattern not found: ${check.has_pattern}`)
      }
    }
    if (check.no_pattern) {
      maxScore++
      if (!new RegExp(check.no_pattern).test(content)) {
        score++
      } else {
        findings.push(`Forbidden pattern found: ${check.no_pattern}`)
      }
    }
  }

  return { score, maxScore }
}

export function evaluate(content, checks = []) {
  const findings = []

  const core = checkCoreConventions(content, findings)
  const spec = checkSpecConventions(content, findings)
  const dynamic = checkDynamicPatterns(checks, content, findings)

  return {
    score: core.score + spec.score + dynamic.score,
    maxScore: core.maxScore + spec.maxScore + dynamic.maxScore,
    findings,
  }
}
