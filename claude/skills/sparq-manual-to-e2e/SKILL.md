---
name: sparq:manual-to-e2e
description: "Convert manual test cases into automated E2E tests. Use when: (1) automating existing manual tests, (2) transforming TMS test cases to E2E tests, (3) automating a manual test suite, (4) converting TestRail or Qase test cases to Playwright E2E via MCP. Accepts test cases as text, file path, TMS reference (TestRail XML, Qase JSON, local JSON), CSV export, or live TMS connection (TestRail MCP, Qase MCP)."
audience: qa
---

# Manual to E2E — Convert Manual Tests to Automated E2E Tests

Config, version check, pattern rules, and E2E code generation preamble per `claude/rules/skills.md`.

## Workflow

1. Parse manual test cases from input:
   - **Sparq markdown**: path contains `.sparq/test-cases/`
   - **TestRail XML**: `<sections>` root element
   - **Qase JSON**: `{"cases":[...]}` or `.sparq/tms-export/TC-{feature}-qase.json`
   - **Local JSON**: `.sparq/tms-export/` directory with `test-cases.json`
   - **TestRail CSV**: headers include `Title`, `Steps`, `Expected Result` (exported from TestRail > Export > CSV)
   - **Inline text**: numbered steps with expected results
   - **TestRail MCP**: user provides TestRail project/suite reference. Fetch via `mcp__testrail__get_sections` + `mcp__testrail__get_cases`. Requires `inputs.tms.testrail` or `outputs.tms.testrail` config.
   - **Qase MCP**: user provides Qase project/suite reference. Fetch via `mcp__qase__list_suites` + `mcp__qase__list_cases`. Requires `inputs.tms.qase` or `outputs.tms.qase` config.
   - Extract: test ID, title, preconditions, steps, expected results
1.5. **TMS Read (when input is MCP-based)**:
   - Resolve provider: user-specified > `inputs.tms.provider` > `outputs.tms.provider` (fallback)
   - Normalize to SparQ format, write `.sparq/test-cases/TC-{feature}-tms-import.md`
   - Cases with no steps (`custom_steps_separated: null` or `steps: []`): set `automationStatus: "not_automatable"`, include in markdown but skip E2E generation
   - If MCP fails: prompt for file export per `degradation-strategy.md`
2. Scan E2E directories (per `e2e.structure.*` from config) for existing page objects, helpers, fixtures, auth setup, naming conventions. Reuse -- never duplicate infrastructure.
3. If Figma MCP available and enabled: match UI elements to Figma components, extract `data-testid` values, map layers to DOM structure. If Figma MCP is unavailable, selectors are derived from codebase grep for `data-testid` attributes per `degradation-strategy.md`.
4. **CHECKPOINT** -- Clarify ambiguities: test data requirements, auth needs, unresolved UI elements, API mocking vs real backend. **Wait for answers.**
5. **CHECKPOINT** -- Delegate to `sparq-automation-engineer` agent with tech context: `project.componentFileExtensions`, `e2e`, `project.sourceRoot`, `project.routeDiscoveryPattern`, `preferences.locatorPriority`. Present generated code. **Wait for approval.**
6. Optionally verify with Playwright MCP browser (see "Verification via Playwright MCP" below)

**Delegation**: sparq-automation-engineer agent (with full tech context from config)

## Browser Verification (Playwright MCP)

When `e2e.framework` is `playwright`: navigate to target URL, snapshot DOM to verify selectors, screenshot for visual confirmation. See `mcp-tool-inventory.md` for tools. If unavailable, skip and note: `"[sparq] Browser verification skipped -- Playwright MCP unavailable or E2E framework is not Playwright"`.

## Output

```
{e2e.structure.pages}/{Feature}Page.ts        # Page Object Models
{e2e.structure.steps}/{feature}Steps.ts        # Reusable step helpers
{e2e.structure.specs}/{feature}.spec.ts        # E2E test specs
.sparq/coverage/coverage-matrix.md             # Coverage tracking (metadata)
.sparq/tracking/test-registry.json             # Test registry (metadata)
```

Files are written directly to the project E2E directory per `e2e.structure.*` config. Existing files are edited in-place. Git is the safety net for review (`git diff`) and revert (`git checkout`).

Generated specs follow project conventions from step 2. If no existing patterns, use standard conventions for the configured `e2e.framework` (e.g., `test.describe`/`test` with `@playwright/test` for Playwright, `describe`/`it` with Cypress). For Cypress: import commands from project support file, use `cy.session()` for auth, and follow `cypress-patterns.md` conventions.

<done_criteria>
1. `sparq.config.json` read and validated; `e2e.structure.*` paths and TMS input config resolved
2. Manual test cases parsed from input source (file, TMS MCP, inline text, or CSV) with test IDs, steps, and expected results extracted
3. E2E spec files generated with unique TC IDs and written to project test directory per `e2e.structure.*` config
4. Smoke verify per `e2e.framework` (`npx playwright test --list` for Playwright, `npx cypress run --spec {path}` or `npx tsc --noEmit` for Cypress) passed without error
5. Barrel `index.ts` exports updated for every new page object, fixture, and step file
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/playwright-patterns.md`, `cypress-patterns.md`, `e2e-common-patterns.md`
- `.claude/skills/sparq-shared/references/data-model.md`
- `.claude/skills/sparq-shared/references/test-generation-patterns.md`
- `.claude/skills/sparq-shared/references/pattern-adherence.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`
- `.claude/skills/sparq-shared/references/mcp-tool-inventory.md`
- `.claude/skills/sparq-shared/references/testrail-formats.md`
- `.claude/skills/sparq-shared/references/qase-formats.md`
- `.claude/skills/sparq-shared/references/tms-abstraction.md`
- `.claude/skills/sparq-shared/references/config-schema.md`
- `.claude/skills/sparq-shared/references/error-handling.md`

## Usage

```
/sparq:manual-to-e2e
```

Examples:
- `"Convert manual tests at .sparq/test-cases/TC-login.md to E2E"`
- `"Automate my manual test cases from TestRail"`
- `"Turn these manual tests into Playwright specs"`

## Example

```
/sparq:manual-to-e2e .sparq/test-cases/TC-login-manual.md
-> parses 26 cases, scans e2e/ (3 page objects, auth fixture, 2 helpers)
-> enriches selectors from Figma
-> CHECKPOINT: 2 clarifications needed (admin role setup, edge case data)
-> generates LoginPage.ts + login.spec.ts (18 automated, 8 skipped manual-only)
-> writes files directly to project E2E directory per e2e.structure.* config
-> verifies selectors via Playwright MCP browser snapshot (when e2e.framework is playwright)
-> output: e2e/pages/LoginPage.ts, e2e/specs/login.spec.ts
```

```
/sparq:manual-to-e2e --from testrail --project 1 --suite 42
-> fetches 8 cases from TestRail via MCP, normalizes to SparQ format
-> generates AuthPage.ts + auth.spec.ts (7 automated, 1 skipped: no steps)
```

```
/sparq:manual-to-e2e --from qase --project PROJ
-> fetches 6 cases from Qase via MCP, normalizes to SparQ format
-> generates AuthPage.ts + auth.spec.ts (5 automated, 1 skipped: no steps)
```
