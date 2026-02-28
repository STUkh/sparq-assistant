/**
 * Playwright syntax rubric - validates generated code follows Playwright conventions.
 * Checks: get accessors, fixture imports, no @playwright/test imports, barrel exports.
 */

import { detectFrameworkFromContent, isTestContent } from './shared/content-detect.mjs'

/**
 * Extract spec-file content from combined content (split on --- delimiter).
 * Returns only sections that look like spec files, excluding page objects.
 */
function extractSpecContent(content) {
  const sections = content.split('\n---\n')
  const specSections = sections.filter((s) => s.includes('.spec.') || s.includes('test.describe'))
  return specSections.join('\n---\n')
}

/**
 * Check spec-file-specific conventions (fixture imports, no direct @playwright/test).
 */
function checkSpecConventions(content, findings) {
  let score = 0
  let maxScore = 0
  const specContent = extractSpecContent(content)

  if (specContent) {
    maxScore++
    if (/from ['"]\.\.\/.*fixtures/.test(specContent)) {
      score++
    } else {
      findings.push('Spec should import from fixtures index, not @playwright/test')
    }

    maxScore++
    if (!specContent.includes("from '@playwright/test'")) {
      score++
    } else {
      findings.push('Spec imports directly from @playwright/test (should use fixtures index)')
    }
  }

  return { score, maxScore }
}

/**
 * Detect fixture-injected page objects in spec content.
 * Matches destructured params like ({ loginPage, checkoutPage }) when
 * the spec imports from a fixtures barrel. Excludes Playwright built-ins.
 */
const BUILTIN_FIXTURES = new Set(['page', 'context', 'browser', 'request', 'browserName'])

function detectFixturePageObjects(content) {
  if (!/from\s+['"].*fixtures/.test(content)) return false
  for (const match of content.matchAll(/\(\s*\{([^}]+)\}\s*\)\s*=>/g)) {
    const params = match[1].split(',').map((p) => p.trim())
    for (const param of params) {
      const name = param.replace(/\s*:.*$/, '').trim()
      if (BUILTIN_FIXTURES.has(name)) continue
      if (/^[a-z][a-zA-Z]*(?:Page|View|Panel|Form|Modal|Dialog)\b/.test(name)) return true
    }
  }
  return false
}

export function evaluate(content, checks = [], options = {}) {
  if (!isTestContent(content)) {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  // Skip when framework is Cypress (config or auto-detected)
  const framework = options.framework ?? detectFrameworkFromContent(content)
  if (framework === 'cypress') {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  const findings = []
  let score = 0
  let maxScore = 0

  // Check: uses get accessors for locators OR delegates to page objects
  maxScore++
  const hasGetAccessors = /get \w+\(\):\s*Locator/.test(content)
  const importsPageObjects = /import\s+.*from\s+['"].*pages/.test(content)
  const hasFixturePageObjects = detectFixturePageObjects(content)
  if (hasGetAccessors || importsPageObjects || hasFixturePageObjects) {
    score++
  } else {
    findings.push(
      'No get accessor locators found (expected: get fieldName(): Locator or page object import)',
    )
  }

  // Check: no readonly locator assignments
  maxScore++
  if (!/readonly \w+\s*=\s*this\.page\.(getBy|locator)/.test(content)) {
    score++
  } else {
    findings.push('Found readonly locator assignment (should use get accessor pattern)')
  }

  // Check spec-specific conventions
  const spec = checkSpecConventions(content, findings)
  score += spec.score
  maxScore += spec.maxScore

  // Check pattern-specific checks from eval case
  const dynamic = checkDynamicPatterns(checks, content, findings)
  score += dynamic.score
  maxScore += dynamic.maxScore

  return { score, maxScore, findings }
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
