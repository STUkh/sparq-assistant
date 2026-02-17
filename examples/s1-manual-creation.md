# Scenario 1: Generating Manual Test Cases from a Jira Ticket

> **SparQ Version:** 1.0.0
>
> This example demonstrates Scenario 1: Manual Test Creation. Jira ticket EP-14 "Forgot Password" through requirements analysis, manual test cases, and TestRail export.
>
> **Note**: This example uses a Vue/PrimeVue project. Your generated output will use patterns appropriate for your detected tech stack (see `sparq.config.json`).
>
> Manual test generation works with any framework. SparQ auto-detects your tech stack and adapts its output.

---

## 1. User Invocation

```
User: /sparq:generate-manual EP-14
```

## 2. Orchestrator Classification

Classified as Scenario 1 (Manual Test Creation). Plan created, dispatching requirements-analyst.

## 3. Requirements Gathering (Phase 1)

- **Jira** -- EP-14: 6 acceptance criteria including password reset flow, link expiry (60 min), complexity rules (8+ chars, 1 uppercase, 1 number)
- **Confluence** -- "Authentication Flows Specification" (page 48291): rate limiting (3 req/hour), JWT tokens, lockout (5 fails, 15 min)
- **Figma** -- `auth/forgot-password`: 2 screens -- "Request Reset" (email, send button, back link) and "Set New Password" (password inputs, strength indicator, reset button)

Consolidated to `.sparq/requirements/REQ-forgot-password.md` -- 8 requirements:

- REQ-forgot-password-001: User can request password reset (SRC-J+SRC-F, P1, Functional)
- REQ-forgot-password-002: Reset link sent to registered email (SRC-J, P1, Functional)
- REQ-forgot-password-003: Reset link expires after 60 min (SRC-J+SRC-C, P1, Security)
- REQ-forgot-password-004: Password meets complexity rules (SRC-J+SRC-C, P1, Validation)
- REQ-forgot-password-005: Confirmation shown after reset (SRC-J+SRC-F, P2, UX)
- REQ-forgot-password-006: Invalid/expired links show error (SRC-J+SRC-F, P1, Error)
- REQ-forgot-password-007: Rate limiting: 3 requests/hour (SRC-C, P2, Security)
- REQ-forgot-password-008: Password mismatch shows inline error (SRC-F, P2, Validation)

## 4. Checkpoint 1: Test Plan Proposal

```
Happy Path: 3 (P1) | Validation: 4 (P1-P2) | Security: 2 (P1) | Edge Cases: 2 (P2-P3) | A11y: 1 (P2)
Total: 12 cases. Approve? [Y/n]
```

User approves.

## 5. Test Case Generation (Phase 2)

sparq-manual-test-writer generates 12 test cases. Representative samples:

#### TC-forgot-password-HP-001: Request password reset with valid email

**Priority:** P1 | **Type:** Happy Path | **Auto:** automatable | **Reqs:** REQ-forgot-password-001, REQ-forgot-password-002

**Preconditions:**
- User `test.user@example.com` exists and is active

| Step | Action | Expected Result | Test Data |
|------|--------|-----------------|-----------|
| 1 | Navigate to /login | Login page displayed | -- |
| 2 | Click "Forgot password?" | Request Reset page displayed | -- |
| 3 | Enter email in the email field | Field shows value | `test.user@example.com` |
| 4 | Click "Send Reset Link" | Success: "Check your email for a reset link" | -- |
| 5 | Open email, click reset link | Set New Password page displayed | -- |
| 6 | Enter password in both fields | Strength: "Strong" | `NewP@ssw0rd` |
| 7 | Click "Reset Password" | Confirmation: "Password reset successfully" | -- |

#### TC-forgot-password-VE-001: Password below minimum length

**Priority:** P1 | **Type:** Validation Errors | **Auto:** automatable | **Reqs:** REQ-forgot-password-004

**Preconditions:**
- User is on Set New Password page with valid reset link

| Step | Action | Expected Result | Test Data |
|------|--------|-----------------|-----------|
| 1 | Enter short password in both fields | Strength: "Weak" | `Ab1!` |
| 2 | Click "Reset Password" | Error: "Password must be at least 8 characters" | -- |

#### TC-forgot-password-SEC-001: Expired reset link shows error

**Priority:** P1 | **Type:** Security | **Auto:** automatable | **Reqs:** REQ-forgot-password-003, REQ-forgot-password-006

**Preconditions:**
- Reset link was requested 61+ minutes ago

| Step | Action | Expected Result | Test Data |
|------|--------|-----------------|-----------|
| 1 | Click expired reset link | Error: "This reset link has expired" | Link age: 61+ min |
| 2 | Verify no password fields shown | "Request a new link" button visible | -- |

## 6. Checkpoint 2: Output Review

User reviews 12 cases, requests addition: "test for requesting reset with unregistered email." TC-forgot-password-VE-005 added (system shows same success message to prevent email enumeration). Total: 13 cases. User approves.

## 7. TestRail XML Output (Snippet)

```xml
<sections>
  <section>
    <name>Forgot Password</name>
    <sections>
      <section>
        <name>Happy Path</name>
        <cases>
          <case>
            <title>TC-forgot-password-HP-001: Request password reset with valid email</title>
            <type>Functional</type>
            <priority>Critical</priority>
            <references>REQ-forgot-password-001, REQ-forgot-password-002</references>
          </case>
        </cases>
      </section>
    </sections>
  </section>
</sections>
```

## 8. Coverage Matrix (Snippet)

| Requirement | Tests | Coverage |
|-------------|-------|----------|
| REQ-forgot-password-001 (Request password reset) | HP-001, VE-005, EC-001 | 3 tests |
| REQ-forgot-password-003 (Link expires 60 min) | SEC-001, EC-001 | 2 tests |
| REQ-forgot-password-004 (Password complexity) | HP-001, VE-001, VE-002, VE-003 | 4 tests |
| REQ-forgot-password-007 (Rate limiting 3/hr) | SEC-002 | 1 test |

## 9. Checkpoint 3: Final Approval

```
13 manual test cases (P1: 8, P2: 4, P3: 1) | 8/8 requirements covered, 0 gaps
```

User approves and requests TestRail export:

```
[sparq] Exporting 13 test cases to TestRail... Created: C2041-C2053
[sparq] View at: https://team.testrail.io/index.php?/suites/view/1
```

## 10. Final Artifacts

- `.sparq/requirements/REQ-forgot-password.md` -- consolidated requirements
- `.sparq/test-cases/TC-forgot-password-manual.md` -- 13 manual test cases
- `.sparq/test-cases/TC-forgot-password-manual.xml` -- TestRail-importable XML
- `.sparq/coverage/coverage-matrix.md` -- requirement-to-test traceability
