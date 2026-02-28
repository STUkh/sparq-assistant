import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// assertion-detection rubric
// ---------------------------------------------------------------------------

describe('assertion-detection rubric', () => {
  it('should skip for non-test content', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const result = evaluate('const x = 1\nfunction helper() { return true }', [])
    assert.equal(result.skipped, true)
    assert.equal(result.maxScore, 0)
    assert.equal(result.score, 0)
  })

  it('should score 3/3 for Playwright test with good assertion density', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('Login', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('email').fill('user@example.com')
    await page.getByTestId('password').fill('secret')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText('Welcome')).toBeVisible()
    await expect(page.getByTestId('profile')).toBeVisible()
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 3, `Expected 3/3, findings: ${JSON.stringify(result.findings)}`)
    assert.equal(result.maxScore, 3)
  })

  it('should produce a warning finding for low assertion density in Playwright test', async () => {
    const evaluate = await loadRubric('assertion-detection')
    // 1 assertion for 10 actions — well below 30%
    const content = `
test.describe('Form', () => {
  test('should fill form', async ({ page }) => {
    await page.goto('/form')
    await page.getByTestId('f1').fill('a')
    await page.getByTestId('f2').fill('b')
    await page.getByTestId('f3').fill('c')
    await page.getByTestId('f4').fill('d')
    await page.getByTestId('f5').fill('e')
    await page.getByTestId('f6').fill('f')
    await page.getByTestId('f7').fill('g')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/done')
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? f)
        return /density/i.test(msg) || /assertion/i.test(msg)
      }),
      `Should flag low assertion density: ${JSON.stringify(result.findings)}`,
    )
    assert.ok(result.score < 3)
  })

  it('should produce a finding when test has no assertions at all', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('Navigation', () => {
  test('should navigate to page', async ({ page }) => {
    await page.goto('/page')
    await page.getByTestId('link').click()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? f)
        return /no assertions/i.test(msg) || /never verif/i.test(msg)
      }),
      `Should flag missing assertions: ${JSON.stringify(result.findings)}`,
    )
    assert.ok(result.score < 3)
  })

  it('should count Playwright expect() calls correctly', async () => {
    const evaluate = await loadRubric('assertion-detection')
    // 3 expects for 3 actions = 100% density — all 3 checks pass
    const content = `
test.describe('Counter', () => {
  test('should count', async ({ page }) => {
    await page.goto('/counter')
    await page.getByTestId('btn').click()
    await page.getByTestId('btn').click()
    await expect(page.getByTestId('count')).toHaveText('2')
    await expect(page.getByTestId('btn')).toBeEnabled()
    await expect(page).toHaveURL('/counter')
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 3, `Playwright expect() scoring: ${JSON.stringify(result.findings)}`)
  })

  it('should count Cypress .should() assertions correctly', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
describe('Cart', () => {
  it('should add item to cart', () => {
    cy.visit('/shop')
    cy.get('[data-testid="add"]').click()
    cy.get('[data-testid="cart-count"]').should('have.text', '1')
    cy.get('[data-testid="cart"]').should('be.visible')
  })
})`
    const result = evaluate(content, [])
    assert.equal(result.score, 3, `Cypress .should() scoring: ${JSON.stringify(result.findings)}`)
  })

  it('should produce a finding when a test block has no assertions', async () => {
    const evaluate = await loadRubric('assertion-detection')
    // Second test block has no assertion
    const content = `
test.describe('Multi', () => {
  test('has assertion', async ({ page }) => {
    await page.goto('/a')
    await expect(page).toHaveURL('/a')
  })
  test('missing assertion', async ({ page }) => {
    await page.goto('/b')
    await page.getByTestId('btn').click()
  })
})`
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? f)
        return /test.*without assertion/i.test(msg) || /without assertion/i.test(msg)
      }),
      `Should flag test block without assertion: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score 3/3 for clean Cypress test with good density', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
describe('Checkout', () => {
  it('should complete checkout', () => {
    cy.visit('/checkout')
    cy.get('[data-testid="address"]').type('123 Main St')
    cy.get('[data-testid="submit"]').click()
    cy.get('[data-testid="confirmation"]').should('be.visible')
    cy.url().should('include', '/confirmation')
  })
})`
    const result = evaluate(content, [])
    assert.equal(
      result.score,
      3,
      `Expected 3/3 for Cypress test: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- Assertion delegation detection tests --

  it('should score 3/3 for page object delegation (verifyLoggedIn)', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('Login', () => {
  test('should login and verify', async ({ loginPage }) => {
    await loginPage.goto('/login')
    await loginPage.fillEmail('user@example.com')
    await loginPage.fillPassword('secret')
    await loginPage.submit()
    await loginPage.verifyLoggedIn()
    await loginPage.verifyDashboardVisible()
  })
})`
    const result = evaluate(content, [])
    assert.equal(
      result.score,
      3,
      `Expected 3/3 with delegation, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score 3/3 for standalone delegation (assertDashboardLoaded)', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('Dashboard', () => {
  test('should load dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await assertDashboardLoaded(page)
    await validateUserProfile(page)
  })
})`
    const result = evaluate(content, [])
    assert.equal(
      result.score,
      3,
      `Expected 3/3 with standalone delegation, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score 3/3 for Cypress delegation (verifyRedirectToDashboard)', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
describe('Login', () => {
  it('should login and verify redirect', () => {
    cy.visit('/login')
    cy.get('[data-testid="email"]').type('user@example.com')
    cy.get('[data-testid="submit"]').click()
    verifyRedirectToDashboard()
    verifyNavbarVisible()
  })
})`
    const result = evaluate(content, [])
    assert.equal(
      result.score,
      3,
      `Expected 3/3 with Cypress delegation, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should NOT count checkout() as assertion delegation', async () => {
    const evaluate = await loadRubric('assertion-detection')
    const content = `
test.describe('Cart', () => {
  test('should checkout without assertions', async ({ page }) => {
    await page.goto('/cart')
    await page.checkout()
    await page.getByTestId('item').click()
  })
})`
    const result = evaluate(content, [])
    // checkout() does NOT match check[A-Z] pattern — lowercase 'o' after 'check'
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? f)
        return /no assertions/i.test(msg) || /without assertion/i.test(msg)
      }),
      `checkout() should not count as delegation: ${JSON.stringify(result.findings)}`,
    )
  })
})
