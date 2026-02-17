/**
 * Playwright syntax rubric - validates generated code follows Playwright conventions.
 * Checks: get accessors, fixture imports, no @playwright/test imports, barrel exports.
 */

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

export function evaluate(content, checks = []) {
  const findings = []
  let score = 0
  let maxScore = 0

  // Check: uses get accessors for locators (not readonly assignments)
  maxScore++
  if (/get \w+\(\):\s*Locator/.test(content)) {
    score++
  } else {
    findings.push('No get accessor locators found (expected: get fieldName(): Locator)')
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

  return { score, maxScore, findings }
}
