---
name: sparq:publish-results
description: "Publishing E2E test execution results from Playwright/Cypress back to TestRail, Qase, or Zephyr Scale TMS after CI runs. Use when: (1) posting pass/fail results from a completed CI run to a TMS, (2) creating a test run record in TestRail or Qase from Playwright JSON or JUnit XML output, (3) syncing CI results back to the test management system."
audience: qa
triggers:
  - publish results
  - post results
  - update testrail with results
  - update qase with results
  - sync results to tms
  - test run results
  - push test results
---

# Publish Test Results

Config, version check, and pattern rules per `claude/rules/skills.md` preamble.

<overview>
Reads Playwright JSON reporter output (`playwright-report/results.json` or `test-results/*.json`) or JUnit XML (`test-results/**/*.xml`), maps test titles to TC IDs embedded as `TC-{feature}-{ABBR}-{NNN}` (regex: `TC-[A-Z0-9]+-[A-Z0-9]+-\d+`), creates a test run in the configured TMS, and posts pass/fail/skip per matched test case. Tests with no TC ID are grouped into an "Untracked Tests" run. Supports TestRail, Qase, and Zephyr Scale. Falls back to a local CSV file when MCP is unavailable.
</overview>

<workflow>

### Step 1: Resolve TMS Provider

Read `outputs.tms.provider` from `sparq.config.json`.
- If set: use that provider; confirm with user
- If missing: ask "Which TMS are you publishing to? (testrail / qase / zephyr)"

### Step 2: Locate Test Output

Check common output paths in order:
1. `playwright-report/results.json` (Playwright JSON reporter)
2. `test-results/*.json` (Playwright blob reporter output)
3. `test-results/**/*.xml` (JUnit XML — Playwright or Cypress)
4. `cypress/results/**/*.xml` (Cypress JUnit XML)

If none found: ask the user to provide the path. Example prompt:
> "I couldn't find test output at the default paths. Where is your test results file? (e.g., `my-results/output.xml`)"

### Step 3: Detect Format

- File extension `.json` + contains `"suites"` or `"stats"` key → Playwright JSON
- File extension `.xml` + root element `<testsuites>` or `<testsuite>` → JUnit XML

### Step 4: Parse Results

**Playwright JSON** (`results.json`):
- Iterate `suites[].specs[].tests[]`
- Extract: `title` (full test title), `status` (`passed`/`failed`/`skipped`/`timedOut`), `duration` (ms), `error.message` (if failed)

**JUnit XML**:
- Parse `<testcase>` elements
- Extract: `name` attribute (test title), presence of `<failure>` child (failed), `<skipped>` child (skipped), `time` attribute (seconds → ms), `<failure>` text (error message)
- `timedOut` detected from failure message containing "Timeout"

### Step 5: Extract TC IDs

For each test result, apply regex `TC-[A-Z0-9]+-[A-Z0-9]+-\d+` to the test title.
- Match found → associate result with that TC ID
- No match → group under "Untracked Tests" (separate run or appended section)

### Step 6: Create Test Run in TMS

Create a test run named: `SparQ Results — {date} {branch}` (branch from `git rev-parse --abbrev-ref HEAD` if available, else omit).
- Include only the case IDs found in the parsed results (matched TC IDs resolved to TMS case IDs via `tmsId` frontmatter in `.sparq/test-cases/`)
- If no `tmsId` mappings exist, include all cases in the project/suite (provider default)

### Step 7: Post Results per Test Case

Map SparQ/Playwright statuses to TMS statuses per `<tms_tools>` section. Post in bulk where supported (TestRail `add_results_for_cases`), per-result otherwise (Qase, Zephyr).

### Step 8: Report

Emit summary:
```
[sparq] Results published:
  Provider: TestRail (project: {projectId})
  Run: {runName} — {runUrl}
  Posted: {N} passed, {N} failed, {N} skipped
  Unmatched (no TC ID): {N} tests (see "Untracked Tests" run)
```

</workflow>

<tms_tools>

### Status Mapping

- `passed` → PASS (TestRail: 1, Qase: `passed`, Zephyr: `PASS`)
- `failed` / `timedOut` → FAIL (TestRail: 5, Qase: `failed`, Zephyr: `FAIL`)
- `skipped` → NOT_EXECUTED (TestRail: 3 (Skipped), Qase: `skipped`, Zephyr: `NOT_EXECUTED`)

### TestRail

- Create run: `mcp__testrail__add_run(project_id, name, case_ids[])`
- Batch results: `mcp__testrail__add_results_for_cases(run_id, results[])` — preferred for performance
- Per-result fallback: `mcp__testrail__add_result_for_case(run_id, case_id, status_id, comment)`
- `comment` field: include duration (ms) and error message truncated to 500 chars

### Qase

- Create run: `mcp__qase__create_run(project_code, title, description?)`
- Per result: `mcp__qase__create_result(project_code, run_id, case_id, status, time_ms, comment?)`
- No batch API — loop per test result

### Zephyr Scale

- Create cycle: `mcp__zephyr__create_test_cycle(project_key, name, description?)`
- Per result: `mcp__zephyr__add_test_result(project_key, test_cycle_key, test_case_key, status, comment?)`

</tms_tools>

<fallback>
When MCP is unavailable (per `degradation-strategy.md`):
1. Log: `"[sparq] {Provider} MCP unavailable — generating local CSV fallback"`
2. Write `.sparq/results/{YYYY-MM-DD}-results.csv` with columns:
   - `TC ID`, `Test Title`, `Status`, `Duration (ms)`, `Error Message`
3. Instruct user: "Import this CSV manually into your TMS. TestRail supports bulk result import via the API or CSV upload in a test run."
4. Report fallback file path to user
</fallback>

<done_criteria>
- [ ] TMS provider resolved from config or user input
- [ ] Test output file located and format detected (Playwright JSON or JUnit XML)
- [ ] All test results parsed: title, status, duration, error (if any)
- [ ] TC IDs extracted from test titles via regex `TC-[A-Z0-9]+-[A-Z0-9]+-\d+`
- [ ] Test run created in TMS (or fallback CSV generated at `.sparq/results/{date}-results.csv`)
- [ ] Pass/fail/skip posted per matched test case with correct TMS status codes
- [ ] Run URL reported to user (or CSV path if fallback)
- [ ] Untracked tests (no TC ID) reported with count
</done_criteria>

## References

- `claude/skills/sparq-shared/references/tms-abstraction.md`
- `claude/skills/sparq-shared/references/mcp-tool-inventory.md`
- `claude/skills/sparq-shared/references/degradation-strategy.md`

## Usage

```
/sparq:publish-results
→ reads sparq.config.json (outputs.tms.provider: "testrail")
→ detects playwright-report/results.json (Playwright JSON format)
→ parses 42 test results, extracts 38 TC IDs
→ creates TestRail run "SparQ Results — 2026-02-20 feature/login"
→ posts 35 passed, 2 failed, 1 skipped via mcp__testrail__add_results_for_cases
→ output: https://team.testrail.io/index.php?/runs/view/42
→ 4 untracked tests (no TC ID) listed in summary

/sparq:publish-results
→ outputs.tms.provider: "qase"
→ detects test-results/junit.xml (JUnit XML format)
→ creates Qase run, posts results per mcp__qase__create_result
→ output: https://app.qase.io/run/PROJ/1
```
