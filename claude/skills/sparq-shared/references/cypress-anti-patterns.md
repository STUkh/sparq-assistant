# Cypress Anti-Patterns Reference

> Cypress-specific. Consumed by sparq-automation-engineer, sparq-test-validator, sparq-cypress-best-practices skill.
> Patterns that cause flakiness, slowness, or maintenance burden.
> For correct patterns, see `cypress-patterns.md`. For shared E2E conventions, see `e2e-common-patterns.md`.

## `cy.wait(milliseconds)`

Arbitrary time waits cause slow, flaky tests. The test either waits too long (slow) or not long enough (flaky).

**Anti-pattern:**
```typescript
cy.get('[data-testid="submit"]').click()
cy.wait(3000)
cy.get('[data-testid="success-toast"]').should('be.visible')
```

**Why it fails:** Network latency varies across environments. A 3s wait passes locally but flakes in CI (slow) or wastes time when the response arrives in 200ms.

**Correct -- intercept alias:**
```typescript
cy.intercept('POST', '/api/submit').as('submitRequest')
cy.get('[data-testid="submit"]').click()
cy.wait('@submitRequest')
cy.get('[data-testid="success-toast"]').should('be.visible')
```

**Correct -- assertion-based retry:**
```typescript
cy.get('[data-testid="submit"]').click()
cy.get('[data-testid="success-toast"]', { timeout: 10000 }).should('be.visible')
```

## Conditional Testing

Branching on runtime DOM state makes tests non-deterministic. Different runs take different paths, masking failures.

**Anti-pattern:**
```typescript
cy.get('body').then($body => {
  if ($body.find('[data-testid="onboarding-modal"]').length) {
    cy.get('[data-testid="dismiss-modal"]').click()
  }
})
cy.get('[data-testid="dashboard"]').should('be.visible')
```

**Why it fails:** The modal may not have rendered yet when the check runs. The `if` branch is a synchronous jQuery check that does not retry -- it races against the DOM. The test passes when the modal happens to be absent, hiding a real bug.

**Correct -- separate tests with explicit preconditions:**
```typescript
describe('Dashboard', () => {
  it('shows dashboard after dismissing onboarding', () => {
    cy.intercept('GET', '/api/user', { fixture: 'user-new.json' })
    cy.visit('/dashboard')
    cy.get('[data-testid="onboarding-modal"]').should('be.visible')
    cy.get('[data-testid="dismiss-modal"]').click()
    cy.get('[data-testid="dashboard"]').should('be.visible')
  })

  it('shows dashboard directly for returning user', () => {
    cy.intercept('GET', '/api/user', { fixture: 'user-returning.json' })
    cy.visit('/dashboard')
    cy.get('[data-testid="dashboard"]').should('be.visible')
  })
})
```

## Shared State Between Tests

Leaking state via module-scoped variables couples tests. Execution order changes or `.only` filters cause silent failures.

**Anti-pattern:**
```typescript
describe('User flow', () => {
  let userId: string

  it('creates a user', () => {
    cy.request('POST', '/api/users', { name: 'Test' }).then(res => {
      userId = res.body.id
    })
  })

  it('fetches the created user', () => {
    cy.request('GET', `/api/users/${userId}`).its('body.name').should('eq', 'Test')
  })
})
```

**Why it fails:** If the first test is skipped or fails, `userId` is `undefined`. Tests must be independently runnable.

**Correct -- setup in `beforeEach`:**
```typescript
describe('User flow', () => {
  beforeEach(() => {
    cy.request('POST', '/api/users', { name: 'Test' }).as('createdUser')
  })

  it('fetches the created user', function () {
    const userId = this.createdUser.body.id
    cy.request('GET', `/api/users/${userId}`).its('body.name').should('eq', 'Test')
  })
})
```

For expensive state like authentication, use `cy.session()` per `cypress-patterns.md` Authentication Pattern.

## `after()`/`afterEach()` for Cleanup

Cleanup hooks do not execute when a test fails mid-run or Cypress refreshes the browser. Dirty state leaks into subsequent tests.

**Anti-pattern:**
```typescript
afterEach(() => {
  cy.request('DELETE', `/api/users/${testUserId}`)
})
```

**Why it fails:** If the test crashes or Cypress reloads, `afterEach` is skipped. The next test inherits stale data.

**Correct -- guaranteed clean state in `beforeEach`:**
```typescript
beforeEach(() => {
  cy.task('db:reset')
  cy.session('admin', () => {
    cy.visit('/login')
    cy.get('[data-testid="username"]').type('admin')
    cy.get('[data-testid="password"]').type('P@ssw0rd123!')
    cy.get('[data-testid="submit"]').click()
    cy.url().should('include', '/dashboard')
  })
})
```

## Tiny Single-Assertion Tests

Visiting the same page in every `it` block multiplies page load time. Ten trivial tests that each visit `/settings` take 10x the navigation cost.

**Anti-pattern:**
```typescript
it('shows heading', () => { settingsPage.visit(); settingsPage.heading.should('be.visible') })
it('shows email field', () => { settingsPage.visit(); settingsPage.emailInput.should('be.visible') })
it('shows save button', () => { settingsPage.visit(); settingsPage.saveButton.should('be.visible') })
```

**Why it is wasteful:** Each `it` restarts the page load. Group related assertions into a single test. Separate tests are for separate user flows, not individual element checks.

**Correct -- grouped assertions:**
```typescript
it('displays the settings form', () => {
  settingsPage.visit()
  settingsPage.heading.should('be.visible')
  settingsPage.emailInput.should('be.visible')
  settingsPage.saveButton.should('be.visible')
})
```

## CSS Class Selectors

Class names are styling concerns, not testing contracts. A CSS refactor, Tailwind migration, or component library update silently breaks every test.

**Anti-pattern:**
```typescript
cy.get('.btn-primary.mt-2').click()
cy.get('.card > .card-body > h3').should('contain', 'Welcome')
```

**Correct -- stable selectors:**
```typescript
cy.get('[data-testid="submit-btn"]').click()
cy.get('[data-testid="welcome-heading"]').should('contain', 'Welcome')
```

If `@testing-library/cypress` is available (check `package.json`), prefer semantic queries:
```typescript
cy.findByRole('button', { name: 'Submit' }).click()
cy.findByRole('heading', { name: /welcome/i }).should('be.visible')
```

## Ignoring Retry-ability

Cypress automatically retries the last command in a chain. Breaking the chain with `.then()` for assertions disables retry-ability.

**Anti-pattern:**
```typescript
cy.get('[data-testid="item-count"]').then($el => {
  expect($el.text()).to.eq('5')
})
```

**Why it fails:** `.then()` runs once synchronously. If the element text is still `4` (loading), the assertion fails immediately with no retry. Cypress only retries commands followed by `.should()`.

**Correct -- retryable assertion:**
```typescript
cy.get('[data-testid="item-count"]').should('have.text', '5')
```

For complex assertions that need `.then()`, chain `.should()` first to ensure the element is ready:
```typescript
cy.get('[data-testid="price"]')
  .should('be.visible')
  .invoke('text')
  .should('match', /^\$\d+\.\d{2}$/)
```

## Mixing async/await

Cypress commands are NOT JavaScript Promises. They enqueue onto an internal command queue. Using `async/await` breaks the queue ordering and causes unpredictable behavior.

**Anti-pattern:**
```typescript
it('loads dashboard', async () => {
  await cy.visit('/dashboard')
  await cy.get('[data-testid="welcome"]').should('be.visible')
})
```

**Why it fails:** `cy.visit()` returns a Chainable, not a Promise. `await` resolves it immediately instead of letting Cypress schedule it. Commands may execute out of order or lose their retry-ability.

**Correct -- natural Cypress chaining:**
```typescript
it('loads dashboard', () => {
  cy.visit('/dashboard')
  cy.get('[data-testid="welcome"]').should('be.visible')
})
```

## Testing Third-Party Services

Hitting real external services (payment gateways, email providers, analytics) makes tests slow, flaky, and expensive. Tests break when the third-party has downtime.

**Anti-pattern:**
```typescript
it('processes payment', () => {
  cy.get('[data-testid="pay-btn"]').click()
  // Hits real Stripe checkout -- slow, costs money, flaky
  cy.get('[data-testid="confirmation"]').should('be.visible')
})
```

**Correct -- stub external dependencies:**
```typescript
it('processes payment', () => {
  cy.intercept('POST', '/api/payments', {
    statusCode: 200,
    body: { id: 'pay_mock_123', status: 'succeeded' },
  }).as('payment')
  cy.get('[data-testid="pay-btn"]').click()
  cy.wait('@payment')
  cy.get('[data-testid="confirmation"]').should('be.visible')
})
```

For error scenarios, stub failure responses:
```typescript
cy.intercept('POST', '/api/payments', {
  statusCode: 402,
  body: { error: 'card_declined' },
}).as('paymentFailed')
```
