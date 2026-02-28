// Shared content detection utilities for rubrics that analyze test code.

/**
 * Detect whether content contains test code from either Playwright or Cypress.
 */
export function isTestContent(content) {
  return (
    content.includes('test.describe') ||
    content.includes("test('") ||
    content.includes('test("') ||
    content.includes('describe(') ||
    content.includes("it('") ||
    content.includes('it("')
  )
}

/**
 * Detect whether content is Cypress-specific (has describe/it but not test.describe).
 */
export function isCypressContent(content) {
  return (
    (content.includes('describe(') || content.includes("it('") || content.includes('it("')) &&
    !content.includes('test.describe')
  )
}

/**
 * Detect whether content is Playwright-specific (has test.describe, Playwright imports, or Locator accessors).
 */
export function isPlaywrightContent(content) {
  return (
    content.includes('test.describe') ||
    content.includes('test.only(') ||
    content.includes('test.skip(') ||
    content.includes("from '@playwright/test'") ||
    content.includes('from "../fixtures') ||
    content.includes("from '../fixtures") ||
    /get \w+\(\):\s*Locator/.test(content)
  )
}

/**
 * Auto-detect framework from file content.
 * Returns 'playwright', 'cypress', or null when ambiguous.
 */
export function detectFrameworkFromContent(content) {
  const pw = isPlaywrightContent(content)
  const cy = isCypressContent(content)
  if (pw && !cy) return 'playwright'
  if (cy && !pw) return 'cypress'
  return null
}

/**
 * Detect whether content contains page object or test fixture patterns.
 */
export function isTestOrPageContent(content) {
  return (
    isTestContent(content) ||
    /class \w+Page\b/.test(content) ||
    /get \w+\(\):\s*Locator/.test(content) ||
    /Cypress\.Commands\.add\(/.test(content)
  )
}

/**
 * Extract spec-file content from combined content (split on --- delimiter).
 * Returns only sections matching the given indicators, excluding page objects.
 *
 * @param {string} content - Combined output content
 * @param {string[]} indicators - Strings that identify spec sections (e.g., ['.spec.', 'test.describe'])
 * @returns {string} Filtered spec content
 */
export function extractSpecContent(content, indicators) {
  const sections = content.split('\n---\n')
  const specSections = sections.filter((s) => indicators.some((ind) => s.includes(ind)))
  return specSections.join('\n---\n')
}
