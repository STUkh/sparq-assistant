---
name: sparq:refactor
description: "Updating E2E test files after codebase refactoring. Bulk renaming selectors, imports, class names, and string references across test suites."
audience: internal
input_type: "text"
---

# Refactor Test References

Config, version check, pattern rules, and E2E code generation preamble per `claude/rules/skills.md`.

## Input Parsing

- `--from` (required): old name, selector, import path, or string to find
- `--to` (required): new name, selector, import path, or string to replace with
- Remaining args: file or directory paths to scope the search (default: full `e2e/` directory per `e2e.structure.*` config)
- Match types: component names, `data-testid` values, CSS selectors, import paths, route URLs, class names, variable names
- Error: `--from` and `--to` identical -> exit immediately

## Workflow

1. Parse `--from`, `--to`, and scope paths from user input. Validate both flags are present and differ.
2. Grep scoped directories for all occurrences of the `--from` value. Search across: spec files, page objects, step definitions, component objects, fixtures, barrel files. Do NOT search: `src/` (application code), `node_modules/`, config files.
3. Report partial matches and near-matches (e.g., `LoginForm` also matching `LoginFormModal`). Warn about import path changes that may break barrel re-exports.
4. **CHECKPOINT** -- Present grep results: N occurrences across M files. Show each occurrence with `file:line` context. Include near-matches in a separate section. **Wait for approval of which replacements to apply.**

> **Non-interactive mode**: When `preferences.interactiveMode` is `false`, checkpoints are auto-approved except when near-matches or barrel re-export warnings are present. See orchestrator Checkpoint Policy.

5. Apply approved replacements (deterministic find/replace -- no second checkpoint needed for the replacements themselves).
6. Run smoke verification: `npx playwright test --list` (when `e2e.framework` is `playwright`) or `npx tsc --noEmit`.
7. **CHECKPOINT** -- Present smoke verify results. If failures detected, show affected tests and offer rollback via `git checkout -- {files}`. **Wait for approval.**
8. Write refactor report to `.sparq/validation/refactor-report.md`.

**Delegation**: Routes to `sparq-test-validator` in refactor mode. The orchestrator adds `mode: "refactor"` and `refactorParams: { from, to, scope }` to the dispatch. This is an S4 variant, not a new scenario.

## Error Handling

- No matches found: report "No occurrences of `{from}` found in scoped files" and exit
- Smoke verify fails after replacement: offer rollback via `git checkout -- {files}`, list affected files
- Barrel re-export broken: include in smoke verify failures with specific barrel file paths

## Output

```
# Modified project files (in-place edits)
{e2e.structure.pages}/{affected}.page.ts
{e2e.structure.specs}/{affected}.spec.ts
{e2e.structure.steps}/{affected}.steps.ts

# Refactor report (metadata)
.sparq/validation/refactor-report.md
```

Files are edited directly in the project E2E directory. Git is the safety net for review (`git diff`) and revert (`git checkout`).

<done_criteria>
1. `sparq.config.json` read and `--from` / `--to` patterns parsed and validated as non-identical
2. All occurrences of `--from` value located across scoped E2E files (specs, pages, steps, components, fixtures, barrels) with near-matches flagged separately
3. Approved replacements applied to all matched files — no partial replacements left pending
4. Smoke verify per `e2e.framework` (`npx playwright test --list` for Playwright, `npx cypress run --spec {path}` or `npx tsc --noEmit` for Cypress) passed without errors
5. Refactor report written to `.sparq/validation/refactor-report.md` listing replacement count, affected files, and smoke verify result
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/validation-checklist.md`
- `.claude/skills/sparq-shared/references/pattern-adherence.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`

## Examples

```
/sparq:refactor --from "LoginForm" --to "AuthenticationForm" e2e/
-> greps e2e/ for "LoginForm": 14 occurrences across 5 files
-> near-matches: "LoginFormModal" (3 occurrences) -- flagged separately
-> CHECKPOINT: review 14 replacements + 3 near-matches
-> user approves 14 exact matches, skips near-matches
-> applies replacements in login.page.ts, login.spec.ts, auth.steps.ts, loginFixture.ts, pages/index.ts
-> smoke verify: npx playwright test --list -- PASSED
-> CHECKPOINT: all green
-> output: .sparq/validation/refactor-report.md (14 replacements across 5 files)
```

```
/sparq:refactor --from "data-testid='submit-btn'" --to "data-testid='form-submit'" e2e/specs/auth/
-> greps e2e/specs/auth/ for "submit-btn": 6 occurrences across 2 files -> user approves
-> applies, smoke verify FAILED: login.page.ts still references old testid
-> CHECKPOINT: 1 failure, offer rollback or expand scope to e2e/pages/
```
