# Test Cases: Login

**Generated:** 2025-01-15T12:00:00Z | **Source:** Jira / Confluence
**Total:** 12 | **Coverage:** 92%

---

## Summary

| Category | Count | P1 | P2 | P3 |
|----------|-------|----|----|-----|
| Happy Path | 3 | 1 | 2 | 0 |
| Validation | 3 | 1 | 1 | 1 |
| Security | 2 | 1 | 1 | 0 |
| Edge Cases | 2 | 0 | 1 | 1 |
| Accessibility | 2 | 0 | 1 | 1 |

---

## Test Cases

### Happy Path

#### TC-login-HP-001: Successful login with valid email and password

**Priority:** P1 | **Type:** Happy Path | **Auto:** automatable | **Reqs:** REQ-login-001

**Preconditions:**
- User has a registered account with email `test.user@example.com` and password `P@ssw0rd123!`
- User is not currently logged in

- Steps:
  1. Navigate to /login -> Login page is displayed with email and password fields | Data: URL: /login
  2. Enter email address -> Email field accepts input | Data: test.user@example.com
  3. Enter password -> Password field accepts input and masks characters | Data: P@ssw0rd123!
  4. Click "Sign In" button -> User is redirected to /dashboard with welcome toast | Data: N/A

**Tags:** `smoke`, `login`, `authentication`

---

#### TC-login-HP-002: Successful login with Remember Me enabled

**Priority:** P2 | **Type:** Happy Path | **Auto:** automatable | **Reqs:** REQ-login-002

**Preconditions:**
- User has a registered account
- User is not currently logged in

- Steps:
  1. Navigate to /login -> Login page is displayed | Data: URL: /login
  2. Enter valid email and password -> Fields accept input | Data: test.user@example.com / P@ssw0rd123!
  3. Check "Remember Me" checkbox -> Checkbox is selected | Data: N/A
  4. Click "Sign In" button -> User is redirected to /dashboard | Data: N/A
  5. Close browser and reopen after 24 hours -> Session is still active, user lands on /dashboard | Data: N/A

**Tags:** `login`, `session`, `remember-me`

---

#### TC-login-HP-003: Successful login via social provider (Google OAuth)

**Priority:** P2 | **Type:** Happy Path | **Auto:** automatable | **Reqs:** REQ-login-003

**Preconditions:**
- User has a Google account linked to the application
- User is not currently logged in

- Steps:
  1. Navigate to /login -> Login page is displayed with social login buttons | Data: URL: /login
  2. Click "Sign in with Google" button -> Google OAuth consent screen is displayed | Data: N/A
  3. Authorize the application on Google -> User is redirected back to /dashboard | Data: Google account credentials

**Tags:** `login`, `oauth`, `social-login`

---

### Validation / Error Handling

#### TC-login-VE-001: Login attempt with incorrect password

**Priority:** P1 | **Type:** Validation | **Auto:** automatable | **Reqs:** REQ-login-004

**Preconditions:**
- User has a registered account with email `test.user@example.com`
- User is not currently logged in

- Steps:
  1. Navigate to /login -> Login page is displayed | Data: URL: /login
  2. Enter valid email address -> Email field accepts input | Data: test.user@example.com
  3. Enter incorrect password -> Password field accepts input | Data: WrongPassword!
  4. Click "Sign In" button -> Error message "Invalid email or password" is displayed below the form | Data: N/A
  5. Verify email field retains entered value -> Email field still shows entered email | Data: N/A

**Tags:** `login`, `validation`, `negative`

---

#### TC-login-VE-002: Login attempt with empty fields

**Priority:** P2 | **Type:** Validation | **Auto:** automatable | **Reqs:** REQ-login-005

**Preconditions:**
- User is on the login page

- Steps:
  1. Navigate to /login -> Login page is displayed | Data: URL: /login
  2. Leave email and password fields empty -> Fields are empty | Data: N/A
  3. Click "Sign In" button -> Inline validation errors appear for both fields | Data: N/A
  4. Verify email field shows "Email is required" -> Validation message is visible | Data: N/A
  5. Verify password field shows "Password is required" -> Validation message is visible | Data: N/A

**Tags:** `login`, `validation`, `empty-fields`

---

#### TC-login-VE-003: Login attempt with locked account

**Priority:** P3 | **Type:** Validation | **Auto:** automatable | **Reqs:** REQ-login-006

**Preconditions:**
- User account has been locked due to 5 consecutive failed login attempts

- Steps:
  1. Navigate to /login -> Login page is displayed | Data: URL: /login
  2. Enter email of the locked account -> Email field accepts input | Data: locked.user@example.com
  3. Enter correct password -> Password field accepts input | Data: P@ssw0rd123!
  4. Click "Sign In" button -> Error message "Account locked. Please contact support or try again later." is displayed | Data: N/A

**Tags:** `login`, `validation`, `account-lockout`

---

### Security

#### TC-login-SEC-001: Brute force protection activates after failed attempts

**Priority:** P1 | **Type:** Security | **Auto:** automatable | **Reqs:** REQ-login-007

**Preconditions:**
- User has a registered account
- Account is not currently locked

- Steps:
  1. Navigate to /login -> Login page is displayed | Data: URL: /login
  2. Enter valid email address -> Email field accepts input | Data: test.user@example.com
  3. Enter incorrect password and click Sign In — repeat 5 times -> Error message shown each time | Data: Wrong1!, Wrong2!, Wrong3!, Wrong4!, Wrong5!
  4. Attempt a 6th login with correct password -> Error message "Account locked. Please contact support or try again later." is displayed | Data: P@ssw0rd123!
  5. Verify account lockout is logged -> Audit log contains lockout event | Data: N/A

**Tags:** `login`, `security`, `brute-force`

---

#### TC-login-SEC-002: Session timeout after period of inactivity

**Priority:** P2 | **Type:** Security | **Auto:** automatable | **Reqs:** REQ-login-008

**Preconditions:**
- User is logged in and on the dashboard

- Steps:
  1. Log in with valid credentials -> User is on /dashboard | Data: test.user@example.com / P@ssw0rd123!
  2. Wait for 30 minutes without any interaction -> Session timer expires | Data: N/A
  3. Attempt to navigate to a protected page -> User is redirected to /login with message "Session expired" | Data: URL: /settings
  4. Verify session cookie is invalidated -> Cookie is removed or expired | Data: N/A

**Tags:** `login`, `security`, `session-timeout`

---

### Edge Cases

#### TC-login-EC-001: Concurrent sessions from multiple devices

**Priority:** P2 | **Type:** Edge Case | **Auto:** automatable | **Reqs:** REQ-login-009

**Preconditions:**
- User has a registered account
- Maximum concurrent sessions is configured to 3

- Steps:
  1. Log in from Device A (desktop browser) -> Login succeeds, session created | Data: test.user@example.com / P@ssw0rd123!
  2. Log in from Device B (mobile browser) -> Login succeeds, second session created | Data: Same credentials
  3. Log in from Device C (tablet browser) -> Login succeeds, third session created | Data: Same credentials
  4. Log in from Device D (another browser) -> Oldest session (Device A) is terminated, new session created | Data: Same credentials
  5. Verify Device A session is invalidated -> Navigating on Device A redirects to /login | Data: N/A

**Tags:** `login`, `edge-case`, `concurrent-sessions`

---

#### TC-login-EC-002: Login with special characters in password

**Priority:** P3 | **Type:** Edge Case | **Auto:** automatable | **Reqs:** REQ-login-010

**Preconditions:**
- User has a registered account with a password containing special characters

- Steps:
  1. Navigate to /login -> Login page is displayed | Data: URL: /login
  2. Enter valid email address -> Email field accepts input | Data: special.user@example.com
  3. Enter password with special characters -> Password field accepts input | Data: P@ss<w0rd>&"test"
  4. Click "Sign In" button -> User is logged in and redirected to /dashboard | Data: N/A
  5. Verify no encoding issues in the request -> Credentials are sent correctly in the POST body | Data: N/A

**Tags:** `login`, `edge-case`, `special-characters`

---

### Accessibility

#### TC-login-A11Y-001: Full keyboard navigation of login form

**Priority:** P2 | **Type:** Accessibility | **Auto:** automatable | **Reqs:** REQ-login-011

**Preconditions:**
- User is on the login page
- No mouse or pointer device is used

- Steps:
  1. Press Tab -> Focus moves to the email input field with visible focus ring | Data: N/A
  2. Type email address -> Email is entered in the focused field | Data: test.user@example.com
  3. Press Tab -> Focus moves to the password input field | Data: N/A
  4. Type password -> Password is entered and masked | Data: P@ssw0rd123!
  5. Press Tab -> Focus moves to the "Remember Me" checkbox | Data: N/A
  6. Press Space -> Checkbox is toggled on | Data: N/A
  7. Press Tab -> Focus moves to the "Sign In" button | Data: N/A
  8. Press Enter -> Form is submitted and user is redirected to /dashboard | Data: N/A

**Tags:** `login`, `accessibility`, `keyboard-navigation`

---

#### TC-login-A11Y-002: Screen reader announces form fields and errors

**Priority:** P3 | **Type:** Accessibility | **Auto:** automatable | **Reqs:** REQ-login-012

**Preconditions:**
- Screen reader is enabled (e.g., NVDA, VoiceOver)
- User is on the login page

- Steps:
  1. Navigate to email field -> Screen reader announces "Email, edit text, required" | Data: N/A
  2. Navigate to password field -> Screen reader announces "Password, edit text, required" | Data: N/A
  3. Submit form with empty fields -> Screen reader announces error messages via aria-live region | Data: N/A
  4. Verify all form fields have associated labels -> Each input has a visible or aria-label | Data: N/A
  5. Verify error messages are associated with fields -> Each error uses aria-describedby linked to its field | Data: N/A

**Tags:** `login`, `accessibility`, `screen-reader`
