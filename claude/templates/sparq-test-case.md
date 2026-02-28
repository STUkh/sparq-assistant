---
# Optional TMS tracking field — written automatically by /sparq:export after first export.
# Format: tmsId: {provider}:{remoteId}  e.g. tmsId: testrail:5001 | tmsId: qase:301 | tmsId: zephyr:TC-PROJ-42
# Do not set manually; leave absent before first export.
# tmsId: ~
---

# Test Cases: {Feature Name}

**Generated:** {timestamp} | **Source:** {Jira / Confluence / Figma / Manual}
**Total:** {count} | **Coverage:** {percentage}

---

## Summary

- Happy Path: {count} (P1: {n}, P2: {n}, P3: {n})
- Validation: {count} (P1: {n}, P2: {n}, P3: {n})
- Security: {count} (P1: {n}, P2: {n}, P3: {n})
- Edge Cases: {count} (P1: {n}, P2: {n}, P3: {n})
- Accessibility: {count} (P1: {n}, P2: {n}, P3: {n})

---

> **Categories**: HP = Happy Path | VE = Validation & Error | SEC = Security | EC = Edge Case | A11Y = Accessibility

## Test Cases

### {Section Name}

#### TC-{feature}-{cat}-{num}: {Test Title}

**Priority:** P{1-4} | **Type:** {category} | **Auto:** {not_automated | automatable | automated | not_automatable} | **Reqs:** {REQ-IDs}

**Preconditions:**
- {precondition 1}

- Steps:
  1. {action} -> {expected} | Data: {data}
  2. {action} -> {expected} | Data: {data}

**Tags:** `{tag1}`, `{tag2}`

---

## Example

> Login feature for Jira ticket EP-142

#### TC-login-HP-001: Successful login with valid credentials

**Priority:** P1 | **Type:** Happy Path | **Auto:** automatable | **Reqs:** REQ-login-001

**Preconditions:**
- User account `test.user@example.com` exists and is active

- Steps:
  1. Navigate to `/login` -> Login page loads with email and password fields | Data: --
  2. Enter `test.user@example.com` in email field -> Email accepted | Data: `test.user@example.com`
  3. Enter `P@ssw0rd123!` in password field -> Password masked | Data: `P@ssw0rd123!`
  4. Click "Sign In" -> Redirected to `/dashboard`, session cookie set | Data: --

**Tags:** `@login`, `@happy-path`, `@P1`

---

#### TC-login-VE-001: Error shown for invalid credentials

**Priority:** P1 | **Type:** Validation & Error | **Auto:** automatable | **Reqs:** REQ-login-002

**Preconditions:**
- Login page is loaded

- Steps:
  1. Enter `bad@example.com` in email field -> Email accepted | Data: `bad@example.com`
  2. Enter `wrong` in password field -> Password masked | Data: `wrong`
  3. Click "Sign In" -> Error message "Invalid email or password" displayed, no redirect | Data: --

**Tags:** `@login`, `@validation`, `@P1`

---

#### TC-login-SEC-001: Account lockout after 5 failed attempts

**Priority:** P1 | **Type:** Security | **Auto:** automatable | **Reqs:** REQ-login-003

**Preconditions:**
- User account `test.user@example.com` exists with 4 prior failed logins

- Steps:
  1. Navigate to `/login` -> Login page loads | Data: --
  2. Enter `test.user@example.com` / `wrongpassword` and click "Sign In" -> Error "Invalid email or password" | Data: attempt 5
  3. Verify lockout message -> "Account locked. Try again in 15 minutes." displayed | Data: --
  4. Attempt login with correct credentials -> Login rejected, lockout still active | Data: `P@ssw0rd123!`

**Tags:** `@login`, `@security`, `@lockout`, `@P1`
