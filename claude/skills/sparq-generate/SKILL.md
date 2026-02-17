---
name: sparq:generate
description: "Generating both manual test cases AND automated E2E tests in a single pipeline. Combines requirements analysis, manual test generation, and E2E code generation. Use when: (1) creating complete test coverage for a feature, (2) generating manual tests and automated E2E together, (3) full QA pipeline from requirements to E2E code, (4) need both QA documentation and automation, (5) generating tests for multiple Jira tickets in batch."
audience: qa
---

# Generate Complete Test Suite (Manual + E2E)

Config, version check, pattern rules, and E2E code generation preamble per `claude/rules/skills.md`.

## Workflow

### Batch Mode

Accept multiple ticket IDs: `/sparq:generate EP-142 EP-143 EP-144`

- Process tickets sequentially (not parallel -- context budget constraint)
- Run Phase 0.5 (project discovery) ONCE, reuse for all tickets
- Each ticket gets independent P1 -> P2 -> P3 phases
- Per-ticket run summary after each ticket completes
- Aggregated batch summary after all tickets complete
- If any ticket fails: continue with remaining, report failures in batch summary
- Auto-deduplicate: if two tickets share requirements (same REQ IDs), generate tests once and reference from both
- Checkpoint level applies per-ticket (e.g., `fast` auto-approves P1/P2 for each ticket)

1. If no `.sparq/requirements/REQ-{feature}.md` exists, run `/sparq:analyze` first
2. **CHECKPOINT** -- Propose unified test plan: manual test categories with case counts, automatable vs manual-only split, priority distribution (P1/P2/P3/P4), E2E infrastructure needs (new page objects, fixtures), total manual cases, total E2E specs. **Wait for approval.**
3. Delegate to `sparq-manual-test-writer` agent with delegation context:
   - Requirements document path and parsed content
   - E2E Infrastructure Summary from config (existing page objects, components, fixtures, specs)
   - Tech stack info (`project.componentFileExtensions`)
   - Output format preference from config (`outputs.testCases.format`)
   - Use `preferences.locatorPriority` from config for selector strategy when suggesting selectors in test cases
   For >30 tests: split into parallel batches per `parallel-execution.md` Pattern 2 (pre-assign TC ID ranges, launch parallel Task agents).
   Check project E2E structure for existing test infrastructure; flag in 'Automation Status' field.
4. **CHECKPOINT** -- Present manual test cases for review. **Wait for confirmation.**
5. Scan E2E directories (from `e2e.structure.*` in config) for page objects, fixtures, helpers, auth patterns, test data strategies, framework config. Reuse everything possible; extend existing page objects rather than duplicating.
6. Delegate to `sparq-automation-engineer` agent with:
   - Manual test cases from step 3 as conversion input (S2 workflow)
   - Full config context: `project.componentFileExtensions`, `e2e`, `project.sourceRoot`, `project.routeDiscoveryPattern`, `preferences.locatorPriority`
   - E2E Infrastructure Summary
   For >30 tests: split into parallel batches per `parallel-execution.md` Pattern 2. For parallel batching (>30 tests), TC IDs are pre-assigned per `parallel-execution.md` Pattern 2 to prevent ID collisions.
7. **CHECKPOINT** -- Present generated E2E code for review. **Wait for approval.**
8. Phase 3: Smoke verify (`npx playwright test --list` or `npx tsc --noEmit`), present change summary, update coverage matrix, update test registry
9. Optionally export to TMS/Jira/Confluence via `/sparq:export`

**Chain**: requirements-analyst (if needed) -> manual-test-writer -> automation-engineer -> export (optional)

**Automatic chaining**: This skill executes S1 Phase 2 followed by S2 Phase 2 without a chain-offer checkpoint between them. The orchestrator marks the execution plan with `autoChain: true` to suppress the S1 completion chain offer.

## Test Categories

5 canonical categories (HP, VE, SEC, EC, A11Y) -- see `data-model.md` "Test Category Naming" for mapping and `test-generation-patterns.md` for per-category checklists.

## Browser Verification (Playwright MCP)

When `e2e.framework` is `playwright`: use Playwright MCP tools for navigation, DOM snapshots, interaction, and console/network inspection during debugging. See `mcp-tool-inventory.md` for full tool list. If unavailable, skip verification and note in output. See `degradation-strategy.md` for fallbacks.

## Fallback Behavior

Requirements phase: see `/sparq:analyze` fallback. Figma unavailable: grep source files for selectors. E2E runner unavailable: skip browser verification. Full details: `degradation-strategy.md`.

## Output Files

```
.sparq/test-cases/TC-{feature}-manual.md        # Manual test cases (markdown)
TMS export per tms-abstraction.md                # .xml (TestRail), .json (Qase/local)
{e2e.structure.pages}/{Feature}Page.ts           # Page Object Models
{e2e.structure.steps}/{feature}Steps.ts          # Reusable step functions
{e2e.structure.fixtures}/{feature}Fixture.ts     # Test fixtures and setup
{e2e.structure.specs}/{feature}.spec.ts          # E2E test specs
.sparq/coverage/coverage-matrix.md               # Coverage tracking (metadata)
.sparq/tracking/test-registry.json               # Test registry (metadata)
```

Manual test cases go to `.sparq/test-cases/`. E2E code is written directly to the project E2E directory per `e2e.structure.*` config. Git is the safety net for review (`git diff`) and revert (`git checkout`).

<done_criteria>
1. `sparq.config.json` read and validated; enabled sources and `e2e.structure.*` paths resolved
2. Manual test cases generated with unique `TC-{feature}-{ABBR}-{NNN}` IDs covering all 5 categories (HP/VE/SEC/EC/A11Y)
3. E2E specs generated and written to project test directory per `e2e.structure.*` config paths
4. Coverage matrix written to `.sparq/coverage/coverage-matrix.md` mapping every REQ ID to TC IDs
5. Smoke verify per `e2e.framework` (`npx playwright test --list` for Playwright, `npx cypress run --spec {path}` or `npx tsc --noEmit` for Cypress) passed without error
6. Batch mode: all tickets processed sequentially with shared P0.5, per-ticket summaries, and aggregated batch summary
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/test-generation-patterns.md`, `tms-abstraction.md`
- `.claude/skills/sparq-shared/references/data-model.md`
- `.claude/skills/sparq-shared/references/parallel-execution.md`
- `.claude/skills/sparq-shared/references/playwright-patterns.md`, `cypress-patterns.md`, `e2e-common-patterns.md`
- `.claude/skills/sparq-shared/references/pattern-adherence.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`
- `.claude/skills/sparq-shared/references/mcp-tool-inventory.md`

## Usage

```
/sparq:generate
```

Examples:
- `"Generate tests for EP-142"`
- `"Generate manual + E2E for login feature"`
- `"Create complete test coverage for PROJ-55 PROJ-56"`

## Example

```
/sparq:generate EP-14
-> gathers requirements -> writes .sparq/requirements/REQ-login.md
-> CHECKPOINT unified plan: 26 manual cases (5 categories), 18 automatable for E2E, 8 manual-only
-> delegates to manual-test-writer: generates 26 test cases across HP/VE/SEC/EC/A11Y
-> CHECKPOINT: review manual cases -> approved
-> scans e2e/ (auth fixture reusable, 2 existing page objects, baseURL from config)
-> delegates to automation-engineer: converts 18 automatable cases to Playwright
-> CHECKPOINT: review E2E code -> approved
-> smoke verify: npx playwright test --list PASSED
-> outputs: TC-login-manual.md, TMS export, LoginPage.ts, login.spec.ts, coverage-matrix.md
```

```
/sparq:generate EP-142 EP-143
-> Phase 0.5: project discovery (shared)
-> Ticket 1/2: EP-142 (Login)
   -> P1: 4 requirements -> P2: 14 manual + 10 E2E -> P3: smoke PASSED
-> Ticket 2/2: EP-143 (Dashboard)
   -> P1: 6 requirements -> P2: 18 manual + 12 E2E -> P3: smoke PASSED
-> Batch complete: 2 tickets, 32 manual tests, 22 E2E specs, 89% avg coverage
```
