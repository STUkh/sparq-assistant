# Requirements: {Feature Name}

## Metadata
- **Generated**: {timestamp}
- **Sources**: {list with links}
- **Scenario**: {1|2|3|standalone}

## Sources
- **SRC-J** Jira {reference} -- {Fetched|Read|Skipped|Failed}
- **SRC-C** Confluence {reference} -- {Fetched|Read|Skipped|Failed}
- **SRC-F** Figma {reference} -- {Fetched|Read|Skipped|Failed}
- **SRC-L** Local {reference} -- {Fetched|Read|Skipped|Failed}

## User Journey
- **Happy Path**: User navigates to {URL} → enters {field} → clicks {button} → system responds with {outcome}
- **Alternative Paths**: {path description}
- **Error Paths**: {error scenario}

## Requirements
- **REQ-{feature}-{NNN}** ({priority}, {category}, {source refs}): {description}

Priority: Critical | High | Medium | Low
Category: Functional | Validation | UI | Security | Accessibility | Performance

## UI Elements
- **{name}** ({type}, {screen}): `{selector based on preferences.locatorPriority}`

## Acceptance Criteria Format
Each requirement's acceptance criteria should follow Given/When/Then format:
- **Given** {precondition} **When** {action} **Then** {expected result}

## Edge Cases
- **EC{N}** ({req ref}, {inferred|explicit}): {description}

## Open Questions
- **Q{N}** ({blocking|non-blocking}): {question} ({context})

## Example

> Login feature for Jira ticket EP-142

### Metadata
- **Generated**: 2026-02-13T10:30:00Z
- **Sources**: Jira EP-142, Confluence "Auth Spec v3"
- **Scenario**: 1+2

### Sources
- **SRC-J** Jira EP-142 -- Fetched
- **SRC-C** Confluence "Auth Spec v3" -- Fetched
- **SRC-F** Figma -- Skipped
- **SRC-L** Local -- Skipped

### Requirements
- **REQ-login-001** (Critical, Functional, SRC-J): User can log in with valid email and password. **Given** user is on /login **When** they enter `test.user@example.com` / `P@ssw0rd123!` and click "Sign In" **Then** they are redirected to /dashboard with a session cookie set.
- **REQ-login-002** (High, Validation, SRC-J): System shows inline error for invalid credentials. **Given** user is on /login **When** they enter `bad@example.com` / `wrong` and click "Sign In" **Then** an error "Invalid email or password" appears and no redirect occurs.
- **REQ-login-003** (High, Security, SRC-C): Account locks after 5 consecutive failed login attempts. **Given** user has failed login 4 times **When** they fail a 5th time **Then** account is locked for 15 minutes and a lockout message is displayed.
- **REQ-login-004** (Medium, Accessibility, SRC-C): Login form is fully keyboard-navigable and screen-reader compatible. **Given** user navigates with Tab key **When** they reach each form field **Then** focus is visible and aria-labels are announced.
