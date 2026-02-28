import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const SHARED_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics', 'shared')

async function loadModule() {
  return import(join(SHARED_DIR, 'content-detect.mjs'))
}

// ---------------------------------------------------------------------------
// isTestContent
// ---------------------------------------------------------------------------

describe('isTestContent', () => {
  it('should detect test.describe', async () => {
    const { isTestContent } = await loadModule()
    assert.equal(isTestContent("test.describe('Login', () => {})"), true)
  })

  it('should detect describe()', async () => {
    const { isTestContent } = await loadModule()
    assert.equal(isTestContent("describe('Login', () => {})"), true)
  })

  it("should detect it('", async () => {
    const { isTestContent } = await loadModule()
    assert.equal(isTestContent("it('should work', () => {})"), true)
  })

  it('should return false for plain JavaScript', async () => {
    const { isTestContent } = await loadModule()
    assert.equal(isTestContent('const x = 1\nfunction foo() {}'), false)
  })
})

// ---------------------------------------------------------------------------
// isCypressContent
// ---------------------------------------------------------------------------

describe('isCypressContent', () => {
  it('should detect describe + it without test.describe', async () => {
    const { isCypressContent } = await loadModule()
    assert.equal(
      isCypressContent("describe('Login', () => { it('works', () => { cy.visit('/') }) })"),
      true,
    )
  })

  it('should return false when test.describe is present', async () => {
    const { isCypressContent } = await loadModule()
    assert.equal(isCypressContent("test.describe('Login', () => { it('works', () => {}) })"), false)
  })

  it('should return false for plain JavaScript', async () => {
    const { isCypressContent } = await loadModule()
    assert.equal(isCypressContent('const x = 1\nfunction foo() {}'), false)
  })
})

// ---------------------------------------------------------------------------
// isPlaywrightContent
// ---------------------------------------------------------------------------

describe('isPlaywrightContent', () => {
  it('should detect test.describe as Playwright', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(isPlaywrightContent("test.describe('Login', () => {})"), true)
  })

  it('should detect @playwright/test import', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(isPlaywrightContent("import { test } from '@playwright/test'"), true)
  })

  it('should detect fixtures import', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(isPlaywrightContent("import { test } from '../fixtures'"), true)
  })

  it('should detect get accessor with Locator type', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(
      isPlaywrightContent('get emailInput(): Locator { return this.page.getByTestId("email") }'),
      true,
    )
  })

  it('should detect test.only() as Playwright', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(isPlaywrightContent("test.only('focused test', async ({ page }) => {})"), true)
  })

  it('should detect test.skip() as Playwright', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(isPlaywrightContent("test.skip('skipped test', async ({ page }) => {})"), true)
  })

  it('should return false for Cypress-only content', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(
      isPlaywrightContent("describe('Login', () => { it('works', () => { cy.visit('/') }) })"),
      false,
    )
  })

  it('should return false for plain JavaScript', async () => {
    const { isPlaywrightContent } = await loadModule()
    assert.equal(isPlaywrightContent('const x = 1\nfunction foo() {}'), false)
  })
})

// ---------------------------------------------------------------------------
// isTestOrPageContent
// ---------------------------------------------------------------------------

describe('isTestOrPageContent', () => {
  it('should detect page object classes', async () => {
    const { isTestOrPageContent } = await loadModule()
    assert.equal(isTestOrPageContent('class LoginPage { constructor(page) {} }'), true)
  })

  it('should detect Cypress.Commands.add', async () => {
    const { isTestOrPageContent } = await loadModule()
    assert.equal(isTestOrPageContent("Cypress.Commands.add('login', () => {})"), true)
  })

  it('should return false for plain JavaScript', async () => {
    const { isTestOrPageContent } = await loadModule()
    assert.equal(isTestOrPageContent('const x = 1\nfunction foo() {}'), false)
  })
})

// ---------------------------------------------------------------------------
// detectFrameworkFromContent
// ---------------------------------------------------------------------------

describe('detectFrameworkFromContent', () => {
  it('should return playwright for Playwright-only content', async () => {
    const { detectFrameworkFromContent } = await loadModule()
    const content = `
import { test, expect } from '@playwright/test'
test.describe('Login', () => {
  test('should login', async ({ page }) => {
    await page.goto('/login')
  })
})`
    assert.equal(detectFrameworkFromContent(content), 'playwright')
  })

  it('should return cypress for Cypress-only content', async () => {
    const { detectFrameworkFromContent } = await loadModule()
    const content = `
describe('Login', () => {
  it('should login', () => {
    cy.visit('/login')
    cy.get('[data-testid="email"]').type('user@example.com')
  })
})`
    assert.equal(detectFrameworkFromContent(content), 'cypress')
  })

  it('should return playwright for test.only content', async () => {
    const { detectFrameworkFromContent } = await loadModule()
    const content = `test.only('focused', async ({ page }) => { await page.goto('/') })`
    assert.equal(detectFrameworkFromContent(content), 'playwright')
  })

  it('should return null for non-framework content', async () => {
    const { detectFrameworkFromContent } = await loadModule()
    const content = 'function helper() { return 42 }'
    assert.equal(detectFrameworkFromContent(content), null)
  })

  it('should return null for non-test content', async () => {
    const { detectFrameworkFromContent } = await loadModule()
    assert.equal(detectFrameworkFromContent('const x = 1'), null)
  })

  it('should return null when both frameworks detected (ambiguous)', async () => {
    const { detectFrameworkFromContent } = await loadModule()
    // test.describe makes isPlaywrightContent true
    // describe( + it( makes isCypressContent true... but isCypressContent requires NO test.describe
    // So this actually returns 'playwright'. Use a scenario that triggers both:
    // isPlaywrightContent: test.only( → true
    // isCypressContent: requires describe() or it() AND no test.describe
    // Since test.only triggers isPlaywrightContent AND test.describe is absent,
    // isCypressContent could still be true if describe() is present
    const content = `
test.only('focused', async ({ page }) => {})
describe('Cypress suite', () => { it('works', () => { cy.visit('/') }) })`
    // test.only → isPlaywrightContent = true
    // describe + it + no test.describe... but test.only doesn't contain 'test.describe'
    // However isCypressContent checks !content.includes('test.describe') which is true here
    // So both are true → returns null
    const result = detectFrameworkFromContent(content)
    // isPlaywrightContent: test.only( → true
    // isCypressContent: describe( + it( + no 'test.describe' → true
    // Both true → null
    assert.equal(result, null, 'Should return null when both frameworks detected')
  })
})
