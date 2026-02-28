# Cypress E2E Patterns Reference

> Load `e2e-common-patterns.md` first for shared patterns (directory structure, import strategy, UI framework selectors).
> Read `e2e.framework` from `sparq.config.json`. Use these patterns when `cypress`.

## Wait Strategy

Cypress auto-waits for elements (up to `defaultCommandTimeout`, default 4s). Rules:
- NEVER use `cy.wait(ms)` for element waits -- rely on Cypress auto-retry
- Use `cy.intercept()` + `cy.wait('@alias')` for network-dependent waits
- Use `.should('be.visible')` / `.should('exist')` for conditional waits
- For SPA navigation: `cy.url().should('include', '/dashboard')`

## Auto-Wait Limitations
- Cypress auto-retries assertions but does NOT wait for animations to complete
- Use `cy.get('.element').should('be.visible')` before interacting -- ensures element is actionable
- For animation-heavy UIs: `cy.get('.modal').should('be.visible').and('not.have.css', 'opacity', '0')`
- `cy.wait()` with a number (e.g., `cy.wait(500)`) is an anti-pattern -- always wait on aliases or assertions instead
- Unlike Playwright's `waitForLoadState('networkidle')`, Cypress has no built-in network idle -- use `cy.intercept()` + `cy.wait('@alias')` instead

## Locator API

Mapping from `preferences.locatorPriority` config to Cypress commands:

- `getByTestId` -> `cy.get('[data-testid="x"]')` or `cy.findByTestId('x')` (`@testing-library/cypress`)
- `getByRole` -> `cy.findByRole('button', { name: 'Submit' })` (`@testing-library/cypress`)
- `getByLabel` -> `cy.findByLabelText('Email')` (`@testing-library/cypress`)
- `getByText` -> `cy.contains('Hello')` or `cy.findByText('Hello')` (`@testing-library/cypress`)
- `getByPlaceholder` -> `cy.findByPlaceholderText('Enter email')` (`@testing-library/cypress`)

**Detection**: Check `package.json` for `@testing-library/cypress`. If present, prefer `findBy*` methods. If absent, use `cy.get('[data-testid="x"]')` + `cy.contains()`.

### Resilient Locator Pattern

Cypress has no `.or()` equivalent. Use conditional fallback only when testid uncertain:

```typescript
get submitButton() {
  return cy.get('body').then($body => {
    if ($body.find('[data-testid="submit-btn"]').length) {
      return cy.get('[data-testid="submit-btn"]')
    }
    return cy.contains('button', 'Submit')
  })
}
```

Prefer simple selectors. Only use conditional pattern when testid availability is uncertain.

## Assertion Best Practices
- Prefer `should('be.visible')` over `should('exist')` -- visible confirms element is rendered AND in viewport
- `should('exist')` only checks DOM presence (element may be hidden, off-screen, or `display:none`)
- Use `should('not.exist')` for elements that should be removed from DOM (e.g., after delete)
- Use `should('not.be.visible')` for elements that remain in DOM but are hidden (e.g., collapsed accordion)
- Chain assertions: `cy.get('.toast').should('be.visible').and('contain', 'Success')`
- For negative assertions with timing: `cy.get('.spinner').should('not.exist')` -- Cypress retries until timeout

## BasePage Pattern

Constructor stores route path. Uses `cy.visit()` for navigation.

```typescript
export abstract class BasePage {
  abstract get url(): string

  visit() { cy.visit(this.url) }

  getByTestId(testId: string) { return cy.get(`[data-testid="${testId}"]`) }

  fillField(testId: string, value: string) {
    cy.get(`[data-testid="${testId}"]`).clear().type(value)
  }

  clickButton(text: string) { cy.contains('button', text).click() }
}
```

Read actual base class path from `e2e.baseClass` in config. Adapt to match the project's existing base class.

## Page Object Pattern

Locators are `get` accessors returning Cypress chainables. URL from route constants via `project.routeDiscoveryPattern`.

```typescript
import { BasePage } from './base.page'

export class LoginPage extends BasePage {
  get url(): string { return '/login' }
  get heading() { return cy.get('h1') }
  get usernameInput() { return cy.get('[data-testid="username-input"]') }
  get passwordInput() { return cy.get('[data-testid="password-input"]') }
  get signInButton() { return cy.get('[data-testid="sign-in-button"]') }
  get errorMessage() { return cy.get('[role="alert"]') }

  login(username: string, password: string) {
    this.usernameInput.clear().type(username)
    this.passwordInput.clear().type(password)
    this.signInButton.click()
  }
}
```

UI frameworks wrapping native inputs may require `.find('input')` chained on the parent. For wrapped inputs (UI component libraries), use the Wrapped Input Pattern in `e2e-common-patterns.md`.

## Component Object Pattern

Static factory methods, `get` accessor locators.

```typescript
export class FormFieldComponent {
  private readonly selector: string
  constructor(selector: string) { this.selector = selector }
  static fromTestId(testId: string) { return new FormFieldComponent(`[data-testid="${testId}"]`) }
  static fromLabel(label: string) { return new FormFieldComponent(`.form-field:has(label:contains("${label}"))`) }
  get input() { return cy.get(this.selector).find('input, textarea, select').first() }
  get errorMessage() { return cy.get(this.selector).find('[data-p-severity="error"]') }
  fill(value: string) { this.input.clear().type(value) }
}
```

## Steps Pattern (BDD)

Steps create page objects internally. Group with `// ===== GIVEN/WHEN/THEN =====`. WHEN methods compose smaller WHEN methods.

```typescript
export class AuthSteps {
  private readonly loginPage = new LoginPage()
  // ===== GIVEN =====
  givenUserIsOnLoginPage() { this.loginPage.visit() }
  // ===== WHEN =====
  whenUserLogsIn(u: string, p: string) { this.loginPage.login(u, p) }
  // ===== THEN =====
  thenErrorShouldBeVisible() { this.loginPage.errorMessage.should('be.visible') }
  thenUserShouldBeOnDashboard() { cy.url().should('include', '/dashboard') }
}
```

## Custom Commands (equivalent to Playwright fixtures)

Define in `cypress/support/commands.ts`. Register types in `cypress/support/index.d.ts`.

```typescript
// commands.ts
Cypress.Commands.add('loginAsAdmin', () => {
  cy.session('admin', () => {
    cy.visit('/login')
    cy.get('[data-testid="username-input"]').type('admin')
    cy.get('[data-testid="password-input"]').type('password')
    cy.get('[data-testid="sign-in-button"]').click()
    cy.url().should('include', '/dashboard')
  })
})

// index.d.ts
declare namespace Cypress {
  interface Chainable {
    loginAsAdmin(): Chainable<void>
  }
}
```

## Authentication Pattern

Use `cy.session()` for session caching (Cypress 12+):

```typescript
Cypress.Commands.add('loginViaToken', () => {
  cy.session('token-auth', () => {
    cy.window().then(win => {
      win.localStorage.setItem('auth', JSON.stringify({ token: 'mock-jwt' }))
    })
  })
  cy.visit('/dashboard')
})
```

## Intercept Pattern (API Mocking)

```typescript
cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers')
cy.visit('/users')
cy.wait('@getUsers')
cy.get('[data-testid="user-list"]').children().should('have.length.gt', 0)
```

## Network Strategy
- **Prefer `cy.intercept()` for deterministic tests** -- mock API responses for predictable assertions
- **Use real API calls only for smoke/integration tests** that validate actual backend behavior
- Stub pattern: `cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers')`
- Spy pattern (real calls): `cy.intercept('GET', '/api/users').as('getUsers')` (no response body = passthrough)
- Always alias intercepts and `cy.wait('@alias')` before asserting on response data
- For error testing: `cy.intercept('POST', '/api/submit', { statusCode: 500, body: { error: 'Server Error' } })`

## Spec Pattern

`describe`/`it` structure. Import page objects directly from barrel -- no fixture index needed.

```typescript
import { LoginPage } from '../support/pages'

describe('Login', () => {
  const loginPage = new LoginPage()

  it('displays the login form', () => {
    loginPage.visit()
    loginPage.heading.should('be.visible')
  })

  it('shows error on invalid credentials', () => {
    loginPage.visit()
    loginPage.login('bad', 'creds')
    loginPage.errorMessage.should('be.visible')
  })
})
```

Regression tests: inline `describe` with `REG-` ID in the title for grep filtering:
```typescript
// Regression: BUG-142 — Login timeout on slow networks
describe('REG-BUG142-001: Fix login timeout', () => {
  it('should complete login within timeout (REG-BUG142-001)', () => { /* ... */ })
})
```

## Import Conventions

```typescript
import { LoginPage, MFAPage } from '../support/pages'  // Barrel imports from support
import { AuthSteps } from '../support/steps'             // Step classes
// App types: import using project alias or relative path
import type { User } from '../../src/modules/auth/types'
```

## Smoke Verify Commands

- **List/verify**: `npx cypress verify` + `npx tsc --noEmit`
- **Type check**: `npx tsc --noEmit`
- **Run subset**: `npx cypress run --spec "cypress/e2e/{feature}/**" --browser chrome`

## Cypress vs Playwright Parity
Key differences agents must account for:
- **No `.or()` combinator** -- Cypress cannot chain fallback selectors like Playwright's `locator.or()`; use `cy.get('selector1, selector2')` CSS union instead
- **No `page.waitForLoadState()`** -- use `cy.intercept()` + `cy.wait()` for network readiness
- **No parallel test execution per-file** -- Cypress runs specs serially (parallelism is across specs via `--parallel` flag with Cypress Cloud)
- **No native `expect()` from test runner** -- use `cy.wrap(value).should()` or Chai `expect()` (bundled)
- **No `test.step()` annotation** -- use comments or custom `cy.log()` for test step documentation
- **Retryability is automatic** -- don't wrap assertions in retry loops; Cypress retries `.should()` until timeout
