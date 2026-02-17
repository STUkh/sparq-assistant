# Validation Report: {Scope}

**Generated:** {timestamp} | **Validated:** {count} tests | **Files:** {file list}

---

## Summary

| Severity | Count | Auto-Fixable |
|----------|-------|--------------|
| Critical | 0 | 0 |
| Warning | 0 | 0 |
| Info | 0 | 0 |

---

## Scope

- **E2E tests**: All check types apply (selector, flow, UI mismatch, test data, deprecated pattern, flakiness)
- **Manual tests**: Precondition, coverage gap, and requirement traceability checks apply. Selector and flow checks do not apply.

## Findings

### Critical

#### VF-001: {Finding Title}

**File:** `{path}:{line}` | **Type:** {broken_selector | flow_mismatch | ui_change | stale_data | coverage_gap | deprecated_pattern} | **Auto-Fix:** {Yes/No}

- **Current:** {what the test currently does}
- **Expected:** {what it should do}
- **Fix:** {code or instruction}

---

### Warning

#### VF-002: {Finding Title}
{same format}

---

### Info

#### VF-003: {Finding Title}
{same format}

---

## Actions

- [ ] **Apply all auto-fixes** ({count} fixes)
- [ ] **Review one-by-one** (interactive)
- [ ] **Report only** (no changes)

## Re-Validation

| Check | Before | After |
|-------|--------|-------|
| Critical | 0 | - |
| Warning | 0 | - |
| Info | 0 | - |

## Example

> Validation of Login E2E tests for EP-142

### Critical

#### VF-001: Broken selector for login button

**File:** `e2e/specs/login.spec.ts:24` | **Type:** broken_selector | **Auto-Fix:** Yes

- **Current:** `page.locator('#submit-btn')`
- **Expected:** `page.getByRole('button', { name: 'Sign In' })`
- **Fix:** Replace ID selector with role-based locator to match updated UI

---

### Warning

#### VF-002: Stale test data for locked account scenario

**File:** `e2e/specs/login.spec.ts:58` | **Type:** stale_data | **Auto-Fix:** No

- **Current:** Test expects lockout after 3 attempts
- **Expected:** Lockout threshold changed to 5 attempts per REQ-login-003
- **Fix:** Update `MAX_ATTEMPTS` constant from 3 to 5 and add attempts 4-5 to test steps

---

### Info

#### VF-003: Missing aria-label assertion on error message

**File:** `e2e/specs/login.spec.ts:72` | **Type:** coverage_gap | **Auto-Fix:** No

- **Current:** Test asserts error text visibility only
- **Expected:** Also assert `role="alert"` and aria-live region for screen readers
- **Fix:** Add `await expect(page.getByRole('alert')).toContainText('Invalid email or password')`
