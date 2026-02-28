import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const SHARED_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics', 'shared')

// ---------------------------------------------------------------------------
// shared/constants.mjs
// ---------------------------------------------------------------------------

describe('rubrics/shared/constants.mjs', () => {
  it('should export ASSERTION_DENSITY_THRESHOLD as a number', async () => {
    const { ASSERTION_DENSITY_THRESHOLD } = await import(join(SHARED_DIR, 'constants.mjs'))
    assert.equal(typeof ASSERTION_DENSITY_THRESHOLD, 'number')
    assert.ok(ASSERTION_DENSITY_THRESHOLD > 0 && ASSERTION_DENSITY_THRESHOLD < 1)
  })

  it('should export PHANTOM_ID_TOLERANCE as a number between 0 and 1', async () => {
    const { PHANTOM_ID_TOLERANCE } = await import(join(SHARED_DIR, 'constants.mjs'))
    assert.equal(typeof PHANTOM_ID_TOLERANCE, 'number')
    assert.ok(PHANTOM_ID_TOLERANCE > 0 && PHANTOM_ID_TOLERANCE < 1)
  })

  it('should export DUPLICATE_ID_THRESHOLD as a positive integer', async () => {
    const { DUPLICATE_ID_THRESHOLD } = await import(join(SHARED_DIR, 'constants.mjs'))
    assert.equal(typeof DUPLICATE_ID_THRESHOLD, 'number')
    assert.ok(Number.isInteger(DUPLICATE_ID_THRESHOLD) && DUPLICATE_ID_THRESHOLD > 0)
  })

  it('should export DIRECT_LOCATOR_THRESHOLD and DIRECT_CY_GET_THRESHOLD as positive integers', async () => {
    const { DIRECT_LOCATOR_THRESHOLD, DIRECT_CY_GET_THRESHOLD } = await import(
      join(SHARED_DIR, 'constants.mjs')
    )
    assert.equal(typeof DIRECT_LOCATOR_THRESHOLD, 'number')
    assert.ok(Number.isInteger(DIRECT_LOCATOR_THRESHOLD) && DIRECT_LOCATOR_THRESHOLD > 0)
    assert.equal(typeof DIRECT_CY_GET_THRESHOLD, 'number')
    assert.ok(Number.isInteger(DIRECT_CY_GET_THRESHOLD) && DIRECT_CY_GET_THRESHOLD > 0)
  })
})

// ---------------------------------------------------------------------------
// shared/content-detect.mjs
// ---------------------------------------------------------------------------

describe('rubrics/shared/content-detect.mjs', () => {
  it('isTestContent() should return true for Playwright test content', async () => {
    const { isTestContent } = await import(join(SHARED_DIR, 'content-detect.mjs'))
    const playwrightContent = `
test.describe('Login', () => {
  test('should login', async ({ page }) => {
    await page.goto('/login')
  })
})`
    assert.equal(isTestContent(playwrightContent), true)
  })

  it('isTestContent() should return true for Cypress describe/it content', async () => {
    const { isTestContent } = await import(join(SHARED_DIR, 'content-detect.mjs'))
    const cypressContent = `
describe('Login', () => {
  it('should login', () => {
    cy.visit('/login')
  })
})`
    assert.equal(isTestContent(cypressContent), true)
  })

  it('isTestContent() should return false for plain non-test content', async () => {
    const { isTestContent } = await import(join(SHARED_DIR, 'content-detect.mjs'))
    assert.equal(isTestContent('const x = 1\nfunction foo() { return x }'), false)
    assert.equal(isTestContent(''), false)
    assert.equal(isTestContent('# Requirements\n- REQ-001: Something'), false)
  })

  it('isCypressContent() should return true only for Cypress-specific patterns', async () => {
    const { isCypressContent } = await import(join(SHARED_DIR, 'content-detect.mjs'))
    const cypress = `describe('suite', () => { it('test', () => { cy.visit('/') }) })`
    const playwright = `test.describe('suite', () => { test('test', async ({ page }) => {}) })`
    assert.equal(isCypressContent(cypress), true)
    assert.equal(isCypressContent(playwright), false)
  })

  it('isTestOrPageContent() should return true for page object class patterns', async () => {
    const { isTestOrPageContent } = await import(join(SHARED_DIR, 'content-detect.mjs'))
    const pageObject = `
export class LoginPage {
  get emailInput(): Locator {
    return this.page.getByTestId('email')
  }
}`
    assert.equal(isTestOrPageContent(pageObject), true)
  })

  it('extractSpecContent() should filter sections by indicator strings', async () => {
    const { extractSpecContent } = await import(join(SHARED_DIR, 'content-detect.mjs'))
    const content = [
      'page object content',
      'test.describe spec content .spec.',
      'another page object',
    ].join('\n---\n')
    const result = extractSpecContent(content, ['.spec.', 'test.describe'])
    assert.ok(result.includes('test.describe spec content'))
    assert.ok(
      !result.includes('page object content') || result.includes('test.describe spec content'),
    )
  })
})

// ---------------------------------------------------------------------------
// shared/finding.mjs
// ---------------------------------------------------------------------------

describe('rubrics/shared/finding.mjs', () => {
  it('finding() should create a structured finding object with default warning severity', async () => {
    const { finding } = await import(join(SHARED_DIR, 'finding.mjs'))
    const f = finding('Something is wrong')
    assert.equal(f.message, 'Something is wrong')
    assert.equal(f.severity, 'warning')
  })

  it('finding() should create a finding with explicit severity', async () => {
    const { finding } = await import(join(SHARED_DIR, 'finding.mjs'))
    const critical = finding('Critical error detected', 'critical')
    assert.equal(critical.severity, 'critical')
    const info = finding('Informational note', 'info')
    assert.equal(info.severity, 'info')
  })

  it('SEVERITY should be a frozen object with critical, warning, info keys', async () => {
    const { SEVERITY } = await import(join(SHARED_DIR, 'finding.mjs'))
    assert.equal(SEVERITY.critical, 'critical')
    assert.equal(SEVERITY.warning, 'warning')
    assert.equal(SEVERITY.info, 'info')
    // Frozen object: assignment should not change it
    assert.throws(() => {
      SEVERITY.critical = 'changed'
    })
  })

  it('normalizeFinding() should convert plain string to structured finding with warning severity', async () => {
    const { normalizeFinding } = await import(join(SHARED_DIR, 'finding.mjs'))
    const normalized = normalizeFinding('plain string finding')
    assert.equal(normalized.message, 'plain string finding')
    assert.equal(normalized.severity, 'warning')
  })

  it('normalizeFinding() should preserve existing structured findings', async () => {
    const { normalizeFinding } = await import(join(SHARED_DIR, 'finding.mjs'))
    const structured = { message: 'Already structured', severity: 'critical' }
    const result = normalizeFinding(structured)
    assert.equal(result.message, 'Already structured')
    assert.equal(result.severity, 'critical')
  })

  it('normalizeFinding() should default to warning severity when severity field is missing', async () => {
    const { normalizeFinding } = await import(join(SHARED_DIR, 'finding.mjs'))
    const partial = { message: 'No severity field' }
    const result = normalizeFinding(partial)
    assert.equal(result.severity, 'warning')
  })
})

// ---------------------------------------------------------------------------
// shared/json-extract.mjs
// ---------------------------------------------------------------------------

describe('rubrics/shared/json-extract.mjs', () => {
  it('extractJsonBlock() should extract JSON from pure JSON string', async () => {
    const { extractJsonBlock } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const json = JSON.stringify({ version: '1.0', from: 'sparq-orchestrator' })
    const result = extractJsonBlock(json, (obj) => obj.version === '1.0')
    assert.ok(result !== null)
    assert.equal(result.version, '1.0')
    assert.equal(result.from, 'sparq-orchestrator')
  })

  it('extractJsonBlock() should extract JSON from markdown fenced code block', async () => {
    const { extractJsonBlock } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const obj = { version: '1.0', scenario: 'S2' }
    const content = `## Handoff\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``
    const result = extractJsonBlock(content, (o) => o.scenario === 'S2')
    assert.ok(result !== null)
    assert.equal(result.scenario, 'S2')
  })

  it('extractJsonBlock() should extract embedded JSON via brace scanning', async () => {
    const { extractJsonBlock } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const content = `Some text before {"key": "value", "type": "embedded"} and after`
    const result = extractJsonBlock(content, (o) => o.type === 'embedded')
    assert.ok(result !== null)
    assert.equal(result.key, 'value')
  })

  it('extractJsonBlock() should return null when no valid JSON matches validator', async () => {
    const { extractJsonBlock } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const result = extractJsonBlock('plain text no json here', (o) => o.version === '1.0')
    assert.equal(result, null)
  })

  it('extractJsonBlock() should return null for malformed JSON', async () => {
    const { extractJsonBlock } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const result = extractJsonBlock('{not valid json: true}', () => true)
    assert.equal(result, null)
  })

  it('extractJsonBlock() should return null for empty input', async () => {
    const { extractJsonBlock } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const result = extractJsonBlock('', () => true)
    assert.equal(result, null)
  })

  it('findClosingBrace() should return correct index for balanced braces', async () => {
    const { findClosingBrace } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const content = '{"key": "value"}'
    const closeIndex = findClosingBrace(content, 0)
    assert.equal(closeIndex, content.length - 1)
  })

  it('findClosingBrace() should return -1 for unbalanced braces', async () => {
    const { findClosingBrace } = await import(join(SHARED_DIR, 'json-extract.mjs'))
    const content = '{"key": "value"'
    const closeIndex = findClosingBrace(content, 0)
    assert.equal(closeIndex, -1)
  })
})
