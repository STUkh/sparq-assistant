# TestRail Sync Workflow

Operational sync workflow for uploading test cases to TestRail TMS. Covers transport detection, dual MCP/REST operations, verification, and recovery.

For entity mapping and XML format: `testrail-formats.md`. For enum field values: `sparq-testrail-api/SKILL.md`. For retry/error rules: `degradation-strategy.md`. For CREATE/UPDATE/SKIP/REMOVE classification: `tms-abstraction.md`.

<transport_selection>
## Transport Selection

3-tier detection: MCP -> REST API -> Web docs.

1. Attempt TestRail MCP tool (e.g., `mcp__testrail__get_sections`).
2. Tool succeeds -> **MCP path**. Log: `[sparq] Using TestRail MCP`
3. Tool fails (connection/server error) -> check `$TESTRAIL_BASE_URL`, `$TESTRAIL_USERNAME`, `$TESTRAIL_API_KEY` env vars:
   - All set -> **REST path** via `/sparq:testrail-api`. Log: `[sparq] TestRail MCP unavailable — using REST API`
   - Any missing -> skip sync, warn: `[sparq] TestRail: no MCP and missing API credentials — skipping TMS sync`
4. REST call returns 404/422 (endpoint changed) -> **Web path**:
   - `WebSearch "testrail api {endpoint} site:support.testrail.com"` -> extract path/method/body -> retry
   - Log: `[sparq] REST endpoint changed — resolved from TestRail support docs`
   - Web lookup fails -> stop, report error with `https://support.testrail.com/hc/en-us/sections/7077185274644-API-reference`

Cache transport choice per session. All operations below list MCP and REST equivalents.
</transport_selection>

<project_resolution>
## Project Resolution

1. Read `outputs.tms.testrail.projectId` from `sparq.config.json` -> `${TESTRAIL_PROJECT_ID}`
2. If absent: check `$TESTRAIL_PROJECT_ID` env var
3. If absent: prompt user
4. For multi-suite projects: also resolve `outputs.tms.testrail.suiteId` -> `${TESTRAIL_SUITE_ID}` (env: `$TESTRAIL_SUITE_ID`)

Base URL: `${TESTRAIL_BASE_URL}/index.php?/api/v2` — all REST paths below are relative to this.
</project_resolution>

<upload_workflow>
## Upload Workflow

### 1. Find/Create Sections
- MCP: `mcp__testrail__get_sections(project_id)` -> match by section name
- REST: `GET get_sections/${TESTRAIL_PROJECT_ID}` (add `&suite_id=${TESTRAIL_SUITE_ID}` for multi-suite)
- If section not found: MCP: `mcp__testrail__add_section(project_id, name, parent_id)` / REST: `POST add_section/${TESTRAIL_PROJECT_ID}`
- Map test categories to sections: HP -> "Happy Path", VE -> "Validation/Negative", SEC -> "Security", EC -> "Edge Cases", A11Y -> "Accessibility"

### 2. Deduplicate
- MCP: `mcp__testrail__get_cases(project_id, section_id)` -> collect titles
- REST: `GET get_cases/${TESTRAIL_PROJECT_ID}&section_id={id}` (add `&suite_id=` for multi-suite)
- Exact title match (by TC ID prefix) -> skip (already exists)
- No match -> queue for upload
- Log: `[sparq] Skipped {n} duplicates (already in TestRail)`

### 3. Upload
- MCP: `mcp__testrail__add_case(section_id, title, priority_id, type_id, custom_steps_separated, custom_preconds, refs)` per case
- REST: `POST add_case/{section_id}` with JSON body
- Batch: 10-20 cases per pass, 1s delay between batches
- Enum fields use integers only — see `sparq-testrail-api/SKILL.md` Enum Field Mapping
- **WARNING**: TestRail priority order is REVERSED from Qase (TestRail: 4=Critical; Qase: 1=High)

### 4. Link Jira (via refs field)
- Include Jira ticket IDs in the `refs` field (comma-separated): `"refs": "EP-14,EP-15"`
- MCP: pass as `refs` parameter in `add_case` / REST: include in JSON body
- No separate API call needed — TestRail stores refs as case metadata

### 5. Write tmsId Frontmatter
- After each successful CREATE, write `tmsId: testrail:{caseId}` to local test case YAML frontmatter
- Enables UPDATE on subsequent exports (match by ID, not title)
</upload_workflow>

<verification>
## Verification

Three tiers — all must pass before reporting success.

### Tier 1: Response Check
- Each `add_case` returns JSON with `id` field
- Collect all returned case IDs
- On error response (non-2xx): log and continue remaining cases

### Tier 2: Fetch-back
- MCP: `mcp__testrail__get_cases(project_id, section_id)` / REST: `GET get_cases/${TESTRAIL_PROJECT_ID}&section_id={id}`
- Paginate: REST defaults to 250 per page (`limit`/`offset`). If response has `_links.next`, fetch all pages before comparing.
- Count: uploaded + pre-existing = total in section
- Titles: every local title exists in response
- Mismatch: retry 2x with 2s delay. If still mismatched -> report warning, keep local files.

### Tier 3: Spot-check (non-blocking)
- MCP: `mcp__testrail__get_case(case_id)` on 1-2 uploaded cases / REST: `GET get_case/{id}`
- Verify: `custom_steps_separated` non-empty, `custom_preconds` populated, `priority_id` matches input
- Mismatch: WARN only, do not block
</verification>

<cleanup_decision>
## Cleanup Decision

**Never remove local files without explicit user confirmation.**

Decision tree after verification:
- Tier 1 + 2 pass -> present directory path + file count, ask user to confirm removal of `.sparq/test-cases/TC-{feature}-manual.md` source
- Tier 3 fail -> warn about structure issues, then ask user to confirm
- Tier 2 fail -> STOP, keep files, report mismatch
- Tier 1 fail -> STOP, keep files, report upload error

For remote case removal policy (orphaned TestRail cases): see `tms-abstraction.md` `<removal_policy>`.
</cleanup_decision>

<partial_recovery>
## Partial Upload Recovery

On retry after previous failure:

1. Read local test cases from `.sparq/test-cases/TC-{feature}-manual.md`
2. Fetch existing cases from TestRail section by title (MCP or REST per transport)
3. Diff: upload only cases not found remotely (match by TC ID prefix in title)
4. Run full verification on complete set (local + previously uploaded)
5. Report: `[sparq] Resumed: {n} remaining ({m} already existed)`
</partial_recovery>

<progress_output>
## Progress Output

### Success
```
[sparq] Syncing to TestRail...
[sparq] +-- Project: ${TESTRAIL_PROJECT_ID} (found)
[sparq] +-- Section: "{name}" (found|created, ID: {id})
[sparq] +-- Cases: {n}/{total} uploaded ({skipped} duplicates skipped)
[sparq] +-- Verification: passed
[sparq] +-- Done. Source of truth: TestRail section "{name}"
```

### Failure
```
[sparq] +-- Cases: {n}/{total} uploaded
[sparq] +-- FAILED: {reason}
[sparq] Files preserved: .sparq/test-cases/TC-{feature}-manual.md
[sparq] Retry: /sparq:export testrail {feature}
```
</progress_output>
