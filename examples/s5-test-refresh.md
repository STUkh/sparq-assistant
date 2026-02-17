# Scenario 5: Refreshing Login Tests After Requirements Update

> SparQ Version: 1.0.0
> Demonstrates S5: Test Refresh. Existing login tests (8 tests in login.spec.ts) refreshed against updated EP-14 ticket with 2 new acceptance criteria (MFA, session timeout) and 1 changed criteria (password policy update).

## 1. User Invocation

```
/sparq:sync EP-14 e2e/specs/auth/login.spec.ts
```

**Context**: EP-14 was updated in the latest sprint. Two new acceptance criteria were added (MFA authentication and session timeout) and one existing criterion changed (minimum password length from 8 to 12 characters).

## 2. Orchestrator Classification

- Input: Jira ticket `EP-14` + existing test file path `e2e/specs/auth/login.spec.ts`
- Keywords: `/sparq:sync` intent
- Classification: **S5 (Refresh)** -- existing test file + requirement source + refresh intent

## 3. Dual Phase 1

### Task A: Test Validator -- Parse Existing Tests

Read test registry (`.sparq/tracking/test-registry.json`):
```json
{
  "testFile": "e2e/specs/auth/login.spec.ts",
  "testIds": ["TC-login-HP-001", "TC-login-HP-002", "TC-login-HP-003", "TC-login-VE-001", "TC-login-VE-002", "TC-login-SEC-001", "TC-login-SEC-002", "TC-login-EC-001"],
  "requirements": ["REQ-login-001", "REQ-login-002", "REQ-login-003", "REQ-login-004", "REQ-login-005"],
  "sourceTicket": "EP-14",
  "generatedAt": "2025-04-01T09:00:00Z",
  "lastRefreshedAt": "2025-04-01T09:00:00Z",
  "generatedBy": "S3",
  "requirementsHash": "a1b2c3d4e5f6"
}
```

Traceability map built:
- REQ-login-001 (valid login) → TC-login-HP-001, TC-login-HP-002
- REQ-login-002 (email validation) → TC-login-VE-001
- REQ-login-003 (account lockout) → TC-login-SEC-001
- REQ-login-004 (password policy) → TC-login-VE-002
- REQ-login-005 (remember me) → TC-login-HP-003, TC-login-EC-001

### Task B: Requirements Analyst -- Fetch Current Requirements

Fetched EP-14 from Jira: 7 acceptance criteria (was 5)

Previous requirements copied to `.sparq/refresh/REQ-login-previous.md`

Current requirements written to `.sparq/requirements/REQ-login.md`:
- REQ-login-001: Valid login with correct credentials (unchanged)
- REQ-login-002: Email format validation (unchanged)
- REQ-login-003: Account lockout after 5 failed attempts (unchanged)
- REQ-login-004: Password must be minimum 12 characters (was 8) -- **CHANGED**
- REQ-login-005: Remember me checkbox persists session (unchanged)
- REQ-login-006: MFA code required after valid credentials -- **NEW**
- REQ-login-007: Session timeout after 30 min inactivity -- **NEW**

## 4. Phase 1.5: Diff Analysis

Current requirements hash: `d4e5f6a7b8c9` (differs from stored `a1b2c3d4e5f6`)

**Diff Report** (`.sparq/refresh/REFRESH-login-diff.md`):

| Category | Count | Details |
|----------|-------|---------|
| NEW | 2 | REQ-login-006 (MFA), REQ-login-007 (session timeout) |
| CHANGED | 1 | REQ-login-004 (password min 8→12, severity: medium) |
| REMOVED | 0 | -- |
| UNCHANGED | 4 | REQ-login-001, 002, 003, 005 |

## 5. Checkpoint: Diff Approval

Presented to user:

```
Refresh Diff for login (EP-14)
==============================
+2 NEW requirements -- tests to generate
 1 CHANGED requirement (medium severity) -- test to update
 0 REMOVED requirements
 4 UNCHANGED requirements -- no action

NEW:
- REQ-login-006: MFA authentication flow -> Generate HP + EC tests
- REQ-login-007: Session timeout after 30 min -> Generate HP test

CHANGED:
- REQ-login-004: Password minimum changed from 8 to 12 characters
  Affected: TC-login-VE-002
  Recommended: Update assertion value inline

Proceed with all changes? [Y/n]
```

User approves all changes.

## 6. Phase 2: Update Generation

### Automation Engineer Output

**New tests generated** (continuing from existing TC IDs):

```typescript
// TC-login-HP-004: MFA code entry after valid credentials
test('TC-login-HP-004: Successful MFA code entry', async ({ loginPage }) => {
  await loginPage.login('user@example.com', 'ValidP@ssw0rd!');
  await expect(loginPage.mfaCodeInput).toBeVisible();
  await loginPage.enterMfaCode('123456');
  await expect(loginPage.page).toHaveURL('/dashboard');
});

// TC-login-HP-005: Session timeout redirects to login
test('TC-login-HP-005: Session timeout after 30 min inactivity', async ({ authenticatedPage }) => {
  await authenticatedPage.page.clock.fastForward(31 * 60 * 1000);
  await authenticatedPage.page.reload();
  await expect(authenticatedPage.page).toHaveURL('/login');
  await expect(authenticatedPage.sessionExpiredMessage).toBeVisible();
});

// TC-login-EC-002: Invalid MFA code shows error
test('TC-login-EC-002: Invalid MFA code shows error message', async ({ loginPage }) => {
  await loginPage.login('user@example.com', 'ValidP@ssw0rd!');
  await loginPage.enterMfaCode('000000');
  await expect(loginPage.mfaErrorMessage).toBeVisible();
  await expect(loginPage.mfaErrorMessage).toContainText('Invalid code');
});
```

**Updated test** (medium severity change):

```typescript
// TC-login-VE-002 -- BEFORE:
test('TC-login-VE-002: Password too short rejected', async ({ loginPage }) => {
  await loginPage.login('user@example.com', 'Short1!');
  await expect(loginPage.passwordError).toContainText('at least 8 characters');
});

// TC-login-VE-002 -- AFTER:
// [REFRESH] UPDATED: REQ-login-004 password minimum changed from 8 to 12 characters
test('TC-login-VE-002: Password too short rejected', async ({ loginPage }) => {
  await loginPage.login('user@example.com', 'Short1!pass');
  await expect(loginPage.passwordError).toContainText('at least 12 characters');
});
```

**Page object extensions**:

```typescript
// LoginPage additions:
get mfaCodeInput() { return this.page.getByTestId('mfa-code-input'); }
get mfaSubmitButton() { return this.page.getByRole('button', { name: 'Verify' }); }
get mfaErrorMessage() { return this.page.getByTestId('mfa-error'); }
get sessionExpiredMessage() { return this.page.getByText('Your session has expired'); }

async enterMfaCode(code: string) {
  await this.mfaCodeInput.fill(code);
  await this.mfaSubmitButton.click();
}
```

## 7. Checkpoint: Output Review

Presented to user:

```
Refresh Updates for login
=========================
3 new tests:
  TC-login-HP-004: Successful MFA code entry
  TC-login-HP-005: Session timeout after 30 min
  TC-login-EC-002: Invalid MFA code error

1 updated test:
  TC-login-VE-002: Password min 8→12 (assertion + test data)

2 new page methods:
  LoginPage.mfaCodeInput, mfaSubmitButton, mfaErrorMessage, sessionExpiredMessage
  LoginPage.enterMfaCode(code)

Approve? [Y/n]
```

User approves.

## 8. Finalization

- Smoke verification: `npx playwright test --list` passes (11 tests listed)
- Files copied to `e2e/specs/auth/login.spec.ts` and `e2e/pages/login.page.ts`
- Coverage matrix updated: 11 tests covering 7 requirements (was 8 tests, 5 requirements)
- Test registry updated:

```json
{
  "testFile": "e2e/specs/auth/login.spec.ts",
  "testIds": ["TC-login-HP-001", "TC-login-HP-002", "TC-login-HP-003", "TC-login-HP-004", "TC-login-HP-005", "TC-login-VE-001", "TC-login-VE-002", "TC-login-SEC-001", "TC-login-SEC-002", "TC-login-EC-001", "TC-login-EC-002"],
  "requirements": ["REQ-login-001", "REQ-login-002", "REQ-login-003", "REQ-login-004", "REQ-login-005", "REQ-login-006", "REQ-login-007"],
  "sourceTicket": "EP-14",
  "generatedAt": "2025-04-01T09:00:00Z",
  "lastRefreshedAt": "2025-05-15T14:30:00Z",
  "generatedBy": "S5",
  "requirementsHash": "d4e5f6a7b8c9"
}
```

## 9. Output Artifacts

- `.sparq/refresh/REFRESH-login-diff.md` -- Diff analysis (2 new, 1 changed, 0 removed, 4 unchanged)
- `.sparq/refresh/REQ-login-previous.md` -- Previous requirements snapshot
- `.sparq/requirements/REQ-login.md` -- Current requirements (7 total)
- `e2e/specs/auth/login.spec.ts` -- Updated (11 tests, 3 new + 1 updated)
- `e2e/pages/login.page.ts` -- Extended (4 new locators + 1 new method)
- `.sparq/coverage/coverage-matrix.md` -- Updated (11 tests, 7 requirements)
- `.sparq/tracking/test-registry.json` -- Updated (new hash, timestamps, TC IDs)

## 10. Optional Next Step

```
Chain to S4? Requirements are fresh, but selectors and flows may need validation.
[Y] Run /sparq:sync e2e/specs/auth/login.spec.ts
[N] Done
```
