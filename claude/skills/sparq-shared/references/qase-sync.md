# Qase Sync Workflow

Operational sync workflow for uploading test cases to Qase TMS. Covers transport detection, dual MCP/REST operations, verification, and recovery.

For entity mapping and case creation params: `qase-formats.md`. For enum field values: `sparq-qase-api/SKILL.md`. For retry/error rules: `degradation-strategy.md`. For CREATE/UPDATE/SKIP/REMOVE classification: `tms-abstraction.md`.

<transport_selection>
## Transport Selection

3-tier detection: MCP -> REST API -> Web docs.

1. Attempt Qase MCP tool (e.g., `mcp__qase__list_suites`).
2. Tool succeeds -> **MCP path**. Log: `[sparq] Using Qase MCP`
3. Tool fails (connection/server error) -> check `$QASE_API_TOKEN` env var:
   - Set -> **REST path**. Log: `[sparq] Qase MCP unavailable — using REST API`
   - Not set -> skip sync, warn user: `[sparq] Qase: no MCP and no API token — skipping TMS sync`
4. REST call returns 404/422 (endpoint changed) -> **Web path**:
   - `WebSearch "qase api {endpoint} site:developers.qase.io"` -> extract path/method/body -> retry
   - Log: `[sparq] REST endpoint changed — resolved from Qase developer docs`
   - Web lookup fails -> stop, report error with `https://developers.qase.io/reference/`

Cache transport choice per session. All operations below list MCP and REST equivalents.
</transport_selection>

<project_resolution>
## Project Resolution

1. Read `outputs.tms.qase.projectCode` from `sparq.config.json` -> `${QASE_PROJECT_CODE}`
2. If absent: check `$QASE_DEFAULT_PROJECT` env var
3. If absent: prompt user

Jira project prefix != Qase project code. Never infer one from the other.
</project_resolution>

<upload_workflow>
## Upload Workflow

### 1. Find/Create Project
- MCP: `mcp__qase__list_suites(project_code)` — if returns data, project exists
- REST: `GET /v1/project?limit=100` -> filter `.code == "${QASE_PROJECT_CODE}"`
- If not found: ask user before creating. MCP: no direct tool; REST: `POST /v1/project`

### 2. Find/Create Suite
- MCP: `mcp__qase__list_suites(project_code)` -> match by feature/category title
- REST: `GET /v1/suite/${QASE_PROJECT_CODE}?limit=100` -> filter by `.title`
- If not found: MCP: `mcp__qase__create_suite(project_code, title)` / REST: `POST /v1/suite/${QASE_PROJECT_CODE}`
- Map test categories to suites: HP -> "Happy Path", VE -> "Validation/Negative", SEC -> "Security", EC -> "Edge Cases", A11Y -> "Accessibility"

### 3. Deduplicate
- MCP: `mcp__qase__list_cases(project_code, suite_id)` -> collect titles
- REST: `GET /v1/case/${QASE_PROJECT_CODE}?suite_id={id}&limit=100`
- Exact title match -> skip (already exists)
- No match -> queue for upload
- Log: `[sparq] Skipped {n} duplicates (already in Qase)`

### 4. Upload
- <=5 cases: MCP: `mcp__qase__create_case` per case / REST: `POST /v1/case/${QASE_PROJECT_CODE}`
- >5 cases: MCP: `mcp__qase__bulk_create_cases(project_code, cases[])` / REST: `POST /v1/case/${QASE_PROJECT_CODE}/bulk`
- Batch limit: 20 cases per bulk call, 2s delay between batches
- Enum fields use integers only — see `sparq-qase-api/SKILL.md` Enum Field Mapping

### 5. Link Jira (non-critical)
- MCP: `mcp__qase__attach_external_issue` (if available)
- REST: `POST /v1/case/${QASE_PROJECT_CODE}/external-issue/attach` with `type: "jira-cloud"`, `links: [{case_id, external_issues: ["TICKET-ID"]}]`
- Warn on failure, never stop upload
</upload_workflow>

<verification>
## Verification

Three tiers — all must pass before reporting success.

### Tier 1: Response Check
- HTTP 200/201 on each create call
- Collect returned case IDs (single: `result.id`, bulk: `result.ids[]`)
- Bulk: verify `ids` array length matches input count

### Tier 2: Fetch-back
- MCP: `mcp__qase__list_cases(project_code, suite_id)` / REST: `GET /v1/case/${QASE_PROJECT_CODE}?suite_id={id}&limit=100`
- Paginate: REST returns max 100 per page (`limit`/`offset`). If `filtered` > returned count, fetch all pages before comparing.
- Count: uploaded + pre-existing = total in suite
- Titles: every local title exists in response
- Mismatch: retry 2x with 2s delay. If still mismatched -> report warning, keep local files.

### Tier 3: Spot-check (non-blocking)
- MCP: `mcp__qase__get_case(project_code, case_id)` on 1-2 uploaded cases / REST: `GET /v1/case/${QASE_PROJECT_CODE}/{id}`
- Verify: `steps` non-empty, `preconditions` populated, `priority` matches input
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

For remote case removal policy (orphaned Qase cases): see `tms-abstraction.md` `<removal_policy>`.
</cleanup_decision>

<partial_recovery>
## Partial Upload Recovery

On retry after previous failure:

1. Read local test cases from `.sparq/test-cases/TC-{feature}-manual.md`
2. Fetch existing cases from Qase suite by title (MCP or REST per transport)
3. Diff: upload only cases not found remotely
4. Run full verification on complete set (local + previously uploaded)
5. Report: `[sparq] Resumed: {n} remaining ({m} already existed)`
</partial_recovery>

<progress_output>
## Progress Output

### Success
```
[sparq] Syncing to Qase...
[sparq] ├── Project: ${QASE_PROJECT_CODE} (found)
[sparq] ├── Suite: "{name}" (found|created, ID: {id})
[sparq] ├── Cases: {n}/{total} uploaded ({skipped} duplicates skipped)
[sparq] ├── Verification: passed
[sparq] └── Done. Source of truth: Qase suite "{name}"
```

### Failure
```
[sparq] ├── Cases: {n}/{total} uploaded
[sparq] └── FAILED: {reason}
[sparq] Files preserved: .sparq/test-cases/TC-{feature}-manual.md
[sparq] Retry: /sparq:export qase {feature}
```
</progress_output>
