# Unified Generate: Manual Tests AND E2E from a Jira Ticket

> **SparQ Version:** 1.0.0
>
> This example demonstrates the unified generate flow (`/sparq:generate`). Jira ticket EP-14 "Forgot Password" through requirements analysis, manual test cases, and automatic Playwright E2E generation -- all in a single pipeline.
>
> **Note**: This example uses a Vue/PrimeVue project with Playwright. Your generated output will use patterns appropriate for your detected tech stack (see `sparq.config.json`).

---

## 1. User Invocation

```
User: /sparq:generate EP-14
```

## 2. Orchestrator Classification

```
[sparq] P0 Classified as S1+S2 (unified) -- feature: forgot-password, source: Jira EP-14
```

Classified as S1 with autoChain to S2. Requirements gathered once, then manual tests generated, then automatically converted to E2E code.

## 3. Requirements Gathering (Phase 1)

- **Jira** -- EP-14: 6 acceptance criteria including password reset flow, link expiry (60 min), complexity rules
- **Confluence** -- "Authentication Flows Specification": rate limiting (3 req/hour), JWT tokens, lockout policy
- **Figma** -- `auth/forgot-password`: 2 screens -- "Request Reset" and "Set New Password"

Consolidated to `.sparq/requirements/REQ-forgot-password.md` -- 8 requirements (REQ-forgot-password-001 through -008).

## 4. Checkpoint 1: Unified Plan Approval

```
MANUAL TEST PLAN:
  Happy Path: 3 (P1) | Validation: 4 (P1-P2) | Security: 2 (P1) | Edge Cases: 2 (P2-P3) | A11y: 1 (P2)
  Total: 12 manual cases

E2E AUTOMATION STRATEGY:
  Automatable: 10 of 12 (HP, VE, SEC)
  Manual-only: 2 (A11Y-001 screen reader, EC-002 rate limit timing)
  Infrastructure: 1 new page object (ForgotPasswordPage), reuse existing AuthFixture
  Estimated output: 1 page object, 1 step class, 1 spec file

Approve unified plan? [Y/n]
```

User approves.

## 5. Manual Test Generation (Phase 2a)

```
[sparq] P2 Starting manual test generation...
[sparq] P2 Complete (manual) -- 12 test cases across 5 categories
```

sparq-manual-test-writer generates 12 test cases across HP/VE/SEC/EC/A11Y. Each includes ID, priority, steps, expected results, and automation status flags.

## 6. Checkpoint 2a: Manual Test Review

User reviews 12 cases. Approves. E2E generation begins automatically (no chain-offer prompt).

## 7. E2E Infrastructure Scan

```
[sparq] P2 Starting E2E code generation (auto-chain)...
```

Scans `e2e/` directory:
- Found: `AuthFixture` (reusable), `LoginPage` (extends `AbstractPage`), `baseURL` from `playwright.config.ts`
- Pattern: `get` accessors for locators, `getByTestId` priority, relative imports from `../../fixtures`

## 8. E2E Code Generation (Phase 2b)

sparq-automation-engineer converts 10 automatable test cases to Playwright code:

#### ForgotPasswordPage.ts (snippet)

```typescript
import { AbstractPage } from '../abstract.page'

export class ForgotPasswordPage extends AbstractPage {
  get emailInput() { return this.page.getByTestId('reset-email-input') }
  get sendResetButton() { return this.page.getByRole('button', { name: 'Send Reset Link' }) }
  get newPasswordInput() { return this.page.getByTestId('new-password-input') }
  get confirmPasswordInput() { return this.page.getByTestId('confirm-password-input') }
  get resetButton() { return this.page.getByRole('button', { name: 'Reset Password' }) }
  get strengthIndicator() { return this.page.getByTestId('password-strength') }

  async requestReset(email: string) {
    await this.emailInput.fill(email)
    await this.sendResetButton.click()
  }
}
```

#### forgot-password.spec.ts (snippet)

```typescript
import { test, expect } from '../../fixtures'
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage'

test.describe('Forgot Password', () => {
  test('TC-forgot-password-HP-001: request reset with valid email', async ({ page, authFixture }) => {
    const forgotPassword = new ForgotPasswordPage(page)
    await forgotPassword.goto('/forgot-password')
    await forgotPassword.requestReset('test.user@example.com')
    await expect(page.getByText('Check your email for a reset link')).toBeVisible()
  })

  test('TC-forgot-password-VE-001: password below minimum length', async ({ page }) => {
    const forgotPassword = new ForgotPasswordPage(page)
    // ... navigates via valid reset link
    await forgotPassword.newPasswordInput.fill('Ab1!')
    await forgotPassword.confirmPasswordInput.fill('Ab1!')
    await forgotPassword.resetButton.click()
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()
  })
})
```

## 9. Checkpoint 2b: E2E Code Review

```
Generated:
  e2e/pages/ForgotPasswordPage.ts     (new, 42 lines)
  e2e/steps/forgotPasswordSteps.ts    (new, 28 lines)
  e2e/specs/forgot-password.spec.ts   (new, 95 lines)

Reused: AuthFixture, AbstractPage base class
Skipped: A11Y-001 (screen reader), EC-002 (rate limit timing) -- manual-only

Approve? [Y/n]
```

User approves.

## 10. Verification & Registry (Phase 3)

```
[sparq] P3 Smoke verification: npx playwright test --list PASSED (10 tests listed)
[sparq] -- Workflow complete: S1+S2, 12 manual tests, 10 E2E tests, 7 artifacts, 3 checkpoints
```

## 11. Final Artifacts

**Manual test cases:**
- `.sparq/test-cases/TC-forgot-password-manual.md` -- 12 manual test cases
- `.sparq/test-cases/TC-forgot-password-manual.xml` -- TestRail-importable XML

**E2E automation:**
- `e2e/pages/ForgotPasswordPage.ts` -- Page Object Model
- `e2e/steps/forgotPasswordSteps.ts` -- Reusable step functions
- `e2e/specs/forgot-password.spec.ts` -- 10 Playwright test specs

**Metadata:**
- `.sparq/requirements/REQ-forgot-password.md` -- Consolidated requirements
- `.sparq/coverage/coverage-matrix.md` -- Requirement-to-test traceability
- `.sparq/tracking/test-registry.json` -- Updated with new entries

## Comparison: Unified vs. Separate Commands

| Approach | Commands | Checkpoints | Requirements fetched |
|----------|----------|-------------|---------------------|
| `/sparq:generate EP-14` | 1 command | 3 (plan, manual review, E2E review) | Once |
| `/sparq:generate-manual` then chain to S2 | 1 command + approve chain | 4 (plan, manual review, chain offer, E2E review) | Once |
| `/sparq:generate-manual` then `/sparq:manual-to-e2e` | 2 commands | 5 (plan, manual review, final, plan, E2E review) | Once (reuses REQ doc) |
