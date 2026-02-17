# Scenario 4: Validating Tests After UI Update

> **SparQ Version:** 1.0.0
>
> This example demonstrates Scenario 4: Test Sync (UI sync mode). Existing login tests validated against updated Figma designs, with auto-fix and re-validation.
>
> **Note**: This example uses a Vue/PrimeVue project. Your generated code will use selectors and patterns appropriate for your detected tech stack (see `sparq.config.json`).
>
> Validation works with any framework. SparQ greps your codebase for selectors and compares against Figma and live DOM regardless of your tech stack.

---

## 1. User Invocation

```
User: /sparq:validate e2e/specs/auth/
The login UI was recently updated in Figma. Check if our tests still match.
```

## 2. Orchestrator Classification

Classified as Scenario 4 (Test Validation -- UI drift mode). Context: Figma design changes. Dispatching test-validator.

## 3. Test File Analysis

```
login.spec.ts (8 tests), forgot-password.spec.ts (5 tests) -- 13 tests total
```

Key selectors from `login.spec.ts`:

```typescript
page.getByRole('button', { name: 'Sign In' })       // line 24
page.getByRole('heading', { name: 'Welcome Back' })  // line 18
page.getByLabel('Email')                              // line 20
page.getByLabel('Password')                           // line 21
```

## 4. Fetch Current State (Parallel)

**Figma** -- fetched `auth/login` and `auth/forgot-password`:

- Login button: "Sign In" --> "Log In" (CHANGED)
- Page heading: "Welcome Back" --> "Sign In to Your Account" (CHANGED)
- Email / Password labels: unchanged
- New element: "Remember Me" checkbox (ADDED)

**Codebase** -- source already reflects Figma changes:
- Login component heading: "Sign In to Your Account" (was "Welcome Back")
- Login component: "Remember Me" checkbox added (new)
- Login component button: "Log In" (was "Sign In")
- Routes `/login` and `/forgot-password` active

Tests are out of date with both Figma and source code.

## 5. Findings

- **VF-001 Critical** -- Button `'Sign In'` changed to `'Log In'` (login.spec.ts:24). Type: broken_selector. Test will fail. Auto-fixable.
- **VF-002 Warning** -- New "Remember Me" checkbox (Figma + login component source) has no test coverage. Type: coverage_gap. Can generate stub.
- **VF-003 Warning** -- Heading `'Welcome Back'` changed to `'Sign In to Your Account'` (login.spec.ts:18). Type: ui_change. Auto-fixable.

## 6. Checkpoint: Validation Report

```
Files: 2 | Tests: 13
Critical: 1 (auto-fixable) | Warning: 2 (1 partial, 1 auto-fixable) | Info: 0
Actions: [A: apply all] / [B: critical only] / [C: fix plan] / [D: report only]
```

User selects: **A: Apply all** -- auto-fix all Critical and Warning issues

## 7. Auto-Fixes Applied

**Fix 1** (VF-001): button selector updated in 4 occurrences:
```diff
- page.getByRole('button', { name: 'Sign In' })
+ page.getByRole('button', { name: 'Log In' })
```

**Fix 2** (VF-003): heading assertion updated:
```diff
- page.getByRole('heading', { name: 'Welcome Back' })
+ page.getByRole('heading', { name: 'Sign In to Your Account' })
```

**Fix 3** (VF-002): test stub appended to `login.spec.ts`:
```typescript
test.describe('Remember Me', () => {
  test('TC-login-HP-004: Remember Me checkbox persists session', async ({
    page, authSteps,
  }) => {
    await authSteps.givenUserIsOnLoginPage()
    await page.getByLabel('Email').fill('test.user@example.com')
    await page.getByLabel('Password').fill('Test1234!')
    await page.getByRole('checkbox', { name: 'Remember Me' }).check()
    await page.getByRole('button', { name: 'Log In' }).click()
    // TODO: Assert persistent session after browser close/reopen
  })
})
```

## 8. Re-Validation

```
Before: Critical 1, Warning 2, Info 0
After:  Critical 0, Warning 0, Info 0 -- All resolved
Report saved: .sparq/validation/validation-report.md
```

## 9. Summary

- `e2e/specs/auth/login.spec.ts` -- 6 lines modified, 15 lines added
- `e2e/specs/auth/forgot-password.spec.ts` -- no changes

## 10. Final Artifacts

- `e2e/specs/auth/login.spec.ts` -- updated button selector, heading, Remember Me stub
- `.sparq/validation/validation-report.md` -- full before/after report

**Remaining action items:**
- Complete TODO in TC-login-HP-004 (Remember Me session persistence)
- Run `npx playwright test e2e/specs/auth/` to verify fixes pass
