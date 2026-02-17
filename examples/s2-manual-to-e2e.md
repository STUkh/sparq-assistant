# Scenario 2: Manual to E2E -- Converting Manual Tests to Playwright

> **SparQ Version:** 1.0.0
>
> This example demonstrates Scenario 2: Manual to E2E. Manual test "Verify tenant selection after login" through clarification, code generation, and file placement.
>
> **Note**: This example uses a Vue/PrimeVue project. Your generated code will use selectors and patterns appropriate for your detected tech stack (see `sparq.config.json`).
>
> This example shows Playwright output, the default E2E framework. SparQ reads your `e2e.framework` from `sparq.config.json`.

---

## 1. User Provides Manual Test Case

```
User: /sparq:manual-to-e2e

TC-tenant-HP-001: Verify tenant selection after login

Preconditions:
- User "qa.admin@acme.com" has access to tenants "Acme Corp" and "Acme Staging"
- User is not logged in

Steps:
1. Navigate to /login
2. Enter "qa.admin@acme.com" in Email, "Test1234!" in Password
3. Click "Log In"
4. Verify "Select Tenant" dropdown shows both tenants
5. Select "Acme Corp" from the dropdown
6. Click "Continue"
7. Verify dashboard loads with "Acme Corp" in the header
```

## 2. Orchestrator Classification

Classified as Scenario 2 (Manual to E2E). Dispatching automation-engineer.

## 3. Project Discovery + Infrastructure Scan

```
Existing e2e/: 5 page objects, 5 components, 1 steps class, 1 fixture
Reusable: pages/login.page.ts, steps/auth.steps.ts (givenUserIsLoggedIn), fixtures/auth.fixture.ts
```

## 4. Figma Enrichment

Fetched "Tenant Selection" screen (`dashboard/tenant-select`):
- Dropdown: `getByLabel('Select Tenant')`
- Button: `getByRole('button', { name: 'Continue' })`
- Header tenant name: `getByTestId('active-tenant-name')` (from codebase grep)

## 5. Checkpoint 1: Clarification Questions

1. MSW mocked data or seed tenants via API?
2. Reuse auth fixture or perform full login as in manual steps?
3. Tenant dropdown: `getByRole('combobox')` or `getByLabel('Select Tenant')`?
4. After selecting tenant, verify localStorage or visible header only?

User answers: MSW mocked data, reuse auth fixture, `getByLabel`, visible header only.

## 6. Code Generation (Phase 2)

Generated files are written directly to the project `e2e/` directory per `e2e.structure.*` config. Use `git diff` to review changes.

### `e2e/pages/tenant.page.ts`

```typescript
import { type Locator, type Page } from '@playwright/test'
import { AbstractPage } from './abstract.page'

export class TenantPage extends AbstractPage {
  get url(): string { return '/tenant-select' }

  get tenantDropdown(): Locator {
    return this.page.getByLabel('Select Tenant')
  }

  get continueButton(): Locator {
    return this.page.getByRole('button', { name: 'Continue' })
  }

  get activeTenantName(): Locator {
    return this.page.getByTestId('active-tenant-name')
  }

  async selectTenant(name: string): Promise<void> {
    await this.tenantDropdown.click()
    await this.page.getByRole('option', { name }).click()
  }

  async clickContinue(): Promise<void> { await this.continueButton.click() }
}
```

### `e2e/steps/tenant.steps.ts`

```typescript
import { type Page, expect } from '@playwright/test'
import { TenantPage } from '../pages/tenant.page'

export class TenantSteps {
  private readonly tp: TenantPage
  constructor(page: Page) { this.tp = new TenantPage(page) }

  async givenUserIsOnTenantSelectionPage(): Promise<void> { await this.tp.goto() }

  async whenUserSelectsTenant(name: string): Promise<void> {
    await this.tp.selectTenant(name)
    await this.tp.clickContinue()
  }

  async thenDashboardShowsActiveTenant(name: string): Promise<void> {
    await this.tp.page.waitForURL('**/dashboard')
    await expect(this.tp.activeTenantName).toHaveText(name)
  }

  async thenTenantDropdownContains(tenants: string[]): Promise<void> {
    await this.tp.tenantDropdown.click()
    for (const t of tenants) {
      await expect(this.tp.page.getByRole('option', { name: t })).toBeVisible()
    }
  }
}
```

### `e2e/specs/tenant-selection.spec.ts`

```typescript
import { test } from '../../fixtures/auth.fixture'
import { TenantSteps } from '../steps/tenant.steps'

test.describe('Tenant Selection', () => {
  let tenantSteps: TenantSteps

  test.beforeEach(async ({ page, authSteps }) => {
    await authSteps.givenUserIsLoggedIn()
    tenantSteps = new TenantSteps(page)
  })

  test('TC-tenant-HP-001: Verify tenant selection after login', async () => {
    await tenantSteps.givenUserIsOnTenantSelectionPage()
    await tenantSteps.thenTenantDropdownContains(['Acme Corp', 'Acme Staging'])
    await tenantSteps.whenUserSelectsTenant('Acme Corp')
    await tenantSteps.thenDashboardShowsActiveTenant('Acme Corp')
  })
})
```

## 7. Checkpoint 2: Output Review

**Staged:** 3 files | **Selectors:** 3 HIGH confidence | **Reused:** AbstractPage, auth.fixture.ts

User requests changing dropdown to `getByRole('combobox', { name: 'Select Tenant' })` since the UI library's select component renders as a combobox. SparQ adapts selector strategies based on the detected `techStack.uiFramework`. Fix applied, user approves.

## 8. Checkpoint 3: Final Approval

After approval, files are verified in the project `e2e/` directory:

```
[sparq] Written: e2e/pages/tenant.page.ts
[sparq] Written: e2e/steps/tenant.steps.ts
[sparq] Written: e2e/specs/tenant-selection.spec.ts
[sparq] Run: npx playwright test e2e/specs/tenant-selection.spec.ts
```

## 9. Final Artifacts

- `e2e/pages/tenant.page.ts` -- Page Object for tenant selection
- `e2e/steps/tenant.steps.ts` -- BDD step methods (given/when/then)
- `e2e/specs/tenant-selection.spec.ts` -- Playwright test

**Traceability:** TC-tenant-HP-001 (manual) --> `tenant-selection.spec.ts` > "Verify tenant selection after login" (automated)
