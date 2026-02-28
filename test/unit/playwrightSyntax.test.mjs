import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// playwright-syntax rubric
// ---------------------------------------------------------------------------

describe('playwright-syntax rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `test.describe('X', () => { test('y', async ({ page }) => {}) })`
    const result = evaluate(content, [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should skip non-test content', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const result = evaluate('const config = { baseURL: "http://localhost" }', [])
    assert.equal(result.skipped, true)
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 0)
  })

  it('should score full marks for a valid Playwright page object with get accessors', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    // A page object with get accessors — isTestContent triggered via test.describe
    const content = `
import { type Locator, type Page } from '@playwright/test'

export class LoginPage {
  constructor(private readonly page: Page) {}

  get emailInput(): Locator {
    return this.page.getByTestId('email')
  }

  get submitButton(): Locator {
    return this.page.getByTestId('submit')
  }
}

test.describe('Login', () => {
  test('should login successfully', async ({ loginPage }) => {
    await loginPage.emailInput.fill('user@example.com')
    await loginPage.submitButton.click()
    await expect(loginPage.page).toHaveURL('/dashboard')
  })
})`
    const result = evaluate(content, [])
    // get accessors present, no readonly assignments — 2 base checks pass
    assert.ok(
      result.score >= 2,
      `Expected score >= 2, got ${result.score}: ${JSON.stringify(result.findings)}`,
    )
    assert.ok(result.score <= result.maxScore)
  })

  it('should flag missing get accessor locators', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `
test.describe('Login', () => {
  test('should fill form', async ({ page }) => {
    await page.getByTestId('email').fill('user@example.com')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/dashboard')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('get accessor'),
    )
    assert.ok(finding, `Should flag missing get accessors: ${JSON.stringify(result.findings)}`)
  })

  it('should flag readonly locator assignment instead of get accessor', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `
export class LoginPage {
  readonly emailInput = this.page.getByTestId('email')
  readonly submitButton = this.page.locator('#submit')

  constructor(private readonly page: Page) {}
}

test.describe('Login', () => {
  test('should log in', async ({ loginPage }) => {
    await loginPage.emailInput.fill('user@example.com')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('readonly locator'),
    )
    assert.ok(
      finding,
      `Should flag readonly locator assignment: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag direct @playwright/test import in spec sections', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    // The spec section is identified by test.describe — import check applies to spec content
    const content = `
import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test('should login', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/login')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('@playwright/test'),
    )
    assert.ok(
      finding,
      `Should flag @playwright/test import in spec: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag missing fixture barrel import in spec sections', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    // Spec section with test.describe but no ../*/fixtures import
    const content = `
import { test, expect } from '../support/helpers'

test.describe('Checkout', () => {
  test('should place order', async ({ page }) => {
    await page.goto('/checkout')
    await expect(page.getByText('Order')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('fixtures'),
    )
    assert.ok(
      finding,
      `Should flag missing fixture barrel import: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass fixture barrel import check when spec imports from fixtures index', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `
import { test, expect } from '../fixtures'

test.describe('Checkout', () => {
  test('should place order', async ({ checkoutPage }) => {
    await checkoutPage.placeOrder()
    await expect(checkoutPage.confirmation).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('fixtures'),
    )
    assert.equal(
      finding,
      undefined,
      `Should not flag fixtures import: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- POM delegation tests --

  it('should pass get-accessor check when spec imports page objects', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    // Spec file: imports from pages, no get accessors defined (they're in page objects)
    const content = `
import { test, expect } from '../fixtures'
import { LoginPage } from '../pages'

test.describe('Login', () => {
  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('user@test.com', 'password')
    await expect(page).toHaveURL('/dashboard')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('get accessor'),
    )
    assert.equal(
      finding,
      undefined,
      `Should not flag get accessors when page objects imported: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should still flag specs with no page object import and no get accessors', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    // Spec file with inline locators — no POM, no get accessors
    const content = `
import { test, expect } from '../fixtures'

test.describe('Login', () => {
  test('should fill form', async ({ page }) => {
    await page.getByTestId('email').fill('user@example.com')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/dashboard')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('get accessor'),
    )
    assert.ok(
      finding,
      `Should flag missing get accessors without POM: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- Fixture-injected page object tests --

  it('should pass get-accessor check when spec uses fixture-injected page objects', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `
import { test, expect } from '../fixtures'

test.describe('Login', () => {
  test('should login successfully', async ({ loginPage }) => {
    await loginPage.goto()
    await loginPage.fillEmail('user@test.com')
    await loginPage.submit()
    await expect(loginPage.successMessage).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('get accessor'),
    )
    assert.equal(
      finding,
      undefined,
      `Should not flag when fixture page objects used: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- Framework skip guard tests --

  it('should skip when options.framework is cypress', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `test.describe('Login', () => { test('a', async ({ page }) => {}) })`
    const result = evaluate(content, [], { framework: 'cypress' })
    assert.equal(result.skipped, true)
    assert.equal(result.maxScore, 0)
  })

  it('should NOT skip when options.framework is playwright', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    const content = `test.describe('Login', () => { test('a', async ({ page }) => {}) })`
    const result = evaluate(content, [], { framework: 'playwright' })
    assert.ok(!result.skipped, 'Should not skip for Playwright framework')
    assert.ok(result.maxScore > 0, 'maxScore should be > 0')
  })

  it('should auto-detect Cypress content and skip (no config)', async () => {
    const evaluate = await loadRubric('playwright-syntax')
    // Pure Cypress content — no test.describe, no @playwright/test imports
    const content = `
describe('Cart', () => {
  it('should add item', () => {
    cy.visit('/shop')
    cy.get('[data-testid="add"]').click()
    cy.get('[data-testid="count"]').should('have.text', '1')
  })
})`
    const result = evaluate(content, [], {})
    assert.equal(result.skipped, true, 'Should auto-skip pure Cypress content')
    assert.equal(result.maxScore, 0)
  })
})
