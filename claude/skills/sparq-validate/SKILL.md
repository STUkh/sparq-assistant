---
name: sparq:validate
description: "Validating existing E2E tests against current UI, codebase, and designs. Detecting broken selectors, stale flows, UI drift, and technical freshness issues. Use when: (1) tests exist but may be outdated, (2) after UI refactoring, (3) periodic health checks, (4) checking if tests still match current state."
audience: qa
---

# Validate Existing Tests

Config, version check, pattern rules, and E2E code generation preamble per `claude/rules/skills.md`. Additionally: grep `{project.sourceRoot}/` for `data-testid`, labels, route definitions. Read `validation-checklist.md` and `pattern-adherence.md` before scanning.

## Purpose

Validate existing E2E tests for UI drift, stale selectors, broken flows, and technical freshness. This skill focuses exclusively on whether tests match the **current state** of the UI and codebase -- it does not handle requirement changes (use `/sparq:sync` for that).

## When NOT to Use

- If **requirements changed** (new acceptance criteria, updated specs, Jira ticket updated): use `/sparq:sync` instead — it performs diff analysis against updated requirements.
- `/sparq:validate` checks for **UI/codebase drift** (broken selectors, stale flows, API changes) — it validates tests against the current state of the application, not against changed requirements.

## When to Use

- Tests exist but may be outdated after UI changes
- After a UI refactoring or component library update
- Periodic health checks on test suite freshness
- Checking if selectors, flows, and assertions still match current state
- Before a release to verify test technical validity

## Workflow

1. **Scan test files**: Read test files from specified path or defaults (E2E directories per `e2e.structure.*` from config). Parse each to extract: selectors, URLs, expected text, flow sequences, assertions.
2. **Fetch current UI state** in parallel from available sources (skip unavailable; codebase always works). For >10 test files: launch parallel validation checks per `parallel-execution.md` Pattern 3 (up to 6 Task agents). For <=10 files: run checks sequentially.
   - **Figma**: component names, layout, text content, element hierarchy
   - **Codebase**: component files (using `project.componentFileExtensions`), `data-testid` attrs, route definitions (using `project.routeDiscoveryPattern`)
   - **Live browser**: actual rendered DOM, element visibility (Playwright CLI, when `e2e.framework` is `playwright`). Not available for Cypress; skip silently.
3. **Compare and detect mismatches**:
   - Selector drift: `data-testid` removed/renamed in source
   - Flow changes: steps reference removed pages/routes
   - UI text mismatches: assertion text differs from Figma/codebase
   - Deprecated patterns: tests using old utilities/removed helpers
   - Dead tests: tests for removed features
   - New untested features: new components/routes without test coverage
   - Performance regressions: tests with excessive waits or redundant steps
4. **Delegate findings** to sparq-test-validator agent for classification (pass tech context: `project.componentFileExtensions`, `e2e`, `project.sourceRoot`, `project.routeDiscoveryPattern`, `preferences.locatorPriority`)
5. **Apply deterministic fixes** automatically (selector renames, import path updates) with checkpoint before applying
6. **Report non-deterministic issues** with recommendations for manual resolution

## Severity Levels

- **Critical**: test will fail (broken selector, removed route, deleted component)
- **Warning**: test may fail (renamed text, changed flow, fragile selector)
- **Info**: style/best practice (deprecated pattern, missing assertion, performance suggestion)

## Output

```
.sparq/validation/validation-report.md
```

Report includes: VF-{n} IDs for each finding, severity classification, auto-fix proposals for Critical findings, recommendations for Warning/Info findings.

## Fallback Behavior

When sources are unavailable, degrade per `degradation-strategy.md`. Codebase grep always works as baseline. If Figma unavailable: skip visual comparison, note gap. If Playwright not installed: skip live browser checks, rely on codebase analysis.

When findings are gathered in parallel, merge by severity (Critical first), assign unified VF-{n} IDs, deduplicate findings with identical selectors.

If multiple sources disagree on a selector or text value, flag as Warning with both values shown for user resolution.

<done_criteria>
1. All spec files in the target path scanned
2. Validation report generated at `.sparq/validation/validation-report.md` with VF-{n} IDs
3. Critical findings have auto-fix proposals
4. Findings classified by severity (Critical/Warning/Info)
5. Checkpoint presented before applying any fixes
6. Unavailable sources documented as gaps in report
</done_criteria>

## References

- `claude/skills/sparq-shared/references/validation-checklist.md`
- `claude/skills/sparq-shared/references/pattern-adherence.md`
- `claude/skills/sparq-shared/references/parallel-execution.md`
- `claude/skills/sparq-shared/references/degradation-strategy.md`
- `claude/skills/sparq-shared/references/config-schema.md`

## Examples

```
/sparq:validate e2e/
-> Scans 12 test files across all spec directories
-> Fetches current state (codebase + Figma + Playwright CLI in parallel)
-> CHECKPOINT: 3 Critical, 5 Warning, 2 Info findings
-> User picks "B" (critical only) -> applies 3 critical auto-fixes
-> Re-validates (cycle 1): 0 Critical, 5 Warning, 2 Info remaining
-> Output: .sparq/validation/validation-report.md
```

```
/sparq:validate e2e/specs/auth/
-> Scans 3 test files in auth directory only
-> Finds 1 Critical (broken selector), 2 Warning (changed text)
-> CHECKPOINT: presents findings with auto-fix proposals
-> User approves all -> applies fixes
-> Output: .sparq/validation/validation-report.md
```

After validation completes, consider running `/sparq:sync` if requirements may have also changed.

**Complementary tool**: Run `sparq lint {e2e-directory}/` before or after validate for fast structural checks (locator quality, flaky patterns, assertion coverage) — deterministic, CI-compatible, zero model inference. `/sparq:validate` handles semantic/UI drift; `sparq lint` handles code-quality patterns.
