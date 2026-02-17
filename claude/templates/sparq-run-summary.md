## SparQ Run Complete

- **Feature:** {feature name} ({source reference})
- **Workflow:** {human-readable workflow description}

### Results

| Metric | Count |
|--------|-------|
| Requirements | {N} (from {sources}) |
| Manual tests | {N} (→ {output path}) |
| E2E tests | {N} (→ {output path}) |
| Page objects | {N} created/modified |
| Coverage | {percentage}% of requirements |
| Gaps | {N} ({details or "None"}) |

### Flow Metrics

| Metric | Value |
|--------|-------|
| Time to first artifact | {N}s |
| Clarification turns | {N} |
| Fallbacks triggered | {N} |
| Checkpoints shown | {N} |
| First-pass success | {yes/no} |

### Files Created/Modified

{list of files with + for new, ~ for modified}

### Traceability

{compact REQ -> TC mapping, one line per requirement}

> **Categories**: HP = Happy Path | VE = Validation & Error | SEC = Security | EC = Edge Case | A11Y = Accessibility

### Test Quality Score

<!-- Composite score computed by orchestrator from handoff data. See data-model.md QualityScore. -->

| Metric | Score | Detail |
|--------|-------|--------|
| **Total** | **{score}/100** | |
| Coverage (40%) | {n}/100 | {covered}/{total} requirements |
| Categories (20%) | {n}/100 | {n}/5 categories represented |
| Assertions (15%) | {n}/100 | avg {n} per test |
| Patterns (15%) | {n}/100 | {detail} |
| Selectors (10%) | {n}/100 | {n}% testid/role, {n}% CSS |

### Understanding Your Results

- **Coverage {percentage}%** means {covered}/{total} requirements have at least one test
- **Gaps** (if any): requirements without test coverage -- consider adding targeted tests
- **Quality Score**: 80+ = excellent, 60-79 = good, below 60 = needs improvement
- **Low coverage categories**: any category with fewer than 2 tests may need expansion

### Next Steps

**Recommended Next Action:** {single best next step with command/path}

<!-- Conditional suggestions based on completed workflow. Include file paths. -->
<!-- After generation (S1/S1+S2): -->
- Run your new tests: `npx playwright test {spec-files}`
- Convert manual tests to E2E: `/sparq:manual-to-e2e`
<!-- After validation (S4): -->
- Sync with latest requirements: `/sparq:sync {ticket-id}`
<!-- After sync (S5): -->
- Check for UI drift: `/sparq:validate {test-path}`
<!-- After regression (S6): -->
- Run regression test: `npx playwright test {spec-file} --grep @regression`
<!-- Always available: -->
- Export results: `/sparq:export`
- Start new workflow: `/sparq:start`

### Batch Summary (multi-ticket only)

<!-- Include only when processing multiple tickets via batch mode. -->

- **Tickets processed:** {completed}/{total} ({failed} failed)
- **Totals:** {N} manual tests, {N} E2E specs, {avg}% avg coverage
- Per-ticket breakdown:
  - {ticket-1}: {N} manual, {N} E2E, {coverage}% coverage
  - {ticket-2}: {N} manual, {N} E2E, {coverage}% coverage
- **Failed tickets** (if any): {ticket-id}: {reason}

## Example

> S1+S2 Run Summary for Login feature, Jira EP-142

### SparQ Run Complete

- **Feature:** Login (EP-142)
- **Workflow:** Unified Generate -- Manual test cases + E2E automation

#### Results

| Metric | Count |
|--------|-------|
| Requirements | 4 (from Jira, Confluence) |
| Manual tests | 14 (-> `.sparq/test-cases/TC-login-manual.md`) |
| E2E tests | 10 (-> `e2e/specs/login.spec.ts`) |
| Page objects | 1 created (`e2e/pages/login.page.ts`) |
| Coverage | 87% of requirements |
| Gaps | 1 (REQ-login-004 partial -- missing ARIA assertion) |

#### Files Created/Modified

- + `e2e/specs/login.spec.ts`
- + `e2e/pages/login.page.ts`
- + `.sparq/test-cases/TC-login-manual.md`
- + `.sparq/requirements/REQ-login.md`
- ~ `e2e/pages/index.ts` (barrel export updated)

#### Traceability

- REQ-login-001 (Valid login) -> TC-login-HP-001, TC-login-HP-002
- REQ-login-002 (Invalid creds) -> TC-login-VE-001, TC-login-VE-002
- REQ-login-003 (Account lockout) -> TC-login-SEC-001
- REQ-login-004 (Accessibility) -> TC-login-A11Y-001 (partial)

#### Test Quality Score

| Metric | Score | Detail |
|--------|-------|--------|
| **Total** | **82/100** | |
| Coverage (40%) | 87/100 | 3.5/4 requirements |
| Categories (20%) | 100/100 | 5/5 categories |
| Assertions (15%) | 70/100 | avg 3.5 per test |
| Patterns (15%) | 85/100 | page objects reused |
| Selectors (10%) | 80/100 | 90% testid, 10% CSS |

#### Next Steps

- Run your new tests: `npx playwright test e2e/specs/login.spec.ts`
- Convert remaining manual tests to E2E: `/sparq:manual-to-e2e`
- Export results: `/sparq:export`
- Start new workflow: `/sparq:start`
