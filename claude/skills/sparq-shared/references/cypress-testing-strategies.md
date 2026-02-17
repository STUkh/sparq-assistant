# Cypress Testing Strategies Reference

> Cypress-specific. Consumed by sparq-automation-engineer, sparq-cypress-best-practices skill.
> Extends `cypress-patterns.md` with advanced enterprise patterns.
> Load `cypress-patterns.md` first for base patterns (BasePage, Page Objects, Components, Steps, Custom Commands, Authentication, Intercept, Assertions, Specs).

## Test Isolation

Cypress 12+ defaults to `testIsolation: true` -- each `it()` starts with a clean browser state.
- Never share mutable state between `it()` blocks via `before()` or module-level variables
- Use `beforeEach()` for per-test setup -- never `before()` for state that tests depend on
- Isolation verification: change any `it()` to `it.only()` -- it must pass alone
- Use `cy.session()` to cache expensive setup across tests without breaking isolation
- Opt out per-suite only when justified: `describe('legacy', { testIsolation: false }, () => { ... })`
- Server-side state reset: `beforeEach(() => { cy.request('POST', '/api/test/reset-db') })`

## Advanced Authentication Patterns

Beyond basic `cy.session()` in `cypress-patterns.md`. For API auth, SSO, and multi-user flows.

### API-Based Login with Validation
```typescript
Cypress.Commands.add('loginViaApi', (username: string) => {
  cy.session(username, () => {
    cy.request('POST', '/api/auth/login', {
      username, password: Cypress.env('DEFAULT_PASSWORD'),
    }).then(({ body }) => {
      window.localStorage.setItem('access_token', body.accessToken)
      window.localStorage.setItem('refresh_token', body.refreshToken)
    })
  }, {
    validate() {
      cy.request({
        url: '/api/auth/me',
        headers: { Authorization: `Bearer ${window.localStorage.getItem('access_token')}` },
      }).its('status').should('eq', 200)
    },
    cacheAcrossSpecs: true,
  })
})
```

### Token Injection

Set tokens directly for apps that read auth from localStorage on mount:
```typescript
cy.session('injected-admin', () => {
  window.localStorage.setItem('auth', JSON.stringify({
    token: Cypress.env('ADMIN_JWT'), role: 'admin', expiresAt: Date.now() + 3600000,
  }))
})
```

### SSO / Cross-Origin (Cypress 12+)

`cy.origin()` handles cross-origin SSO redirects:
```typescript
cy.session('sso-user', () => {
  cy.visit('/login')
  cy.get('[data-testid="sso-login"]').click()
  cy.origin('https://idp.example.com', () => {
    cy.get('#username').type('sso-user@example.com')
    cy.get('#password').type('P@ssw0rd123!')
    cy.get('#submit').click()
  })
})
```

### Session Switching Between Users

```typescript
it('admin sees user submission', () => {
  cy.loginViaApi('standard-user')
  cy.visit('/forms/new')
  cy.get('[data-testid="title"]').type('Budget Request')
  cy.get('[data-testid="submit"]').click()
  cy.loginViaApi('admin-user')
  cy.visit('/admin/submissions')
  cy.contains('Budget Request').should('be.visible')
})
```
- `cacheAcrossSpecs: true` reuses sessions across spec files
- Each `cy.session(id)` with a unique ID maintains a separate cached session

## Advanced cy.intercept() Patterns

Beyond basic intercept/spy in `cypress-patterns.md`. For GraphQL, conditional mocking, and sequence testing.

### GraphQL Operation-Name Matching
```typescript
function interceptGql(operationName: string, fixture: string) {
  cy.intercept('POST', '/graphql', (req) => {
    if (req.body.operationName === operationName) req.reply({ fixture })
  }).as(`gql:${operationName}`)
}
interceptGql('GetUsers', 'gql/get-users.json')
cy.visit('/users')
cy.wait('@gql:GetUsers')
```

### Conditional Response and Request Modification
```typescript
cy.intercept('POST', '/api/search', (req) => {
  req.reply({ fixture: req.body.query.includes('admin')
    ? 'search-admin-results.json' : 'search-default-results.json' })
}).as('search')
// Inject headers before request reaches server
cy.intercept('GET', '/api/**', (req) => {
  req.headers['x-test-mode'] = 'true'
  req.continue()
})
```

### Response Delay and Sequence Responses
```typescript
// Delay for loading state tests -- use delay option
cy.intercept('GET', '/api/dashboard', (req) => {
  req.reply({ fixture: 'dashboard.json', delay: 2000 })
}).as('slowDashboard')
// Sequence: first call success, second call error
let callCount = 0
cy.intercept('POST', '/api/save', (req) => {
  callCount += 1
  req.reply(callCount === 1
    ? { statusCode: 200, body: { id: 1 } }
    : { statusCode: 503, body: { error: 'Service Unavailable' } })
}).as('save')
```

### Request and Response Assertions
```typescript
cy.wait('@save').then(({ request, response }) => {
  expect(request.body).to.have.property('title', 'Budget Request')
  expect(response?.statusCode).to.equal(200)
  expect(response?.body.id).to.be.a('number')
})
```

## Advanced Assertion Patterns

Beyond `.should('be.visible')` and chained assertions in `cypress-patterns.md`.

### Callback and Custom Chai Assertions
```typescript
// Callback -- use when a single .should() string is insufficient
cy.get('[data-testid="user-row"]').should(($rows) => {
  expect($rows).to.have.length(3)
  expect($rows.first()).to.contain('Alice')
  expect($rows.last()).to.contain('Charlie')
})

// Custom Chai assertion -- register in support/assertions.ts
chai.Assertion.addMethod('validEmail', function () {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  this.assert(regex.test(this._obj),
    'expected #{this} to be a valid email', 'expected #{this} to not be a valid email')
})
// Usage: cy.get('[data-testid="email"]').invoke('val').should('be.a.validEmail')
```

### Asserting on Intercepted Data
```typescript
cy.wait('@createUser').its('request.body').should('deep.include', { firstName: 'Jane' })
cy.wait('@createUser').its('response.body.id').should('be.greaterThan', 0)
```

### Timeout Overrides

- Lengthen for slow elements: `cy.get('[data-testid="report"]', { timeout: 15000 }).should('be.visible')`
- Synchronous check (no retry): `cy.get('.element', { timeout: 0 }).should('not.exist')`
- If many tests need longer timeouts, increase `defaultCommandTimeout` in config instead

## Advanced Custom Commands

Beyond `Cypress.Commands.add` basics in `cypress-patterns.md`.

### Child Command with prevSubject
```typescript
Cypress.Commands.add('shouldBeWithinViewport', { prevSubject: 'element' },
  (subject: JQuery<HTMLElement>) => {
    const rect = subject[0].getBoundingClientRect()
    expect(rect.top).to.be.greaterThan(0)
    expect(rect.bottom).to.be.lessThan(Cypress.config('viewportHeight'))
    expect(rect.left).to.be.greaterThan(0)
    expect(rect.right).to.be.lessThan(Cypress.config('viewportWidth'))
    return cy.wrap(subject)
  })
```

### Overwriting Built-In Commands and Type Augmentation
```typescript
Cypress.Commands.overwrite('visit', (originalFn, url, options) => {
  return originalFn(url, { ...options, failOnStatusCode: false }).then(() => {
    cy.get('[data-testid="app-loaded"]', { timeout: 10000 }).should('exist')
  })
})
// cypress/support/index.d.ts -- augment for all custom commands
declare namespace Cypress {
  interface Chainable {
    loginViaApi(username: string): Chainable<void>
    shouldBeWithinViewport(): Chainable<JQuery<HTMLElement>>
  }
}
```

### Commands vs Page Object Methods

- **Custom commands**: cross-cutting concerns (auth, API helpers, global assertions), reuse across unrelated specs
- **Page object methods**: page-specific interactions, locator encapsulation, domain-bound workflows
- Rule: `cy.session()`, `cy.request()`, or global use -- command. Page-specific elements -- page object

## Selector Strategies

Beyond `data-testid` basics in `cypress-patterns.md`.

### Testing Library Integration
```typescript
import '@testing-library/cypress/add-commands' // in cypress/support/e2e.ts
cy.findByRole('button', { name: /submit/i }).click()
cy.findByLabelText('Email address').type('test.user@example.com')
cy.findByText('Welcome back').should('be.visible')
```

### Scoped Queries, Filtering, and Shadow DOM
```typescript
cy.get('[data-testid="billing-section"]').within(() => {
  cy.findByLabelText('Card number').type('4111111111111111')
  cy.findByRole('button', { name: 'Pay' }).click()
})
```
- `cy.get('.row').filter(':visible')` -- reduce to visible elements
- `cy.get('.row').eq(2)` -- zero-based index; `.first()` / `.last()` for boundaries
- Shadow DOM per-query: `cy.get('my-component').shadow().find('button')`
- Shadow DOM global: `defineConfig({ includeShadowDom: true })`

## Error Handling and Retry

### Test Retries
```typescript
// cypress.config.ts -- global retries
export default defineConfig({ retries: { runMode: 2, openMode: 0 } })
// Per-test override
it('renders chart', { retries: { runMode: 3 } }, () => { /* ... */ })
```

### Uncaught Exception Handling and Flake Detection
```typescript
// Suppress known third-party errors without hiding real failures
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('ResizeObserver loop')) return false
  if (err.message.includes('Script error')) return false
  return true // default: fail the test
})
// Experimental: detect-flake-and-pass-on-threshold (cypress.config.ts)
export default defineConfig({
  retries: {
    runMode: 2, openMode: 0,
    experimentalStrategy: 'detect-flake-and-pass-on-threshold',
    experimentalOptions: { maxRetries: 5, passesRequired: 3 },
  },
})
```

### Network Timeout Configuration

- `responseTimeout` (default 30s) -- time waiting for server response after request sent
- `requestTimeout` (default 5s) -- time waiting for XHR/fetch after `cy.wait('@alias')`
- Per-command: `cy.wait('@slowApi', { responseTimeout: 60000 })`
- Global override in `cypress.config.ts` for slow environments (staging, VPN)

### Flaky Test Tagging and Quarantine
```typescript
describe('Dashboard charts', { tags: ['@flaky'] }, () => {
  it('renders pie chart', () => { /* ... */ })
})
```
- Run only flaky: `npx cypress run --env grepTags=@flaky` (requires `@cypress/grep`)
- Exclude flaky: `npx cypress run --env grepTags=-@flaky`
- Goal: zero `@flaky` tags in main branch
