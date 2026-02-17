---
name: sparq:generate-manual
description: "Generate comprehensive manual test cases from requirements. Covers happy path, validation, security, edge cases, and accessibility. Outputs markdown and TMS-importable formats. Use when: (1) creating manual test cases, (2) building QA checklist, (3) preparing test plan for a feature, (4) generating TMS-importable test cases."
audience: qa
---

# Generate Manual Test Cases

Config, version check, and pattern rules per `claude/rules/skills.md` preamble.

## Workflow

1. If no `.sparq/requirements/REQ-{feature}.md` exists, run `/sparq:analyze` first
2. **CHECKPOINT** -- Propose test plan: categories with case counts, priority distribution (P1/P2/P3/P4), total cases, out-of-scope items. **Wait for approval.**
3. **CHECKPOINT** -- Delegate to `sparq-manual-test-writer` agent with delegation context:
   - Requirements document path and parsed content
   - E2E Infrastructure Summary from config (existing page objects, components, fixtures, specs)
   - Tech stack info (`project.componentFileExtensions`)
   - Output format preference from config (`outputs.testCases.format`)
   - Use `preferences.locatorPriority` from config for selector strategy when suggesting selectors in test cases
   For >30 tests: split into parallel batches per `parallel-execution.md` Pattern 2 (pre-assign TC ID ranges, launch parallel Task agents).
   Check project e2e structure for existing test infrastructure (page objects, component objects); flag in 'Automation Status' field. Present cases for review. **Wait for confirmation.**
4. Optionally export to TMS via `/sparq:export`

**Chain**: requirements-analyst (if needed) -> manual-test-writer -> export (optional)

**Optional support**: `sparq-manual-test-writer` agent handles generation. For complex features, the orchestrator may also involve `sparq-automation-engineer` for automation feasibility assessment.

## Test Categories

5 canonical categories (HP, VE, SEC, EC, A11Y) -- see `data-model.md` "Test Category Naming" for mapping and `test-generation-patterns.md` for per-category checklists.

## Output Files

- `.sparq/test-cases/TC-{feature}-manual.md` -- format per `.claude/templates/sparq-test-case.md`
- TMS export file per `tms-abstraction.md` (.xml for TestRail, .json for Qase/local)
- `.sparq/coverage/coverage-matrix.md` -- format per `.claude/templates/sparq-coverage-matrix.md`

<done_criteria>
1. `sparq.config.json` read and validated; output format preference and TMS config resolved
2. Manual test cases written to `.sparq/test-cases/TC-{feature}-manual.md` with unique `TC-{feature}-{ABBR}-{NNN}` IDs
3. All 5 test categories represented (HP/VE/SEC/EC/A11Y) with per-category case counts matching the approved plan
4. Every test case includes traceability to at least one REQ ID from `.sparq/requirements/REQ-{feature}.md`
5. TMS export file generated (`.xml` for TestRail, `.json` for Qase/local) when `outputs.tms` is configured, or export explicitly offered to user
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/test-generation-patterns.md`, `tms-abstraction.md`
- `.claude/skills/sparq-shared/references/data-model.md`
- `.claude/skills/sparq-shared/references/parallel-execution.md`

## Usage

```
/sparq:generate-manual
```

Examples:
- `"Generate manual test cases for EP-142"`
- `"Create QA test plan for the checkout feature"`
- `"Build manual test cases from Confluence spec at https://..."`

## Example

```
/sparq:generate-manual EP-14
-> finds REQ-login.md -> proposes plan (26 cases across 5 categories, P1-P4)
-> CHECKPOINT: approve plan -> delegates to manual-test-writer with E2E infrastructure summary
-> generates test cases with automation status flags
-> outputs: TC-login-manual.md, TMS export, coverage-matrix.md
```
