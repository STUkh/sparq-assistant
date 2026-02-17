# Coverage Matrix: {Feature Name}

**Generated:** {timestamp} | **Overall Coverage:** {percentage}

---

## Summary

- Covered: {count} ({percentage})
- Partial: {count} ({percentage})
- Uncovered: {count} ({percentage})

---

> **Categories**: HP = Happy Path | VE = Validation & Error | SEC = Security | EC = Edge Case | A11Y = Accessibility

## Traceability Matrix

- **REQ-{feature}-001**: {title}
  - Tests: TC-{feature}-HP-001, TC-{feature}-VE-001
  - Coverage: 100%
  - Gaps: --
- **REQ-{feature}-002**: {title}
  - Tests: TC-{feature}-HP-002
  - Coverage: 50%
  - Gaps: Missing negative tests
- **REQ-{feature}-003**: {title}
  - Tests: --
  - Coverage: 0%
  - Gaps: No tests created

---

## Gap Analysis

### Uncovered
- {Requirement} -- Priority: {priority}, Recommended: {action}

### Partial
- {Requirement} -- Missing: {categories}, Recommended: {tests}

---

## Distribution

- Happy Path: {count} ({coverage}%)
- Validation: {count} ({coverage}%)
- Security: {count} ({coverage}%)
- Edge Cases: {count} ({coverage}%)
- Accessibility: {count} ({coverage}%)

---

## Calculation Note

Coverage percentage = (covered acceptance criteria / total acceptance criteria) x 100. A requirement is "covered" when at least one TC maps to each of its acceptance criteria.

## Example

> Login feature for Jira ticket EP-142 -- Overall Coverage: 87%

### Traceability Matrix
- **REQ-login-001**: Successful login with valid credentials
  - Tests: TC-login-HP-001, TC-login-HP-002
  - Coverage: 100%
  - Gaps: --
- **REQ-login-002**: Invalid credentials error handling
  - Tests: TC-login-VE-001, TC-login-VE-002
  - Coverage: 100%
  - Gaps: --
- **REQ-login-003**: Account lockout after failed attempts
  - Tests: TC-login-SEC-001
  - Coverage: 75%
  - Gaps: Missing test for lockout timer expiry (unlock after 15 min)
- **REQ-login-004**: Keyboard and screen-reader accessibility
  - Tests: TC-login-A11Y-001
  - Coverage: 50%
  - Gaps: Missing ARIA live-region assertion for error messages

### Gap Analysis
- REQ-login-003 -- Priority: High, Recommended: Add TC for lockout expiry flow
- REQ-login-004 -- Missing: EC, Recommended: Add TC for error announcement via screen reader
