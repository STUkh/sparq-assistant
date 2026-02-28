/**
 * Locator quality rubric — validates generated test code uses resilient selectors.
 * Catches fragile CSS, XPath, and positional selectors that cause brittle tests.
 * Checks: quality locators (data-testid OR semantic), no fragile CSS, no XPath, no positional.
 * Supports both Playwright and Cypress locator patterns.
 */

import { isTestOrPageContent } from './shared/content-detect.mjs'
import { finding, SEVERITY } from './shared/finding.mjs'

function checkQualityLocators(content) {
  const hasTestId =
    /getByTestId\s*\(/.test(content) ||
    /data-testid/.test(content) ||
    /\[data-testid=/.test(content) ||
    /cy\.get\s*\(\s*['"]?\[data-testid/.test(content)

  const hasSemantic =
    /getByRole\s*\(/.test(content) ||
    /getByLabel\s*\(/.test(content) ||
    /getByText\s*\(/.test(content) ||
    /getByPlaceholder\s*\(/.test(content) ||
    /getByAltText\s*\(/.test(content) ||
    /getByTitle\s*\(/.test(content) ||
    /cy\.contains\s*\(/.test(content) ||
    /cy\.findByRole\s*\(/.test(content)

  if (hasTestId || hasSemantic) return null
  return finding(
    'No quality locators found (expected: getByTestId, getByRole, getByLabel, getByText, or cy.contains)',
    SEVERITY.warning,
  )
}

function checkNoFragileCss(content) {
  const fragilePatterns = [
    // Simple class selectors: .locator('.some-class') or cy.get('.some-class')
    /\.locator\s*\(\s*['"]\.[\w-]+['"]\s*\)/g,
    /cy\.get\s*\(\s*['"]\.[\w-]+['"]\s*\)/g,
    // Simple ID selectors: .locator('#some-id') or cy.get('#some-id')
    /\.locator\s*\(\s*['"]#[\w-]+['"]\s*\)/g,
    /cy\.get\s*\(\s*['"]#[\w-]+['"]\s*\)/g,
    // Tag with class: .locator('div.class') or cy.get('div.class')
    /\.locator\s*\(\s*['"][a-z]+\.[\w-]+['"]\s*\)/g,
    /cy\.get\s*\(\s*['"][a-z]+\.[\w-]+['"]\s*\)/g,
    // Tag with ID: .locator('div#some-id') or cy.get('div#some-id')
    /\.locator\s*\(\s*['"][a-z]+#[\w-]+['"]\s*\)/g,
    /cy\.get\s*\(\s*['"][a-z]+#[\w-]+['"]\s*\)/g,
    // Nested selectors with >: .locator('div > span')
    /\.locator\s*\(\s*['"][^'"]*>[^'"]*['"]\s*\)/g,
    /cy\.get\s*\(\s*['"][^'"]*>[^'"]*['"]\s*\)/g,
    // Deprecated page.$() / page.$$() with CSS
    /page\.\$\$?\s*\(\s*['"][.#][^'"]+['"]\s*\)/g,
  ]

  const matches = []
  for (const pattern of fragilePatterns) {
    pattern.lastIndex = 0
    const found = content.match(pattern)
    if (found) matches.push(...found)
  }

  // Deduplicate and exclude data-testid attribute selectors
  const unique = [...new Set(matches)].filter((m) => !m.includes('data-testid'))

  if (unique.length === 0) return null
  return finding(
    `${unique.length} fragile CSS selector(s) found (use data-testid or semantic locators): ${unique.slice(0, 3).join(', ')}`,
    SEVERITY.warning,
  )
}

function checkNoXpath(content) {
  const hasXpath =
    /xpath=/.test(content) ||
    /\/\/\w+\[/.test(content) ||
    /page\.locator\s*\(\s*['"]\/\//.test(content)
  if (!hasXpath) return null
  return finding(
    'XPath selectors found (use data-testid or semantic locators instead)',
    SEVERITY.warning,
  )
}

function checkNoPositional(content) {
  const positionalPatterns = [
    /nth-child\s*\(/,
    /nth-of-type\s*\(/,
    /:first\b/,
    /:last\b/,
    /\.eq\s*\(\s*\d/,
    /\.first\s*\(\s*\)/,
    /\.last\s*\(\s*\)/,
    /\.nth\s*\(\s*\d/,
  ]

  const found = positionalPatterns.filter((p) => p.test(content))
  if (found.length === 0) return null
  return finding(
    'Positional selectors found (nth-child, :first, .eq() — brittle when DOM order changes)',
    SEVERITY.info,
  )
}

const CHECKS = [checkQualityLocators, checkNoFragileCss, checkNoXpath, checkNoPositional]

export function evaluate(content, _checks = [], _options = {}) {
  if (!isTestOrPageContent(content)) {
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
