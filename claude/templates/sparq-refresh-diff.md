# Refresh Diff: {Feature Name}

**Generated:** {timestamp} | **Source:** {requirement source ref}
**Tests Analyzed:** {file count} files, {test count} tests | **Requirements (Current):** {req count}
**Staleness Signal:** {hash mismatch | timestamp stale | both}

---

## Summary

- **NEW** requirements: {count} -- tests to generate
- **CHANGED** requirements: {count} ({high count} high, {medium count} medium, {low count} low severity)
- **REMOVED** requirements: {count} -- tests to deprecate
- **UNCHANGED** requirements: {count} -- no action needed

---

## NEW Requirements (No Test Coverage)

### {REQ-ID}: {Title}

- **Priority:** {critical | high | medium | low}
- **Category:** {functional | ui | security | validation | accessibility}
- **Acceptance Criteria:**
  - {criterion 1}
  - {criterion 2}
- **Recommended:** Generate {N} test(s) in category {HP | VE | SEC | EC | A11Y}

---

## CHANGED Requirements (Tests Need Update)

### Severity Mapping

- **High**: Logic or behavior change (e.g., altered validation rules, changed workflow steps, modified business logic)
- **Medium**: Acceptance criteria added or removed (e.g., new criterion appended, existing criterion deleted)
- **Low**: Text-only change (e.g., wording clarification, formatting adjustment, typo fix)

### {REQ-ID}: {Title} [{severity}]

- **Change:** {description of what changed}
- **Affected Tests:** {TC-IDs}
- **Before:** {previous acceptance criteria text}
- **After:** {current acceptance criteria text}
- **Recommended:** {rewrite | update inline | review only}

---

## REMOVED Requirements (Tests to Deprecate)

### {REQ-ID}: {Title}

- **Affected Tests:** {TC-IDs}
- **Recommended:** Mark as deprecated{" and remove" if preserveDeprecated is false}

---

## UNCHANGED Requirements

- {REQ-ID}: {title} -- {count} test(s), no changes needed

## Example

> Refresh diff for Login feature, Jira EP-142 (re-synced after sprint update)

**Generated:** 2026-02-13T14:00:00Z | **Source:** Jira EP-142
**Tests Analyzed:** 2 files, 8 tests | **Requirements (Current):** 5
**Staleness Signal:** hash mismatch

### Summary
- **NEW** requirements: 1 -- tests to generate
- **CHANGED** requirements: 1 (0 high, 1 medium, 0 low severity)
- **REMOVED** requirements: 0
- **UNCHANGED** requirements: 3 -- no action needed

### NEW Requirements (No Test Coverage)

#### REQ-login-005: "Remember Me" checkbox persists session for 30 days
- **Priority:** medium
- **Category:** functional
- **Acceptance Criteria:**
  - Checking "Remember Me" sets a 30-day persistent cookie
  - Returning user with valid cookie skips login form
- **Recommended:** Generate 2 test(s) in category HP

### CHANGED Requirements (Tests Need Update)

#### REQ-login-003: Account lockout after failed attempts [medium]
- **Change:** Lockout duration changed from 15 minutes to 30 minutes
- **Affected Tests:** TC-login-SEC-001
- **Before:** Account locks for 15 minutes after 5 failed attempts
- **After:** Account locks for 30 minutes after 5 failed attempts
- **Recommended:** update inline

### UNCHANGED Requirements
- REQ-login-001: Successful login -- 2 test(s), no changes needed
- REQ-login-002: Invalid credentials error -- 2 test(s), no changes needed
- REQ-login-004: Keyboard accessibility -- 1 test(s), no changes needed
