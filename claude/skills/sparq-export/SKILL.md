---
name: sparq:export
description: "Exporting test cases to TMS (TestRail/Qase/local), Jira, or Confluence. Use when: (1) pushing test cases to a TMS provider, (2) linking test coverage to Jira tickets, (3) publishing test plans to Confluence, (4) syncing QA artifacts with external tools."
audience: qa
---

# Export Test Artifacts

Config, version check, and pattern rules per `claude/rules/skills.md` preamble.

## Target Selection

Determine export target from user input:
- `/sparq:export testrail login` -> TestRail export for login feature
- `/sparq:export qase login` -> Qase export for login feature
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

If source test case files are not found at `.sparq/test-cases/`, prompt user to specify the correct path or suggest running `/sparq:generate-manual` first to generate the required artifacts.
- TMS (testrail) fallback: `.sparq/test-cases/TC-{feature}-manual.xml`
- TMS (qase) fallback: `.sparq/tms-export/TC-{feature}-qase.json`
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
3. Create each test case via `mcp__testrail__add_case`: title, section_id (from category), priority_id, custom_steps_separated, custom_preconds. Track created case IDs.
4. Report results with section breakdown and TestRail URL

### Priority Mapping

Priority mapping: see `data-model.md` section "Requirement-to-TestCase Priority Mapping" and `testrail-formats.md`.

**MCP Tools**: See TestRail section in `mcp-tool-inventory.md`.

---

## Qase Export

**Config required**: `outputs.tms.provider: "qase"`, `outputs.tms.qase.projectCode`

### Workflow
1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md`. Parse: ID, title, priority, category, preconditions, steps, expected results.
2. Using Qase MCP: list existing suites via `mcp__qase__list_suites`, map categories to suites, create missing ones
3. Create test cases via `mcp__qase__create_case` or `mcp__qase__bulk_create_cases` for batches >5. Map priority per `tms-abstraction.md`.
4. Report results with suite breakdown and Qase project URL

**MCP Tools**: See Qase section in `mcp-tool-inventory.md` and `qase-formats.md`.

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
3. Export completed for every resolved target (TMS cases created/written, Jira comment posted, Confluence page created/updated)
4. Partial failures reported per-target with fallback artifacts written to `.sparq/` for any target whose MCP was unavailable
5. Export summary presented to user listing per-target results (created IDs, URLs, or fallback file paths)
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/testrail-formats.md`
- `.claude/skills/sparq-shared/references/tms-abstraction.md`
- `.claude/skills/sparq-shared/references/qase-formats.md`
- `.claude/skills/sparq-shared/references/local-tms-formats.md`
- `.claude/skills/sparq-shared/references/jira-patterns.md`
- `.claude/skills/sparq-shared/references/confluence-patterns.md`
- `.claude/skills/sparq-shared/references/data-model.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`
- `.claude/skills/sparq-shared/references/parallel-execution.md`
- `.claude/skills/sparq-shared/references/pattern-adherence.md`
- `.claude/skills/sparq-shared/references/mcp-tool-inventory.md`

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
```
