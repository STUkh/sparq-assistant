# Playwright E2E Patterns Reference

> Load `e2e-common-patterns.md` first for shared patterns (directory structure, import strategy, UI framework selectors).
> Read `e2e.framework` from `sparq.config.json`. Use these patterns when `playwright` (or `none` for new projects).

## Wait States

Use the appropriate wait state based on context:

- `'load'` (default): page navigation, full page render, page objects `goto()`
- `'domcontentloaded'`: auth injection via `addInitScript` (page not fully rendered yet), pre-navigation setup
- `'networkidle'`: **NEVER use** -- unreliable with long-polling, SSE, websockets

## Locator API

### Resilient Locator Pattern

Use Playwright's `.or()` method to chain a fallback:

```typescript
// Primary: data-testid (most stable)
// Fallback: semantic role (resilient to attribute changes)
get submitButton(): Locator {
  return this.page.getByTestId('submit-btn')
    .or(this.page.getByRole('button', { name: 'Submit' }))
}
```

Rules:
- Primary: `getByTestId` (if data-testid exists in source)
- Fallback: `getByRole` or `getByLabel` (semantic, survives refactors)
- Never chain more than 2 locators (readability)
- Only add `.or()` when both locator types are available from source code analysis

## AbstractPage

Read the actual base class path from `e2e.baseClass` in `sparq.config.json`. The pattern below is the default Playwright convention. Adapt class name, constructor, and methods to match the project's actual base class.

Constructor takes `Page`, auto-composes `ToastComponent`. Uses `waitForLoadState('load')` -- never `'networkidle'`.

```typescript
export abstract class AbstractPage {
  readonly page: Page
  readonly toast: ToastComponent
  constructor(page: Page) { this.page = page; this.toast = new ToastComponent(page) }
  abstract get url(): string
  async goto() { await this.page.goto(this.url); await this.waitForPageLoad() }
  async waitForPageLoad() { await this.page.waitForLoadState('load') }
  getFormField(label: string) { return FormFieldComponent.fromLabel(this.page, label) }
  getFormFieldByTestId(testId: string) { return FormFieldComponent.fromTestId(this.page, testId) }
  async fillField(label: string, value: string) { await this.page.getByLabel(label).fill(value) }
  async clickButton(text: string) { await this.page.getByRole('button', { name: text }).click() }
  byTestId(testId: string): Locator { return this.page.getByTestId(testId) }
  byRole(role: Parameters<Page['getByRole']>[0], name: string): Locator { return this.page.getByRole(role, { name }) }
  byText(text: string): Locator { return this.page.getByText(text) }
}
```

## Page Object Pattern

Locators are **get accessors** (NOT constructor assignments). URL from route constants discovered via `project.routeDiscoveryPattern`.

```typescript
import type { Locator } from '@playwright/test'
import { AbstractPage } from './abstract.page'

export class LoginPage extends AbstractPage {
  get url(): string { return authRoutePath.login }
  get heading(): Locator { return this.page.locator('h1') }
  get usernameInput(): Locator { return this.page.getByTestId('username-input') }
  get passwordInput(): Locator { return this.page.getByTestId('password-input').locator('input') }
  get signInButton(): Locator { return this.page.getByTestId('sign-in-button') }
  get errorMessage(): Locator { return this.page.getByRole('alert') }
  get usernameError(): Locator {
    return this.page.getByTestId('username-field').locator('[data-p-severity="error"]')
  }
  async login(username: string, password: string) {
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.signInButton.click()
  }
}
```

UI frameworks wrapping native inputs may require `.locator('input')` chained on the parent. For wrapped inputs (UI component libraries), use the Wrapped Input Pattern in `e2e-common-patterns.md`.

## Component Object Pattern

Static factory methods, `readonly` fields, `get` accessor locators. Error selectors per UI Framework Selectors in `e2e-common-patterns.md`.

```typescript
export class FormFieldComponent {
  readonly page: Page
  readonly container: Locator
  constructor(page: Page, container: Locator) { this.page = page; this.container = container }
  static fromTestId(page: Page, testId: string) { return new FormFieldComponent(page, page.getByTestId(testId)) }
  static fromLabel(page: Page, label: string) { return new FormFieldComponent(page, page.locator(`.form-field:has(label:text("${label}"))`)) }
  get input(): Locator { return this.container.locator('input, textarea, select').first() }
  get errorMessage(): Locator { return this.container.locator('[data-p-severity="error"]') }
  async fill(value: string) { await this.input.fill(value) }
}
```

## Steps Pattern (BDD)

Steps take `Page` in constructor, create page objects internally. Group with `// ===== GIVEN/WHEN/THEN =====`. WHEN methods compose smaller WHEN methods.

```typescript
export class AuthSteps {
  private readonly loginPage: LoginPage
  constructor(page: Page) { this.loginPage = new LoginPage(page) }
  // ===== GIVEN =====
  async givenUserIsOnLoginPage() { await this.loginPage.goto() }
  // ===== WHEN =====
  async whenUserLogsIn(u: string, p: string) { await this.loginPage.login(u, p) }
  // ===== THEN =====
  async thenErrorShouldBeVisible() { await expect(this.loginPage.errorMessage).toBeVisible() }
}
```

## Fixture Pattern (Factory Functions, NOT Classes)

Interface first, then factory function. Always include `cleanup()`.

```typescript
export interface AuthFixture { loginAsAdmin: () => Promise<void>; cleanup: () => Promise<void> }
export function createAuthFixture(page: Page): AuthFixture {
  return {
    async loginAsAdmin() {
      await page.addInitScript(({ token }) => { localStorage.setItem('auth', JSON.stringify({ token })) }, { token: 'mock-jwt' })
      await page.goto('/dashboard')
      await page.waitForLoadState('domcontentloaded')
    },
    async cleanup() { if (page.url() !== 'about:blank') await page.evaluate(() => localStorage.removeItem('auth')) },
  }
}
// fixtures/index.ts -- barrel re-exports test (extended) and expect
export const test = base.extend<{ auth: AuthFixture }>({
  auth: async ({ page }, use) => { const a = createAuthFixture(page); await use(a); await a.cleanup() },
})
export { expect }
```

## Spec Pattern

Import `test`/`expect` from fixtures index -- NEVER from `@playwright/test`. Instantiate inside each `test()`, not `beforeEach`.

```typescript
import { expect, test } from '../../fixtures'
import { LoginPage } from '../../pages'
test.describe('Login', () => {
  test('displays form', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await expect(loginPage.heading).toBeVisible()
  })
})
```

## Import Conventions

```typescript
import type { Locator, Page } from '@playwright/test'      // Types use `import type`
// App types: import from {project.sourceRoot} using project alias or relative path
import type { User } from '../../src/modules/auth/types'
import { LoginPage, MFAPage } from '../pages'                // Barrel imports from e2e folders
import { expect, test } from '../../fixtures'                // Specs: ALWAYS from fixtures
```

## Data-Driven Tests (`test.each()`)

Use `test.each()` when VE-category tests share the same flow but differ only in input data. Trigger: 3+ validation scenarios for the same field or flow.

```typescript
test.each([
  { input: '',             error: 'Email is required',    label: 'empty' },
  { input: 'not-an-email', error: 'Invalid email format', label: 'invalid-format' },
  { input: 'a'.repeat(255) + '@t.co', error: 'Email too long', label: 'max-length-exceeded' },
])('TC-login-VE-001-$label: Email validation — $label', async ({ page, input, error }) => {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.emailInput.fill(input)
  await loginPage.submitButton.click()
  await expect(loginPage.emailError).toHaveText(error)
})
```

TC ID convention: base `TC-{feature}-VE-{NNN}` + kebab-case label suffix (e.g., `TC-login-VE-001-empty`). For 6+ variants or shared datasets, extract to `fixtures/test-data/{feature}.ts` and import from the fixture barrel. Full patterns, Cypress equivalent, and `TestStep.testData` usage: `data-driven-patterns.md`.

## Smoke Verify Commands

- **List**: `npx playwright test --list`
- **Type check**: `npx tsc --noEmit`
- **Run subset**: `npx playwright test {spec-file}`
