import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// cypress-syntax rubric
// ---------------------------------------------------------------------------

describe('cypress-syntax rubric', () => {
  it('should skip non-test content', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const result = evaluate('module.exports = { baseUrl: "http://localhost:3000" }', [])
    assert.equal(result.skipped, true)
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 0)
  })

  it('should score full core marks for a valid Cypress test', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login')
  cy.get('[data-testid="email"]').type(email)
  cy.get('[data-testid="password"]').type(password)
  cy.get('[data-testid="submit"]').click()
})

describe('Login', () => {
  it('should login successfully', () => {
    cy.intercept('POST', '/api/login').as('loginRequest')
    cy.visit('/login')
    cy.get('[data-testid="email"]').type('user@example.com')
    cy.get('[data-testid="submit"]').click()
    cy.wait('@loginRequest')
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome').should('be.visible')
  })
})`
    const result = evaluate(content, [])
    // All 5 core checks should pass: cy.* commands, Cypress.Commands.add, no addInitScript,
    // no @playwright/test, no await page.*
    assert.equal(
      result.score,
      result.maxScore,
      `Expected full score: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag @playwright/test import as a finding', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `
import { test, expect } from '@playwright/test'

describe('Login', () => {
  it('should login', () => {
    cy.visit('/login')
    cy.get('[data-testid="email"]').type('user@example.com')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('@playwright/test'),
    )
    assert.ok(finding, `Should flag @playwright/test import: ${JSON.stringify(result.findings)}`)
  })

  it('should flag addInitScript as a finding', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `
describe('Auth', () => {
  it('should authenticate', () => {
    cy.visit('/login')
    cy.addInitScript(() => { window.__authToken = 'fake' })
    cy.get('[data-testid="dashboard"]').should('exist')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('addInitScript'),
    )
    assert.ok(finding, `Should flag addInitScript: ${JSON.stringify(result.findings)}`)
  })

  it('should flag await page.* Playwright pattern as a finding', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `
describe('Navigation', () => {
  it('should navigate', async () => {
    await page.goto('/home')
    cy.url().should('include', '/home')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('page'),
    )
    assert.ok(finding, `Should flag await page.* pattern: ${JSON.stringify(result.findings)}`)
  })

  it('should pass describe/it structure check for valid spec', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    // Spec section is identified by describe( — check describe/it and no test.describe
    const content = `
import { support } from '../support/commands'

Cypress.Commands.add('doSomething', () => { cy.visit('/') })

describe('Cart', () => {
  it('should add item to cart', () => {
    cy.intercept('POST', '/api/cart').as('addToCart')
    cy.visit('/shop')
    cy.get('[data-testid="add-to-cart"]').click()
    cy.wait('@addToCart')
    cy.get('[data-testid="cart-count"]').should('contain', '1')
  })
})`
    const result = evaluate(content, [])
    // The spec checks for describe/it and absence of test.describe should both pass
    const findDescribeIt = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('describe()/it()'),
    )
    assert.equal(
      findDescribeIt,
      undefined,
      `Should not flag describe/it: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag missing cy.* commands', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `
Cypress.Commands.add('myCmd', () => {})

describe('Empty', () => {
  it('does nothing', () => {
    // no cy.* commands used
    expect(true).to.equal(true)
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('cy.*'),
    )
    assert.ok(finding, `Should flag missing cy.* commands: ${JSON.stringify(result.findings)}`)
  })

  it('should flag missing Cypress.Commands.add and support/commands reference', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `
describe('Checkout', () => {
  it('should complete checkout', () => {
    cy.visit('/checkout')
    cy.get('[data-testid="pay"]').click()
    cy.url().should('include', '/confirmation')
  })
})`
    const result = evaluate(content, [])
    const finding = result.findings.find((f) =>
      (typeof f === 'string' ? f : f.message).includes('Cypress.Commands.add'),
    )
    assert.ok(
      finding,
      `Should flag missing Cypress.Commands.add: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should accept dynamic pattern checks via checks array', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `
Cypress.Commands.add('login', () => { cy.session('user', () => { cy.visit('/login') }) })

describe('Session', () => {
  it('should persist session', () => {
    cy.intercept('GET', '/api/user').as('getUser')
    cy.visit('/profile')
    cy.wait('@getUser')
    cy.contains('Profile').should('be.visible')
  })
})`
    const checks = [{ has_pattern: 'cy\\.session' }, { no_pattern: 'addInitScript' }]
    const result = evaluate(content, checks)
    assert.ok(result.score <= result.maxScore)
    assert.ok(
      !result.findings.some((f) => (typeof f === 'string' ? f : f.message).includes('cy.session')),
      `Should pass cy.session has_pattern check: ${JSON.stringify(result.findings)}`,
    )
  })

  // -- Framework skip guard tests --

  it('should skip when options.framework is playwright', async () => {
    const evaluate = await loadRubric('cypress-syntax')
    const content = `describe('Login', () => { it('should login', () => { cy.visit('/') }) })`
    const result = evaluate(content, [], { framework: 'playwright' })
    assert.equal(result.skipped, true)
    assert.equal(result.maxScore, 0)
  })
})
