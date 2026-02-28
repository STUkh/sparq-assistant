// test/unit/executabilityCheck.test.mjs — Unit tests for executability-check rubric

import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric() {
  const { evaluate } = await import(join(RUBRICS_DIR, 'executability-check.mjs'))
  return evaluate
}

// ---------------------------------------------------------------------------
// Skipped scenarios
// ---------------------------------------------------------------------------

describe('executability-check — skipped scenarios', () => {
  it('should skip non-test content (no test/describe blocks)', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('Some markdown content without any test blocks')
    assert.equal(result.skipped, true)
    assert.equal(result.score, 0)
    assert.equal(result.maxScore, 0)
    assert.ok(Array.isArray(result.findings))
  })

  it('should skip a plain markdown requirements doc', async () => {
    const evaluate = await loadRubric()
    const result = evaluate('# Requirements\nREQ-AUTH-001 User can log in\nREQ-AUTH-002 Logout')
    assert.equal(result.skipped, true)
  })
})

// ---------------------------------------------------------------------------
// Interface shape
// ---------------------------------------------------------------------------

describe('executability-check — interface shape', () => {
  it('should return score, maxScore=4, and findings for test content', async () => {
    const evaluate = await loadRubric()
    const content = `
test.describe('Auth', () => {
  test('login', async ({ page }) => {
    await page.goto('/')
  })
})`
    const result = evaluate(content, [], {})
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
    assert.ok(Array.isArray(result.findings))
    assert.equal(result.maxScore, 4)
  })

  it('should return score >= 0 and <= maxScore', async () => {
    const evaluate = await loadRubric()
    const content = `test.describe('X', () => { test('y', async () => {}) })`
    const result = evaluate(content, [], {})
    assert.ok(result.score >= 0)
    assert.ok(result.score <= result.maxScore)
  })
})

// ---------------------------------------------------------------------------
// Import consistency check
// ---------------------------------------------------------------------------

describe('executability-check — import consistency', () => {
  it('should pass when using project fixture index instead of @playwright/test', async () => {
    const evaluate = await loadRubric()
    const content = `
import { test, expect } from '../fixtures'
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
    await page.goto('/login')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('@playwright/test')))
  })

  it('should flag direct @playwright/test import', async () => {
    const evaluate = await loadRubric()
    const content = `
import { test, expect } from '@playwright/test'
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
    await page.goto('/login')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('@playwright/test')),
      `Should flag @playwright/test import, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag suspicious absolute import paths', async () => {
    const evaluate = await loadRubric()
    const content = `
import { test } from '/etc/absolute/path'
test.describe('X', () => {
  test('y', async ({ page }) => { await page.goto('/') })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('absolute import path') || m.includes('/etc/absolute/path')),
      `Should flag absolute path, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass when there are no import statements', async () => {
    const evaluate = await loadRubric()
    const content = `
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
    await page.goto('/login')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('@playwright/test') || m.includes('import')))
  })
})

// ---------------------------------------------------------------------------
// Async/await check
// ---------------------------------------------------------------------------

describe('executability-check — async/await', () => {
  it('should pass for properly async Playwright tests', async () => {
    const evaluate = await loadRubric()
    const content = `
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
    await page.goto('/login')
    await page.click('#submit')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('async')))
  })

  it('should flag Playwright test that uses async ops without async keyword', async () => {
    const evaluate = await loadRubric()
    const content = `
test.describe('Login', () => {
  test('bad test', ({ page }) => {
    page.goto('/login')
    page.click('#submit')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('async')),
      `Should flag missing async, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should skip async check for Cypress content (chainable, not async)', async () => {
    const evaluate = await loadRubric()
    const content = `
describe('Login', () => {
  it('happy path', () => {
    cy.visit('/login')
    cy.get('#submit').click()
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('async')))
  })
})

// ---------------------------------------------------------------------------
// Test nesting check
// ---------------------------------------------------------------------------

describe('executability-check — test nesting', () => {
  it('should pass when tests are wrapped in describe block (Playwright)', async () => {
    const evaluate = await loadRubric()
    const content = `
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
    await page.goto('/login')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('describe') || m.includes('nesting')))
  })

  it('should pass when tests are wrapped in describe block (Cypress)', async () => {
    const evaluate = await loadRubric()
    const content = `
describe('Login', () => {
  it('happy path', () => {
    cy.visit('/login')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('describe') || m.includes('nesting')))
  })

  it('should fail when tests are not wrapped in describe', async () => {
    const evaluate = await loadRubric()
    const content = `
test('loose test', async ({ page }) => {
  await page.goto('/login')
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('describe')),
      `Should flag missing describe, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should fail when no test blocks found at all', async () => {
    const evaluate = await loadRubric()
    // Has test.describe but no test() inside — counts as test content but no tests
    const content = `test.describe('Empty suite', () => {})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('No test') || m.includes('test()')),
      `Should flag no tests found, findings: ${JSON.stringify(result.findings)}`,
    )
  })
})

// ---------------------------------------------------------------------------
// Page object usage check
// ---------------------------------------------------------------------------

describe('executability-check — page object usage', () => {
  it('should pass when page objects are instantiated correctly', async () => {
    const evaluate = await loadRubric()
    const content = `
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(!msgs.some((m) => m.includes('page parameter') || m.includes('page.locator')))
  })

  it('should flag page object instantiated without page parameter', async () => {
    const evaluate = await loadRubric()
    const content = `
test.describe('Login', () => {
  test('bad test', async ({ page }) => {
    const lp = new LoginPage()
    await page.goto('/login')
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('page parameter') || m.includes('LoginPage()')),
      `Should flag bad instantiation, findings: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should flag excessive direct page.locator calls without page objects', async () => {
    const evaluate = await loadRubric()
    // 6 direct locator calls, no page objects
    const locatorCalls = Array.from(
      { length: 6 },
      (_, i) => `  const el${i} = page.locator('#el${i}')`,
    ).join('\n')
    const content = `
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
${locatorCalls}
    await el0.click()
  })
})`
    const result = evaluate(content, [], {})
    const msgs = result.findings.map((f) => (typeof f === 'string' ? f : (f.message ?? f)))
    assert.ok(
      msgs.some((m) => m.includes('page.locator')),
      `Should flag excessive locators, findings: ${JSON.stringify(result.findings)}`,
    )
  })
})

// ---------------------------------------------------------------------------
// Score range
// ---------------------------------------------------------------------------

describe('executability-check — score range', () => {
  it('should score 4/4 for a fully compliant Playwright spec', async () => {
    const evaluate = await loadRubric()
    const content = `
import { test, expect } from '../fixtures'
test.describe('Login', () => {
  test('happy path', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.fillCredentials('user', 'pass')
    await loginPage.submit()
  })
})`
    const result = evaluate(content, [], {})
    assert.equal(result.maxScore, 4)
    assert.equal(result.score, 4)
  })

  it('should score 4/4 for a fully compliant Cypress spec', async () => {
    const evaluate = await loadRubric()
    const content = `
import { LoginPage } from '../support/pages/LoginPage'
describe('Login', () => {
  it('happy path', () => {
    const lp = new LoginPage(cy)
    lp.visit()
    lp.fillCredentials('user', 'pass')
    lp.submit()
  })
})`
    const result = evaluate(content, [], {})
    assert.equal(result.maxScore, 4)
    assert.equal(result.score, 4)
  })
})
