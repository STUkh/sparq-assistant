# Test Generation Patterns

## Naming Conventions

**Test Case IDs**: `TC-{feature}-{ABBR}-{number}`
- `feature`: short kebab-case (`login`, `user-mgmt`, `dashboard`)
- `ABBR`: category abbreviation per `data-model.md` "Test Category Naming" (HP, VE, SEC, EC, A11Y)
- `number`: zero-padded 3-digit (`001`, `002`)
- Examples: `TC-login-HP-001`, `TC-login-VE-003`, `TC-user-mgmt-SEC-001`

**Requirement IDs**: `REQ-{feature}-{number}` (e.g., `REQ-login-001`)

**Section Names**: Group by feature area -- "Authentication", "User Management", "Form Validation", "Navigation"

## Category Checklists

### Happy Path (`HP`)

- [ ] Primary user flow start to completion
- [ ] All fields filled with valid data
- [ ] Successful submission and confirmation
- [ ] Correct redirect after completion
- [ ] Success message/toast displayed
- [ ] Data persisted (verify via UI or API)
- [ ] List/table updated after create/edit
- [ ] Navigation between related screens
- [ ] Default values pre-populated
- [ ] Multi-step flows complete all steps

### Validation Errors (`VE`)

**Per-field**: empty/blank, below min length, above max length, invalid format (email without @, phone with letters), boundary values (min-1, min, max, max+1), special characters (`<script>`, `'; DROP TABLE`, unicode), leading/trailing whitespace, SQL injection (`' OR 1=1 --`), XSS (`<img onerror=alert(1)>`)

**Form-level**: all fields empty, only required fields (should succeed), only optional fields (should fail), duplicate data (unique constraint), server-side validation errors displayed

### Security (`SEC`)

- [ ] Access without auth -> redirect to login
- [ ] Access with wrong role -> 403 or redirect
- [ ] Session expiry during form fill
- [ ] Direct URL to restricted resources
- [ ] API manipulation via dev tools
- [ ] CSRF token validation (if applicable)
- [ ] Sensitive data not in URL params
- [ ] Password fields masked, not in browser history
- [ ] Logout clears session, prevents back-button access
- [ ] Rate limiting on sensitive endpoints
- [ ] XSS prevention: check `project.componentFileExtensions` from `sparq.config.json` for framework-specific sanitization patterns

### Edge Cases (`EC`)

- [ ] Double-click prevention on submit
- [ ] Back button in multi-step flow
- [ ] Browser refresh during form fill (data preservation)
- [ ] Concurrent sessions (same user, multiple tabs)
- [ ] Network interruption during submission
- [ ] Browser resize / responsive layout
- [ ] Timeout scenarios
- [ ] Empty state (no data in lists/tables)
- [ ] Large data sets (pagination, scroll)
- [ ] Special characters in display names
- [ ] Rapid page navigation
- [ ] Invalid/oversized file upload (if applicable)

### Accessibility (`A11Y`)

**Keyboard**: Tab order logical, all interactive elements reachable, Enter/Space activates buttons/links, Escape closes modals/dialogs/dropdowns, Arrow keys navigate within components, no keyboard trap

**Screen reader**: Meaningful page title, hierarchical headings (h1>h2>h3), inputs have labels, errors announced, status changes announced, images have alt text

**Focus management**: Focus moves to dialog on open, trapped in modal, returns to trigger on close, visible focus indicator on all interactive elements. Check `project.componentFileExtensions` from `sparq.config.json` for framework-specific accessibility patterns.

**Visual**: Color not sole information conveyor, text contrast WCAG AA (4.5:1 normal, 3:1 large), usable at 200% zoom

### Performance (`PERF`) -- Optional Extended Category

Optional beyond the core 5 (HP, VE, SEC, EC, A11Y). Generated only when explicitly requested. Not part of `TestCase.type` union — uses `tag: 'performance'` for filtering. Excluded from standard coverage calculations.

**Checklist** (when requested):
- [ ] Page load under threshold (e.g., 3s)
- [ ] List/table renders in acceptable time for expected volume
- [ ] Search/filter responds within 500ms
- [ ] No memory leaks during repeated navigation
- [ ] Lazy loading for off-screen content
- [ ] API calls within timeout limits

## Priority Assignment

**P1 Critical** (TestCase.priority=1): Core blocking business flow, data integrity (CRUD primary entities), auth/authorization, security vulnerabilities, payment/financial ops

**P2 High** (priority=2): Daily workflow functionality, common user paths, required field validation, primary screen navigation, common error handling

**P3 Medium** (priority=3): Secondary flows, unlikely but impactful edge cases, accessibility compliance, normal-condition performance, optional features

**P4 Low** (priority=4): Cosmetic/visual-only, rarely-used paths, tooltip/help text, browser-specific quirks, nice-to-have UX

## Bug Ticket Input Mode (S3)

When the orchestrator detects a bug ticket as input (repro steps + actual vs expected behavior), S3 activates bug mode:

- **REG- ID format**: `REG-{ticket}-{NNN}` must appear in the `test.describe` title (e.g., `test.describe('REG-BUG-142-001: LoginForm silent failure on empty email', ...)`)
- **Inline append**: orchestrator fuzzy-matches `affectedComponent` to an existing spec file — automation-engineer appends to that file
- **Inline comment**: add a comment above the describe block: `// Regression: {TICKET-ID} — {bug title}`
- **No `@regression` tag, no JSDoc block**
- **Single `test.describe` per bug invocation**
- **Reuse existing page objects** — extend with new methods as needed, never create duplicate POs
- **Repro steps to test actions**: 1:1 mapping where possible — each repro step becomes a test action
- **Filter regression tests**: `npx playwright test --grep "REG-"`

## Coverage Targets

- P1 Critical: 100% automated
- P2 High: 90%+ automated
- P3 Medium: 70%+ automated
- P4 Low: Manual testing acceptable
