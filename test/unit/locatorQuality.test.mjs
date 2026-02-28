import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// locator-quality rubric
// ---------------------------------------------------------------------------

describe('locator-quality rubric', () => {
  it('should score 4/4 for perfect Playwright selectors', async () => {
    const evaluate = await loadRubric('locator-quality')
    const content = `
test.describe('Login', () => {
  test('should login successfully', async ({ page }) => {
    await page.getByTestId('email-input').fill('alice@example.com')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText('Welcome')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.maxScore, 4, 'maxScore should be 4')
    assert.equal(result.score, 4, `Expected 4/4, findings: ${JSON.stringify(result.findings)}`)
  })

  it('should flag when neither data-testid nor semantic locators present', async () => {
    const evaluate = await loadRubric('locator-quality')
    const content = `
test.describe('Login', () => {
  test('should login', async ({ page }) => {
    await page.locator('.email-input').fill('a@b.com')
    await page.locator('#submit-btn').click()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.message.includes('No quality locators')),
      `Should flag neither present: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should catch fragile CSS class selectors', async () => {
    const evaluate = await loadRubric('locator-quality')
    const content = `
test.describe('Login', () => {
  test('should login', async ({ page }) => {
    await page.locator('.login-form').fill('a@b.com')
    await page.locator('#submit-btn').click()
    await expect(page.getByTestId('welcome')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.message.includes('fragile CSS')),
      `Should catch fragile CSS: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should catch Cypress fragile CSS selectors', async () => {
    const evaluate = await loadRubric('locator-quality')
    const content = `
describe('Login', () => {
  it('should login', () => {
    cy.get('.login-form').type('a@b.com')
    cy.get('#submit-btn').click()
    cy.get('[data-testid="welcome"]').should('be.visible')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.message.includes('fragile CSS')),
      `Should catch Cypress fragile CSS: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should catch XPath selectors', async () => {
    const evaluate = await loadRubric('locator-quality')
    const content = `
test.describe('Login', () => {
  test('should find element', async ({ page }) => {
    await page.locator('xpath=//div[@class="form"]').click()
    await expect(page.getByTestId('result')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.message.includes('XPath')),
      `Should catch XPath: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should catch positional selectors', async () => {
    const evaluate = await loadRubric('locator-quality')
    const content = `
test.describe('List', () => {
  test('should select first item', async ({ page }) => {
    await page.getByTestId('list').first().click()
    await page.getByTestId('items').nth(2).click()
    await expect(page.getByTestId('result')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.message.includes('Positional')),
      `Should catch positional selectors: ${JSON.stringify(result.findings)}`,
    )
  })
})
