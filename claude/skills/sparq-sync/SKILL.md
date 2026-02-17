---
name: sparq:sync
description: "Syncing existing tests with updated or changed requirements. Detecting requirement diffs, coverage gaps, and generating test updates based on changed acceptance criteria. Use when: (1) requirements changed after tests were written, (2) new acceptance criteria added to a ticket, (3) Jira/Confluence content updated, (4) before a release to verify requirement coverage."
audience: qa
---

# Sync Tests with Updated Requirements

Config, version check, pattern rules, and E2E code generation preamble per `claude/rules/skills.md`. Additionally: grep `{project.sourceRoot}/` for `data-testid`, labels, route definitions. Read test registry (`.sparq/tracking/test-registry.json`) and `refresh-patterns.md` before modifying tests.

## Purpose

Sync existing tests with updated or changed requirements. This skill focuses exclusively on **requirement changes** -- detecting diffs between current requirements and existing test coverage, then generating test updates. For UI drift and technical freshness checks, use `/sparq:validate`.

## When NOT to Use

- If **UI/codebase changed** but requirements are the same (broken selectors, moved components, route changes): use `/sparq:validate` instead — it detects technical drift without requiring a requirements source.
- `/sparq:sync` requires an updated requirements source (Jira, Confluence) to perform diff analysis. Without a requirements source, use `/sparq:validate`.

## Input Detection

Parse input to determine:
- **Target test files**: path, directory, or traced from ticket via registry reverse lookup
- **Requirement source**: Jira ticket, Confluence URL, or auto-detect from registry `sourceTicket`/`sourcePages`

A requirement source (ticket ID, Confluence URL) is required. If only test files are provided without a requirement source, suggest `/sparq:validate` instead.

<example>
<input>/sparq:sync EP-14 e2e/specs/auth/login.spec.ts</input>
<mode>Requirement sync -- ticket ID + test file. Diff requirements, then update tests.</mode>
</example>

<example>
<input>/sparq:sync EP-14</input>
<mode>Requirement sync -- ticket ID only. Search test registry for linked tests, then diff requirements.</mode>
</example>

---

## Workflow: Requirement Diff + Test Update

1. Parse input to determine: (a) target test files (path, directory, or traced from ticket via registry reverse lookup), (b) requirement source (Jira ticket, Confluence URL, or auto-detect from registry `sourceTicket`/`sourcePages`)
2. If ticket ID only (e.g., `EP-14`): search test registry entries where `sourceTicket === "EP-14"`. Fallback: grep spec files for ticket ID references. If no tests found, ask user for test file path.
3. **Dual Phase 1** (parallel when Task tool available):
   - **Task A (test-validator)**: Parse existing test files, read test registry, extract traceability map `{TC-ID -> [REQ-IDs]}`, catalog assertions and test structure
   - **Task B (requirements-analyst)**: Fetch CURRENT requirements from enabled sources (Jira/Confluence/Figma). If previous requirements exist at `.sparq/requirements/REQ-{feature}.md`, copy to `.sparq/refresh/REQ-{feature}-previous.md` before overwriting
4. **Phase 1.5 -- Diff Analysis** (orchestrator): Compare current requirements against test coverage using content hashing and registry data. Classify each requirement as NEW / CHANGED / REMOVED / UNCHANGED. Generate diff report at `.sparq/refresh/REFRESH-{feature}-diff.md`.
5. **CHECKPOINT** -- Present diff analysis: counts by category, each item with detail and recommended action, affected test files and TC IDs. If all hashes match and no timestamp staleness, present "Tests are up to date -- no changes needed." **Wait for approval of which changes to apply.**

> **Non-interactive mode**: When `preferences.interactiveMode` is `false`, checkpoints are auto-approved except when Critical findings or smoke failures occur. See orchestrator Checkpoint Policy.

6. **Phase 2 -- Update Generation**: Delegate to `sparq-automation-engineer` (for E2E specs) or `sparq-manual-test-writer` (for manual test files) with approved diff and existing test context:
   - **NEW** requirements -> generate new test blocks, continue TC ID sequence per category from highest existing (see `refresh-patterns.md`)
   - **CHANGED-HIGH** -> suggest rewrite with before/after comparison, mark `// [SYNC] REVIEW`
   - **CHANGED-MEDIUM** -> update assertions/steps inline, mark `// [SYNC] UPDATED`
   - **CHANGED-LOW** -> add comment `// [SYNC] NOTE` (auto-applied if `refresh.autoApplyLowSeverity` is `true`)
   - **REMOVED** -> mark `// [SYNC] DEPRECATED` (never auto-delete when `refresh.preserveDeprecated` is `true`)
7. **CHECKPOINT** -- Present proposed changes with before/after for each modified file. **Wait for approval.**
8. Apply approved changes, run smoke verification (`npx playwright test --list` when `e2e.framework` is `playwright`), update coverage matrix, update test registry with new `lastRefreshedAt`, `requirementsHash`, and any new `testIds`

**Chain**: requirements-analyst (fetch current) + test-validator (parse existing) -> diff engine (orchestrator) -> automation-engineer or manual-test-writer (generate updates)

**Agent selection**: E2E test updates use sparq-automation-engineer; manual test updates use sparq-manual-test-writer.

## Fallback Behavior

When sources or registry are unavailable, degrade per `degradation-strategy.md` and `error-handling.md` (S5 errors). No registry: fall back to coverage matrix, then title matching. See `refresh-patterns.md` for traceability lookup chain.

If test registry is missing or stale, fall back to: coverage matrix -> file title matching -> treat all requirements as NEW. See `error-handling.md` S5 errors.

## Output

```
.sparq/refresh/
  REFRESH-{feature}-diff.md           # Diff analysis report
  REFRESH-{feature}-updates.md        # Proposed changes with before/after
  REQ-{feature}-previous.md           # Previous requirements snapshot
{e2e.structure.specs}/{feature}.spec.ts   # Updated spec files (written directly to project)
{e2e.structure.pages}/{Feature}Page.ts    # Updated page objects (if changed)
.sparq/coverage/coverage-matrix.md        # Updated coverage matrix (metadata)
.sparq/tracking/test-registry.json        # Updated registry entries (metadata)
```

E2E files are updated directly in the project directory per `e2e.structure.*` config. User reviews via `git diff` and can revert via `git checkout`.

<done_criteria>
1. `sparq.config.json` read and validated; requirement sources and `e2e.structure.*` paths resolved
2. Requirement diff analysis generated at `.sparq/refresh/REFRESH-{feature}-diff.md` with every requirement classified as NEW, CHANGED, REMOVED, or UNCHANGED
3. Changes classified by severity (CHANGED-HIGH, CHANGED-MEDIUM, CHANGED-LOW) with corresponding sync markers applied (`// [SYNC] REVIEW`, `// [SYNC] UPDATED`, `// [SYNC] NOTE`)
4. Updated test files pass smoke verify per `e2e.framework` (`npx playwright test --list` for Playwright, `npx cypress run --spec {path}` or `npx tsc --noEmit` for Cypress) without error
5. Test registry (`.sparq/tracking/test-registry.json`) updated with current `lastRefreshedAt`, `requirementsHash`, and any new `testIds`
</done_criteria>

## References

- `claude/skills/sparq-shared/references/validation-checklist.md`
- `claude/skills/sparq-shared/references/refresh-patterns.md`
- `claude/skills/sparq-shared/references/pattern-adherence.md`
- `claude/skills/sparq-shared/references/parallel-execution.md`
- `claude/skills/sparq-shared/references/degradation-strategy.md`
- `claude/skills/sparq-shared/references/data-model.md` (TestRegistryEntry, RefreshDiff)

## Examples

```
/sparq:sync EP-14 e2e/specs/auth/login.spec.ts
-> Requirement sync: reads test registry: login.spec.ts covers REQ-login-001..005 (hash: a1b2c3)
-> fetches EP-14 from Jira: 7 acceptance criteria (was 5)
-> computes current hash: d4e5f6 (differs from a1b2c3 -> stale)
-> CHECKPOINT diff: +2 NEW (MFA, session timeout), 1 CHANGED-MEDIUM (password policy), 0 REMOVED, 4 UNCHANGED
-> user approves all
-> generates 3 new tests (TC-login-HP-004, TC-login-HP-005, TC-login-EC-003)
-> updates 1 test (TC-login-VE-001: min password 8->12)
-> extends LoginPage with mfaCodeInput, mfaSubmitButton, enterMfaCode()
-> CHECKPOINT: review 3 new + 1 updated + 2 new page methods
-> user approves
-> smoke verify OK, coverage: 11 tests covering 7 requirements
-> registry updated: lastRefreshedAt=now, requirementsHash=d4e5f6, testIds=[...+3]
```

After sync completes, consider running `/sparq:validate` for technical freshness and UI drift checks.
