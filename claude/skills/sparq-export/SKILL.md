---
name: sparq:export
description: "Exporting test cases to TMS (TestRail/Qase/Zephyr Scale/local), Jira, or Confluence. Use when: (1) pushing test cases to a TMS provider, (2) linking test coverage to Jira tickets, (3) publishing test plans to Confluence, (4) syncing QA artifacts with external tools."
audience: qa
---

# Export Test Artifacts

Config, version check, and pattern rules per `claude/rules/skills.md` preamble.

## Target Selection

Determine export target from user input:
- `/sparq:export testrail login` -> TestRail export for login feature
- `/sparq:export qase login` -> Qase export for login feature
- `/sparq:export zephyr login` -> Zephyr Scale export for login feature
- `/sparq:export local login` -> Local folder export for login feature
- `/sparq:export jira EP-14` -> Link test cases to Jira ticket EP-14
- `/sparq:export confluence login` -> Publish test plan page to Confluence
- `/sparq:export login` (no target) -> Export to all enabled targets in config

If no target specified, check `outputs.tms.provider`, `outputs.jira.enabled`, `outputs.confluence.enabled` and export to all that are enabled.

**Delegation**: Handled directly by sparq-orchestrator via MCP tools. No sub-agent.

### Parallel Multi-Target Export

When exporting to multiple targets (no specific target specified, multiple enabled): launch parallel Task agents per `parallel-execution.md` Pattern 5, one per enabled target. Each Task handles its own MCP connections and fallbacks independently. Failure of one target does not affect others. If only one target: run directly (no Task overhead).

## Fallback Pattern (All Targets)

When MCP for a target is unavailable: (1) log `"[sparq] {Target} MCP unavailable"`, (2) write export-ready file to `.sparq/`, (3) instruct user for manual import/posting. See `degradation-strategy.md` for retry strategy.

### Qase-Specific Fallback Chain

When Qase MCP is unavailable:
1. Check if `$QASE_API_TOKEN` env variable is set
2. If set: invoke `/sparq:qase-api` skill for direct REST API operations (create suites, create cases)
3. If `/sparq:qase-api` also fails (endpoint changed): apply Web Docs Fallback per `degradation-strategy.md` `<local_skill_fallback>`
4. Final fallback: write JSON to `.sparq/tms-export/TC-{feature}-qase.json` for manual import

### TestRail-Specific Fallback Chain

When TestRail MCP is unavailable:
1. Check if `$TESTRAIL_BASE_URL`, `$TESTRAIL_USERNAME`, `$TESTRAIL_API_KEY` env variables are set
2. If set: invoke `/sparq:testrail-api` skill for direct REST API operations (create sections, create cases)
3. If `/sparq:testrail-api` also fails (endpoint changed): apply Web Docs Fallback per `degradation-strategy.md` `<local_skill_fallback>`
4. Final fallback: write XML to `.sparq/test-cases/TC-{feature}-manual.xml` for manual import

If source test case files are not found at `.sparq/test-cases/`, prompt user to specify the correct path or suggest running `/sparq:generate-manual` first to generate the required artifacts.
- TMS (testrail) fallback: `.sparq/test-cases/TC-{feature}-manual.xml`
- TMS (qase) fallback: `.sparq/tms-export/TC-{feature}-qase.json`
- TMS (zephyr) fallback: `.sparq/tms-export/TC-{feature}-zephyr.json`
- TMS (local) fallback: always succeeds (no MCP)
- Jira fallback output: `.sparq/coverage/{feature}-jira-comment.md`
- Confluence fallback output: `.sparq/test-cases/TC-{feature}-confluence.md`

### Framework-Aware E2E Artifact Collection

When export targets reference E2E automation status (Jira coverage comment, Confluence test plan), collect E2E artifacts using the correct file pattern per `e2e.framework` from `sparq.config.json`:
- Playwright: `e2e/specs/**/*.spec.ts` (or `e2e.structure.specs` from config)
- Cypress: `cypress/e2e/**/*.cy.ts` (or `e2e.structure.specs` from config)

If `e2e.framework` is not set, fall back to scanning both patterns and use whichever yields results.

---

## TestRail Export

**Config required**: `outputs.tms.provider: "testrail"`, `outputs.tms.testrail.projectId`, `outputs.tms.testrail.suiteId`

### Workflow
1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md`. Parse: ID, title, priority, category, preconditions, steps, expected results. If missing, prompt user for file path or run `/sparq:generate-manual` first.
2. Using TestRail MCP: list existing sections, map categories to sections, create missing ones (e.g., "Happy Path", "Security")
3. Apply CREATE/UPDATE/SKIP/REMOVE classification per `tms-abstraction.md` `<update_workflow>`. Use `mcp__testrail__get_cases` to fetch remote state.
4. CREATE: `mcp__testrail__add_case` with title, section_id, priority_id, custom_steps_separated, custom_preconds. Write back `tmsId: testrail:{caseId}` frontmatter.
5. UPDATE: `mcp__testrail__update_case` with changed fields only.
6. Report results with section breakdown and TestRail URL

### Priority Mapping

Priority mapping: see `data-model.md` section "Requirement-to-TestCase Priority Mapping" and `testrail-formats.md`.

**MCP Tools**: See TestRail section in `mcp-tool-inventory.md`.

---

## Qase Export

**Config required**: `outputs.tms.provider: "qase"`, `outputs.tms.qase.projectCode`

### Workflow
1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md`. Parse: ID, title, priority, category, preconditions, steps, expected results.
2. Using Qase MCP: list existing suites via `mcp__qase__list_suites`, map categories to suites, create missing ones
   - If Qase MCP unavailable: attempt `/sparq:qase-api` direct REST fallback (see "Qase-Specific Fallback Chain" above). If REST also fails, write fallback JSON.
3. Apply CREATE/UPDATE/SKIP/REMOVE classification per `tms-abstraction.md` `<update_workflow>`. Use `mcp__qase__list_cases` to fetch remote state.
4. CREATE: `mcp__qase__create_case` or `mcp__qase__bulk_create_cases` for batches >5. Map priority per `tms-abstraction.md`. Write back `tmsId: qase:{caseId}` frontmatter.
5. UPDATE: `mcp__qase__update_case` with changed fields only.
6. Report results with suite breakdown and Qase project URL

**MCP Tools**: See Qase section in `mcp-tool-inventory.md` and `qase-formats.md`.

### CREATE / UPDATE / SKIP / REMOVE Classification (Qase, TestRail & Zephyr Scale)

On every export (first or subsequent), classify each local test case against the remote TMS state using the algorithm in `tms-abstraction.md` `<update_workflow>`:

1. Fetch all remote cases via MCP (`mcp__qase__list_cases` or `mcp__testrail__get_cases`)
2. For each local test case file, read frontmatter — check for `tmsId: {provider}:{remoteId}`
3. Classify each local case:
   - **CREATE** — no `tmsId` frontmatter, no remote title match → call `add_case` / `create_case`
   - **UPDATE** — `tmsId` present and remote case found by ID → call `update_case` with changed fields
   - **SKIP** — `tmsId` present, remote found, no field changes detected → no API call
   - **REMOVE** — remote case exists but has no matching local case (by `tmsId` or title) → requires user approval
4. After successful CREATE, write back `tmsId: {provider}:{remoteId}` to the test case file's YAML frontmatter so future exports can match by ID
5. Report classification summary before executing any API calls:
   ```
   [sparq] Export classification: {N} CREATE, {N} UPDATE, {N} SKIP, {N} REMOVE
   ```
6. Execute CREATE and UPDATE immediately (no approval needed)
7. If REMOVE cases detected, present a **REMOVAL CHECKPOINT**:
   ```
   [sparq] Export: {N} test cases exist in {Provider} but not locally:
     - {remote_id}: {title}
     - {remote_id}: {title}

   Options:
     (a) Skip — leave remote cases untouched (recommended)
     (b) Archive — mark remote cases as deprecated/inactive
     (c) Delete — remove from remote TMS (irreversible)
   ```
8. Wait for explicit user approval before any REMOVE action; default: Skip

**tmsId write-back format**: After CREATE succeeds, prepend to the test case markdown file's YAML frontmatter block (or add a frontmatter block if none exists):
```yaml
tmsId: testrail:5001   # or qase:301 or zephyr:TC-PROJ-42
```

This checkpoint applies to Qase, TestRail, and Zephyr Scale exports. Local export is unaffected (no remote state). See `tms-abstraction.md` `<update_workflow>` and `<removal_policy>` for full policy.

---

## Zephyr Scale Export

**Config required**: `outputs.tms.provider: "zephyr"`, `outputs.tms.zephyr.projectKey`

**Env vars required**: `ZEPHYR_BASE_URL`, `ZEPHYR_API_TOKEN`, `ZEPHYR_PROJECT_KEY`

### Workflow
1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md`. Parse: ID, title, priority, category, preconditions, steps, expected results. If missing, prompt user for file path or run `/sparq:generate-manual` first.
2. Using Zephyr Scale MCP: list existing folders via `mcp__zephyr__get_folders`, map categories to folders, create missing ones (e.g., "Happy Path", "Security")
   - If Zephyr Scale MCP unavailable: attempt direct REST API fallback (see "Zephyr Scale-Specific Fallback Chain" below). If REST also fails, write fallback JSON to `.sparq/tms-export/TC-{feature}-zephyr.json`.
3. Apply CREATE/UPDATE/SKIP/REMOVE classification per `tms-abstraction.md` `<update_workflow>`. Use `mcp__zephyr__get_test_cases` to fetch remote state.
4. CREATE: `mcp__zephyr__create_test_case` — name (with TC ID prefix), folderId, priority (mapped per `zephyr-formats.md`), statusName ("Approved"), labels, precondition, steps. Write back `tmsId: zephyr:{testCaseKey}` frontmatter.
5. UPDATE: `mcp__zephyr__update_test_case` with changed fields only.
6. Report results with folder breakdown and Zephyr Scale project URL

### Priority Mapping

Priority mapping: `zephyr-formats.md` `<zephyr_priority_mapping>` (abstract priority -> "Critical" | "High" | "Normal" | "Low" string labels).

**MCP Tools**: See `zephyr-formats.md` `<zephyr_tools>`.

### Zephyr Scale-Specific Fallback Chain

When Zephyr Scale MCP is unavailable:
1. Check if `$ZEPHYR_API_TOKEN` and `$ZEPHYR_BASE_URL` env variables are set
2. If set: use direct REST API (Server: `{ZEPHYR_BASE_URL}/rest/atm/1.0/testcase`; Cloud: `https://api.zephyrscale.smartbear.com/v2/testcases`; see `zephyr-sync.md` for full path map)
3. If REST also fails: apply Web Docs Fallback per `degradation-strategy.md` `<local_skill_fallback>`
4. Final fallback: write JSON to `.sparq/tms-export/TC-{feature}-zephyr.json` for manual import

---

## Local Folder Export

**Config required**: `outputs.tms.provider: "local"`

### Workflow
1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md`
2. Write structured output per `local-tms-formats.md` to configured `outputs.tms.local.outputDir` (default `.sparq/tms-export`)
3. Format per `outputs.tms.local.format` (default `json`, alternative `markdown`)
4. Report file paths

No MCP required. Always succeeds. See `local-tms-formats.md` for output schema.

---

## Jira Export

**Config required**: `outputs.jira.enabled: true`, `sources.jira.projectKey`

### Workflow
1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md` and/or coverage matrix from `.sparq/coverage/`
2. Identify the source Jira ticket (from REQ-{feature}.md source references, or user-provided ticket ID)
3. Add a structured comment to the source ticket summarizing QA coverage:
   - Total test cases by category (HP, VE, SEC, EC, A11Y)
   - Priority distribution (P1/P2/P3/P4)
   - Automation status (automated / manual-only / pending)
   - Links to generated artifacts
4. Add label `qa-covered` to the ticket (skip if already present)
5. If `outputs.jira.createSubTask` is true, create a "QA Test Plan" sub-task with checklist of test case IDs and titles

**MCP Tools**: See Jira section in `mcp-tool-inventory.md`.

**Comment Format**: See `claude/templates/sparq-jira-coverage-comment.md`.

---

## Confluence Export

**Config required**: `outputs.confluence.enabled: true`, `sources.confluence.spaceKey` (or `outputs.confluence.spaceKey` override)

### Workflow
1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md` and coverage matrix from `.sparq/coverage/`
2. Determine target space key: use `outputs.confluence.spaceKey` if set, otherwise fall back to `sources.confluence.spaceKey`
3. Search for existing QA page: `mcp__atlassian__confluence_search_using_cql('space = "{SPACE_KEY}" AND title = "QA: {Feature} Test Plan"')`
4. If page exists: update it via `mcp__atlassian__confluence_update_page` (increment version)
5. If page doesn't exist: create via `mcp__atlassian__confluence_create_page` under optional `outputs.confluence.parentPageTitle`
6. Page content includes:
   - Requirements traceability (REQ IDs → TC IDs)
   - Full test case table with all fields
   - Coverage matrix
   - Automation status summary
   - Links to source Jira tickets
7. Report with Confluence page URL

**MCP Tools**: See Confluence section in `mcp-tool-inventory.md`.

### Page Title Convention

`QA: {Feature} Test Plan` — e.g., "QA: Login Test Plan", "QA: User Management Test Plan"

---

<done_criteria>
1. `sparq.config.json` read and all export-relevant settings (`outputs.tms`, `outputs.jira`, `outputs.confluence`) resolved
2. Export target(s) determined — either from explicit user input or from all enabled targets in config
3. Export completed for every resolved target (TMS cases created/updated/written, Jira comment posted, Confluence page created/updated)
4. Partial failures reported per-target with fallback artifacts written to `.sparq/` for any target whose MCP was unavailable
5. For TMS exports: CREATE/UPDATE/SKIP/REMOVE classification performed; `tmsId` frontmatter written back to local test case files after successful CREATE (per `tms-abstraction.md` `<update_workflow>`)
6. If REMOVE cases detected, user approval obtained before any remote case deletion (per `tms-abstraction.md` `<removal_policy>`)
7. Export summary presented to user listing per-target results (created/updated IDs, URLs, or fallback file paths)
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/testrail-formats.md`
- `.claude/skills/sparq-shared/references/testrail-sync.md`
- `.claude/skills/sparq-shared/references/tms-abstraction.md`
- `.claude/skills/sparq-shared/references/qase-formats.md`
- `.claude/skills/sparq-shared/references/qase-sync.md`
- `.claude/skills/sparq-shared/references/zephyr-formats.md`
- `.claude/skills/sparq-shared/references/zephyr-sync.md`
- `.claude/skills/sparq-shared/references/local-tms-formats.md`
- `.claude/skills/sparq-shared/references/jira-patterns.md`
- `.claude/skills/sparq-shared/references/confluence-patterns.md`
- `.claude/skills/sparq-shared/references/data-model.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`
- `.claude/skills/sparq-shared/references/parallel-execution.md`
- `.claude/skills/sparq-shared/references/pattern-adherence.md`
- `.claude/skills/sparq-shared/references/mcp-tool-inventory.md`
- `claude/skills/sparq-qase-api/SKILL.md`
- `claude/skills/sparq-testrail-api/SKILL.md`

## Examples

```
/sparq:export testrail login
→ reads TC-login-manual.md (26 cases), validates config (outputs.tms.testrail.projectId=1)
→ checks/creates TestRail sections
→ exports 26 cases via mcp__testrail__add_case (C1001-C1026)
→ output: https://team.testrail.io/index.php?/suites/view/1

/sparq:export jira EP-14
→ reads TC-login-manual.md, builds coverage summary
→ adds structured comment to EP-14 with category breakdown
→ adds "qa-covered" label
→ output: https://team.atlassian.net/browse/EP-14

/sparq:export confluence login
→ reads TC-login-manual.md + coverage matrix
→ searches for existing "QA: Login Test Plan" page
→ creates/updates Confluence page with full test plan
→ output: https://team.atlassian.net/wiki/spaces/TEAM/pages/12345

/sparq:export login
→ exports to all enabled targets (testrail + jira + confluence)
→ reports results for each target

/sparq:export qase login
-> reads TC-login-manual.md (26 cases), validates config (outputs.tms.qase.projectCode="PROJ")
-> checks/creates Qase suites per category
-> exports 26 cases via mcp__qase__create_case
-> output: https://app.qase.io/project/PROJ

/sparq:export local login
-> reads TC-login-manual.md (26 cases)
-> writes .sparq/tms-export/login/test-cases.json (26 cases)
-> output: .sparq/tms-export/login/

/sparq:export zephyr login
-> reads TC-login-manual.md (26 cases), validates config (outputs.tms.zephyr.projectKey="PROJ")
-> fetches remote cases via mcp__zephyr__get_test_cases
-> classifies: 20 CREATE, 4 UPDATE, 2 SKIP (second run example)
-> creates/updates cases, writes tmsId: zephyr:TC-PROJ-{n} to frontmatter
-> output: https://your-domain.atlassian.net/projects/PROJ?selectedItem=com.atlassian.plugins.atlassian-connect-plugin:com.smartbear.jira.zephyr-scale
```
