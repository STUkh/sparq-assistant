import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// flaky-test-detection rubric
// ---------------------------------------------------------------------------

describe('flaky-test-detection rubric', () => {
  it('should skip for non-test content', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const result = evaluate('const x = 1\nfunction foo() {}', [])
    assert.equal(result.skipped, true)
    assert.equal(result.maxScore, 0)
  })

  it('should score 5/5 for clean Playwright test', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
test.describe('Login', () => {
  test('should login', async ({ page }) => {
    await page.goto('/login')
    await page.waitForSelector('[data-testid="email"]')
    await page.getByTestId('email').fill('alice@example.com')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText('Welcome')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 5, `Expected 5/5, findings: ${JSON.stringify(result.findings)}`)
    assert.equal(result.maxScore, 5)
  })

  it('should score 5/5 for clean Cypress test', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
describe('Login', () => {
  it('should login', () => {
    cy.intercept('POST', '/api/login').as('loginRequest')
    cy.visit('/login')
    cy.get('[data-testid="email"]').type('alice@example.com')
    cy.get('[data-testid="submit"]').click()
    cy.wait('@loginRequest')
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome').should('be.visible')
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 5, `Expected 5/5, findings: ${JSON.stringify(result.findings)}`)
  })

  it('should catch waitForTimeout as critical', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
test.describe('Slow page', () => {
  test('should wait for load', async ({ page }) => {
    await page.goto('/slow')
    await page.waitForTimeout(5000)
    await page.waitForSelector('[data-testid="content"]')
    await expect(page.getByText('Loaded')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.message?.includes('Arbitrary waits'))
    assert.ok(finding, `Should catch waitForTimeout: ${JSON.stringify(result.findings)}`)
    assert.equal(finding.severity, 'critical')
  })

  it('should catch cy.wait(number) as critical', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
describe('Slow page', () => {
  it('should wait for load', () => {
    cy.visit('/slow')
    cy.wait(2000)
    cy.get('[data-testid="content"]').should('be.visible')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) => f.message?.includes('Arbitrary waits'))
    assert.ok(finding, `Should catch cy.wait(number): ${JSON.stringify(result.findings)}`)
    assert.equal(finding.severity, 'critical')
  })

  it('should NOT flag cy.wait with named alias', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
describe('API flow', () => {
  it('should wait for API response', () => {
    cy.intercept('GET', '/api/data').as('getData')
    cy.visit('/page')
    cy.wait('@getData')
    cy.get('[data-testid="data"]').should('exist')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => f.message?.includes('Arbitrary waits')),
      `Should not flag named alias cy.wait: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should catch hardcoded delays (sleep/delay patterns)', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
test.describe('Animation', () => {
  test('should wait for animation', async ({ page }) => {
    await page.goto('/animated')
    await new Promise(r => setTimeout(r, 1000))
    await page.waitForSelector('[data-testid="result"]')
    await expect(page.getByText('Done')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.message?.includes('Hardcoded delay')),
      `Should catch Promise+setTimeout: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should detect shared mutable state', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
let counter = 0

test.describe('Counter', () => {
  test('should increment', async ({ page }) => {
    counter = counter + 1
    await page.goto('/page')
    await page.waitForSelector('[data-testid="count"]')
    await expect(page.getByTestId('count')).toHaveText(String(counter))
  })

  test('should reset', async ({ page }) => {
    counter = 0
    await page.goto('/page')
    await page.waitForSelector('[data-testid="count"]')
    await expect(page.getByTestId('count')).toHaveText('0')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => f.message?.includes('Shared mutable state')),
      `Should flag shared mutable state: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should return structured findings with severity', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
test.describe('Flaky', () => {
  test('should be flaky', async ({ page }) => {
    await page.goto('/page')
    await page.waitForTimeout(3000)
  })
})`
    const result = evaluate(content, [])
    const structured = result.findings.filter((f) => typeof f === 'object' && f.severity)
    assert.ok(structured.length > 0, 'Should return structured findings with severity')
  })

  // -- Auto-retrying assertion recognition --

  it('should recognize Playwright auto-retrying assertions as proper wait strategies', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
test.describe('Dashboard', () => {
  test('should load', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText('Welcome')).toBeVisible()
    await expect(page.getByTestId('count')).toHaveText('5')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => f.message?.includes('No proper wait strategies')),
      `Auto-retrying assertions should count as wait strategies: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should recognize .should() as Cypress implicit wait strategy', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
describe('Cart', () => {
  it('should add items', () => {
    cy.visit('/cart')
    cy.get('[data-testid="item"]').should('be.visible')
    cy.get('[data-testid="count"]').should('have.text', '1')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => f.message?.includes('No proper wait strategies')),
      `.should() should count as Cypress wait strategy: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- Timing-dependent assertion awareness --

  it('should NOT flag auto-retrying assertion after navigation', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
test.describe('Navigation', () => {
  test('should navigate', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard')
    await page.waitForSelector('[data-testid="content"]')
    await expect(page.getByText('Welcome')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => f.message?.includes('immediately after navigation')),
      `Auto-retry after goto should not be flagged: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- Hook exclusion for shared mutable state --

  it('should NOT flag beforeEach hook setup as shared mutable state', async () => {
    const evaluate = await loadRubric('flaky-test-detection')
    const content = `
let page

test.describe('Login', () => {
  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage()
  })

  test('should login', async () => {
    await page.goto('/login')
    await page.waitForSelector('[data-testid="email"]')
    await expect(page.getByTestId('email')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => f.message?.includes('Shared mutable state')),
      `beforeEach setup should not be flagged: ${JSON.stringify(result.findings)}`,
    )
  })
})
