---
name: sparq:generate-e2e
description: "Generate automated E2E tests from scratch for a feature or bug ticket (Playwright or Cypress per config). Combines requirements analysis with automated test generation. Use when: (1) creating E2E tests for a new feature, (2) generating E2E tests from Jira ticket, (3) building automation suite from requirements, (4) creating a regression test from a bug ticket — orchestrator auto-detects and applies REG- IDs + inline-append behavior."
audience: qa
---

# Generate Automated E2E Tests from Scratch

Config, version check, pattern rules, and E2E code generation preamble per `claude/rules/skills.md`.

## Workflow

> **Before generation starts**: SparQ will scan your codebase for components, routes, and test IDs to assess if it has enough structure for E2E tests. If your codebase is new or incomplete, you will be offered options (placeholder selectors, manual-only fallback, or defer) before any code is generated.

1. Run `/sparq:analyze` with provided input (Jira ID, URL, or description). Reuse existing `.sparq/requirements/REQ-{feature}.md` if present.
2. **CHECKPOINT** -- Present test strategy: automatable tests (list), manual-only tests, priority order, dependencies (auth/data/mocks), estimated effort (specs, page objects, helpers), reusable vs new infrastructure. **Wait for approval.**

> **Non-interactive mode**: When `preferences.interactiveMode` is `false`, checkpoints are auto-approved except when Critical findings or smoke failures occur. See orchestrator Checkpoint Policy.

3. Scan E2E directories (from `e2e.structure.*` in config) for page objects, fixtures, helpers, auth patterns, test data strategies, framework config. Reuse everything possible; extend existing page objects rather than duplicating.
4. **CHECKPOINT** -- Delegate to `sparq-automation-engineer` agent with full config context: `project.componentFileExtensions`, `e2e`, `project.sourceRoot`, `project.routeDiscoveryPattern`, `preferences.locatorPriority`. For >30 tests: split into parallel batches per `parallel-execution.md` Pattern 2. For parallel batching (>30 tests), TC IDs are pre-assigned per `parallel-execution.md` Pattern 2 to prevent ID collisions. For S3 with manual companion: launch automation-engineer + manual-test-writer as dual-agent per Pattern 4. Generate E2E test code matching configured framework. Present for review. **Wait for approval.**
5. Optionally: run tests with the configured framework's CLI, debug with Playwright CLI tools (when `e2e.framework` is `playwright`). Files are already in the project E2E directory.
6. **Optional lint check**: After smoke verify passes, offer `sparq lint {e2e-directory}/` to validate generated files against 8 deterministic code-quality rubrics (locator quality, flaky patterns, assertion coverage, naming conventions). Instant, CI-compatible, zero model inference.

**Chain**: requirements-analyst -> automation-engineer

**Optional support**: For features with complex manual-only test cases, `sparq-manual-test-writer` agent can generate companion manual test documentation alongside the automated suite.

## Bug Ticket Input

When a bug ticket is provided instead of a feature ticket, the orchestrator activates S3 bug mode:
- The orchestrator appends a single `test.describe` block with `REG-{ticket}-{NNN}` in the title to the closest matching existing feature spec
- No separate regression folder is created — the regression test lives inline in the feature spec
- Existing page objects are reused and extended with new methods as needed
- See `test-generation-patterns.md` "Bug Ticket Input Mode (S3)" for full conventions

## Browser Verification (Playwright CLI)

When `e2e.framework` is `playwright`: use Playwright CLI for screenshots, accessibility snapshots, and inline verification scripts during debugging (e.g., `npx playwright screenshot <url> --output=<path>`). See `playwright-cli-tools.md` for full tool reference. If unavailable, skip verification and note in output. See `degradation-strategy.md` for fallbacks. Not available for Cypress; skip silently.

## Fallback Behavior

Requirements phase: see `/sparq:analyze` fallback. Figma unavailable: grep source files for selectors. E2E runner unavailable: skip browser verification. Full details: `degradation-strategy.md`.

## Priority Guidelines

Priority mapping: see `test-generation-patterns.md` section 'Priority Mapping'.

## Output

```
{e2e.structure.pages}/{Feature}Page.ts        # Page Object Models
{e2e.structure.steps}/{feature}Steps.ts        # Reusable step functions
{e2e.structure.fixtures}/{feature}Fixture.ts   # Test fixtures and setup
{e2e.structure.specs}/{feature}.spec.ts        # E2E test specs
.sparq/coverage/coverage-matrix.md             # Coverage tracking (metadata)
.sparq/tracking/test-registry.json             # Test registry (metadata)
```

Files are written directly to the project E2E directory per `e2e.structure.*` config. Existing files are edited in-place. Git is the safety net for review (`git diff`) and revert (`git checkout`).

<done_criteria>
1. `sparq.config.json` read and validated; `e2e.structure.*` paths and `project.componentFileExtensions` settings resolved
2. E2E spec files written to project test directory per `e2e.structure.*` config (specs, pages, fixtures)
3. Smoke verify per `e2e.framework` (`npx playwright test --list` for Playwright, `npx cypress run --spec {path}` or `npx tsc --noEmit` for Cypress) passed without error
4. Barrel `index.ts` exports updated for every new page object, fixture, and step file
5. Existing page objects and fixtures reused where applicable (no duplicated infrastructure)
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/playwright-patterns.md`, `cypress-patterns.md`, `e2e-common-patterns.md`, `test-generation-patterns.md`
- `.claude/skills/sparq-shared/references/pattern-adherence.md`
- `.claude/skills/sparq-shared/references/parallel-execution.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`
- `.claude/skills/sparq-shared/references/playwright-cli-tools.md`

## Usage

```
/sparq:generate-e2e
```

Examples:
- `"Generate E2E tests for EP-142"`
- `"Create Playwright tests for the login feature"`
- `"Build E2E automation suite from Jira ticket PROJ-55"`

## Example

```
/sparq:generate-e2e EP-14
-> gathers requirements -> writes .sparq/requirements/REQ-login.md
-> CHECKPOINT strategy: 12 P1 + 8 P2 automatable, 6 manual-only, 1 page object + 1 fixture
-> scans e2e/ (auth fixture reusable, baseURL from config)
-> CHECKPOINT: 20 tests in 3 files (LoginPage.ts, login.spec.ts, loginFixture.ts)
-> writes files directly to project E2E directory per e2e.structure.* config
-> optionally verifies via Playwright CLI (when e2e.framework is playwright)
-> output: e2e/pages/LoginPage.ts, e2e/specs/login.spec.ts, e2e/fixtures/loginFixture.ts
```
