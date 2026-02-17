# Project Conventions: E2E Tests

## Import Rules

- Specs import `{ test, expect }` from the project fixtures index (relative path like `../../fixtures`)
- NEVER import directly from `@playwright/test` in spec files
- Page objects may use `import type { Locator, Page } from '@playwright/test'` for types only
- Page objects are imported from barrel index: `import { LoginPage } from '../../pages'`

## Page Object Pattern

All page objects extend `AbstractPage`. Locators use `get` accessor properties returning `Locator`.
Do NOT use `readonly` field assignments like `readonly field = this.page.locator(...)`.

```typescript
import type { Locator } from '@playwright/test'
import { AbstractPage } from './abstract.page'

export class LoginPage extends AbstractPage {
  get url(): string { return '/login' }
  get emailInput(): Locator { return this.page.getByTestId('email-input') }
  get passwordInput(): Locator { return this.page.getByTestId('password-input') }
  get signInButton(): Locator { return this.page.getByRole('button', { name: 'Sign In' }) }
  get errorMessage(): Locator { return this.page.getByRole('alert') }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.signInButton.click()
  }
}
```

## Spec Pattern

```typescript
import { expect, test } from '../../fixtures'
import { LoginPage } from '../../pages'

test.describe('Login', () => {
  let loginPage: LoginPage

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    await loginPage.goto()
  })

  test('should display login form', async ({ page }) => {
    await expect(loginPage.emailInput).toBeVisible()
    await expect(loginPage.passwordInput).toBeVisible()
  })

  test('should login with valid credentials', async ({ page }) => {
    await loginPage.login('test.user@example.com', 'P@ssw0rd123!')
    await expect(page).toHaveURL('/dashboard')
  })
})
```

## ID Formats

- Requirements: `REQ-{feature}-{NNN}` (e.g., `REQ-login-001`)
- Test cases: `TC-{feature}-{ABBR}-{NNN}` where ABBR is HP|VE|SEC|EC|A11Y
- Regression: `REG-{ticket}-{NNN}` (e.g., `REG-BUG-42-001`)
- Validation findings: `VF-{N}` (e.g., `VF-1`)

## Barrel Exports

Every directory has an `index.ts` that re-exports all members:

```typescript
export { LoginPage } from './LoginPage'
export { DashboardPage } from './DashboardPage'
```

## Locator Priority

1. `getByTestId` (preferred when `data-testid` exists)
2. `getByRole` (buttons, links, headings, checkboxes)
3. `getByLabel` (form fields with labels)
4. `getByText` (static text content)
5. CSS `locator()` (last resort only)
