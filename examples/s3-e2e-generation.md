# Scenario 3: E2E Test Generation -- Generating Playwright Tests from Scratch for User Creation

> **SparQ Version:** 1.0.0
>
> This example demonstrates Scenario 3: E2E Test Generation. Feature "User Creation in Admin Panel" (EP-198) through requirements, automation strategy, and Playwright test generation.
>
> **Note**: This example uses a Vue/PrimeVue project. Your generated code will use selectors and patterns appropriate for your detected tech stack (see `sparq.config.json`).
>
> This example shows Playwright output, the default E2E framework. SparQ reads your `e2e.framework` from `sparq.config.json`.

---

## 1. User Invocation

```
User: /sparq:generate-e2e EP-198
```

## 2. Orchestrator Classification

Classified as Scenario 3 (E2E Test Generation). Existing e2e/: 5 page objects, 5 components, 1 steps class, 1 fixture. Dispatching requirements-analyst.

## 3. Requirements Gathering (Phase 1)

- **Jira** -- EP-198 with 3 subtasks (form fields, validation, permissions). 7 acceptance criteria: CRUD, email uniqueness, role/council assignment, authorization
- **Confluence** -- Role matrix: Super Admin creates users + assigns all roles. Admin creates users + assigns Member/Viewer only. Member/Viewer cannot access page
- **Figma** -- `admin/create-user`: first name, last name, email, role dropdown, council multi-select (Member role only), create/cancel buttons, success toast

Requirements: `.sparq/requirements/REQ-user-creation.md` -- 8 requirements, 8 UI elements:

- REQ-user-creation-001: Navigate to create user page (SRC-J, P1, Functional)
- REQ-user-creation-002: Form fields for user creation (SRC-J+SRC-F, P1, Functional)
- REQ-user-creation-003: Email uniqueness validation (SRC-J, P1, Validation)
- REQ-user-creation-004: Role assignment (SRC-J+SRC-C, P1, Functional)
- REQ-user-creation-005: Council conditional on Member role (SRC-J+SRC-F, P2, Functional)
- REQ-user-creation-006: Activation email sent after creation (SRC-J, P2, Functional)
- REQ-user-creation-007: Success confirmation (SRC-J+SRC-F, P2, UX)
- REQ-user-creation-008: Authorization enforcement (SRC-C, P1, Security)

## 4. Checkpoint 1: Automation Strategy

```
Fully automatable (4 tests):
  1. Create user with valid data (happy path)              P1
  2. Validation errors for required fields                 P1
  3. Role assignment restricts options by admin type       P1
  4. Duplicate email returns conflict error                P2

Partially automatable (1): Activation email (API response only, P2)
Not automatable (1): Visual form alignment (manual review, P3)

Reuse: abstract.page.ts, auth.fixture.ts, auth.steps.ts
New: 1 page object, 1 steps class
```

User approves, asks to skip the email test.

## 5. Code Generation (Phase 2)

Generated files are written directly to the project `e2e/` directory per `e2e.structure.*` config. Use `git diff` to review changes.

### `e2e/pages/admin-users.page.ts`

```typescript
import { type Locator, type Page, expect } from '@playwright/test'
import { AbstractPage } from './abstract.page'

export class AdminUsersPage extends AbstractPage {
  get url(): string { return '/admin/users/create' }

  get firstNameInput(): Locator { return this.page.getByLabel('First name') }
  get lastNameInput(): Locator { return this.page.getByLabel('Last name') }
  get emailInput(): Locator { return this.page.getByLabel('Email') }
  get roleDropdown(): Locator { return this.page.getByLabel('Role') }
  get councilMultiSelect(): Locator { return this.page.getByLabel('Council') }
  get createUserButton(): Locator { return this.page.getByRole('button', { name: 'Create User' }) }
  get successToast(): Locator { return this.page.getByRole('status') }

  async fillUserForm(data: {
    firstName: string; lastName: string; email: string
    role: string; councils?: string[]
  }): Promise<void> {
    await this.firstNameInput.fill(data.firstName)
    await this.lastNameInput.fill(data.lastName)
    await this.emailInput.fill(data.email)
    await this.roleDropdown.click()
    await this.page.getByRole('option', { name: data.role }).click()
    for (const c of data.councils ?? []) {
      await this.councilMultiSelect.click()
      await this.page.getByRole('option', { name: c }).click()
    }
  }

  async submitForm(): Promise<void> { await this.createUserButton.click() }
}
```

### `e2e/steps/admin-users.steps.ts`

```typescript
import { type Page, expect } from '@playwright/test'
import { AdminUsersPage } from '../pages/admin-users.page'

export class AdminUsersSteps {
  private readonly p: AdminUsersPage
  constructor(page: Page) { this.p = new AdminUsersPage(page) }

  async givenUserIsOnCreateUserPage(): Promise<void> { await this.p.goto() }

  async whenUserCreatesUser(data: {
    firstName: string; lastName: string; email: string
    role: string; councils?: string[]
  }): Promise<void> {
    await this.p.fillUserForm(data)
    await this.p.submitForm()
  }

  async whenUserSubmitsEmptyForm(): Promise<void> { await this.p.submitForm() }

  async whenUserSelectsRole(role: string): Promise<void> {
    await this.p.roleDropdown.click()
    await this.p.page.getByRole('option', { name: role }).click()
  }

  async thenUserCreatedSuccessfully(): Promise<void> {
    await expect(this.p.successToast).toContainText('User created successfully')
  }

  async thenValidationErrorShown(field: string, msg: string): Promise<void> {
    await expect(this.p.page.getByLabel(field).locator('..').getByRole('alert'))
      .toContainText(msg)
  }

  async thenCouncilFieldIsVisible(): Promise<void> {
    await expect(this.p.councilMultiSelect).toBeVisible()
  }

  async thenCouncilFieldIsHidden(): Promise<void> {
    await expect(this.p.councilMultiSelect).toBeHidden()
  }

  async thenAccessDenied(): Promise<void> {
    await expect(this.p.page.getByText('Access Denied')).toBeVisible()
  }
}
```

### `e2e/specs/admin/user-creation.spec.ts`

```typescript
import { test } from '../../fixtures/auth.fixture'
import { AdminUsersSteps } from '../steps/admin-users.steps'

test.describe('User Creation', () => {
  let steps: AdminUsersSteps

  test('TC-user-creation-HP-001: Create user with valid data', async ({ page, authSteps }) => {
    await authSteps.givenUserIsLoggedInAs('super-admin')
    steps = new AdminUsersSteps(page)
    await steps.givenUserIsOnCreateUserPage()
    await steps.whenUserCreatesUser({
      firstName: 'Jane', lastName: 'Doe',
      email: 'jane.doe@example.com', role: 'Member', councils: ['Engineering'],
    })
    await steps.thenUserCreatedSuccessfully()
  })

  test('TC-user-creation-VE-001: Required fields show errors', async ({ page, authSteps }) => {
    await authSteps.givenUserIsLoggedInAs('admin')
    steps = new AdminUsersSteps(page)
    await steps.givenUserIsOnCreateUserPage()
    await steps.whenUserSubmitsEmptyForm()
    await steps.thenValidationErrorShown('First name', 'First name is required')
    await steps.thenValidationErrorShown('Email', 'Email is required')
  })

  test('TC-user-creation-VE-002: Duplicate email conflict', async ({ page, authSteps }) => {
    await authSteps.givenUserIsLoggedInAs('admin')
    steps = new AdminUsersSteps(page)
    await steps.givenUserIsOnCreateUserPage()
    await steps.whenUserCreatesUser({
      firstName: 'Existing', lastName: 'User',
      email: 'existing.user@example.com', role: 'Viewer',
    })
    await steps.thenValidationErrorShown('Email', 'A user with this email already exists')
  })

  test('TC-user-creation-EC-001: Council visible for Member role', async ({ page, authSteps }) => {
    await authSteps.givenUserIsLoggedInAs('admin')
    steps = new AdminUsersSteps(page)
    await steps.givenUserIsOnCreateUserPage()
    await steps.whenUserSelectsRole('Member')
    await steps.thenCouncilFieldIsVisible()
  })

  test('TC-user-creation-SEC-001: Member cannot access page', async ({ page, authSteps }) => {
    await authSteps.givenUserIsLoggedInAs('member')
    steps = new AdminUsersSteps(page)
    await steps.givenUserIsOnCreateUserPage()
    await steps.thenAccessDenied()
  })
})
```

## 6. Checkpoint 2: Output Review

**Staged:** 3 files (5 tests) | **Selectors:** 7 HIGH, 1 MEDIUM (council) | **Reused:** AbstractPage, auth fixture | **Skipped:** activation email, visual alignment

User approves. Files written to project `e2e/` directory.

## 7. Checkpoint 3: Final Approval

After approval, files are verified in the project `e2e/` directory:

```
[sparq] Written: e2e/pages/admin-users.page.ts
[sparq] Written: e2e/steps/admin-users.steps.ts
[sparq] Written: e2e/specs/admin/user-creation.spec.ts
[sparq] Run: npx playwright test e2e/specs/admin/user-creation.spec.ts
```

## 8. Final Artifacts

- `.sparq/requirements/REQ-user-creation.md` -- 8 requirements, 8 UI elements
- `e2e/pages/admin-users.page.ts` -- Page Object
- `e2e/steps/admin-users.steps.ts` -- BDD steps
- `e2e/specs/admin/user-creation.spec.ts` -- Playwright tests (5)

**Traceability:**

| Requirement | Test Case |
|-------------|-----------|
| REQ-user-creation-001 (Navigate to create user) | TC-user-creation-HP-001 |
| REQ-user-creation-002 (Form fields) | TC-user-creation-HP-001, TC-user-creation-VE-001 |
| REQ-user-creation-003 (Email uniqueness) | TC-user-creation-VE-002 |
| REQ-user-creation-005 (Council conditional) | TC-user-creation-EC-001 |
| REQ-user-creation-008 (Authorization) | TC-user-creation-SEC-001 |
| REQ-user-creation-006 (Activation email) | Deferred |
