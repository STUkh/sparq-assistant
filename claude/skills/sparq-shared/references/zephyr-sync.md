# Zephyr Scale Sync Workflow

Operational sync workflow for uploading test cases to Zephyr Scale TMS. Covers transport detection, dual MCP/REST operations, verification, and recovery.

For entity mapping and MCP tool params: `zephyr-formats.md`. For retry/error rules: `degradation-strategy.md`. For CREATE/UPDATE/SKIP/REMOVE classification: `tms-abstraction.md`.

<transport_selection>
## Transport Selection

3-tier detection: MCP -> REST API -> Web docs.

1. Attempt Zephyr Scale MCP tool (e.g., `mcp__zephyr__get_folders`).
2. Tool succeeds -> **MCP path**. Log: `[sparq] Using Zephyr Scale MCP`
3. Tool fails (connection/server error) -> check `$ZEPHYR_API_TOKEN` and `$ZEPHYR_BASE_URL` env vars:
   - Both set -> **REST path**. Log: `[sparq] Zephyr Scale MCP unavailable — using REST API`
   - Either missing -> skip sync, warn: `[sparq] Zephyr Scale: no MCP and missing API credentials — skipping TMS sync`
4. REST call returns 404/422 (endpoint changed) -> **Web path**:
   - `WebSearch "zephyr scale api {endpoint} site:smartbear.com"` -> extract path/method/body -> retry
   - Log: `[sparq] REST endpoint changed — resolved from Zephyr Scale docs`
   - Web lookup fails -> stop, report error with `https://support.smartbear.com/zephyr-scale-cloud/api-docs/`

Cache transport choice per session. All operations below list MCP and REST equivalents.

### Cloud vs Server Detection
Zephyr Scale Cloud and Server have different REST APIs. Detect from `$ZEPHYR_BASE_URL`:
- **Cloud**: URL contains `atlassian.net` or is absent (Cloud-only token auth) -> base: `https://api.zephyrscale.smartbear.com/v2`
- **Server/DC**: URL contains custom domain (e.g., `jira.company.com`) -> base: `${ZEPHYR_BASE_URL}/rest/atm/1.0`

Log detected variant: `[sparq] Zephyr Scale REST: {Cloud v2|Server v1} (from base URL)`

Endpoint path map (relative to base):

| Operation | Server v1 | Cloud v2 |
|---|---|---|
| List folders | `GET /folder?projectKey={KEY}&folderType=TEST_CASE` | `GET /folders?projectKey={KEY}&folderType=TEST_CASE` |
| Create folder | `POST /folder` | `POST /folders` |
| List test cases | `GET /testcase/search?query=projectKey="{KEY}" AND folderId={id}` | `GET /testcases?projectKey={KEY}&folderId={id}` |
| Get test case | `GET /testcase/{testCaseKey}` | `GET /testcases/{testCaseKey}` |
| Create test case | `POST /testcase` | `POST /testcases` |
| Update test case | `PUT /testcase/{testCaseKey}` | `PUT /testcases/{testCaseKey}` |

Response differences:
- Cloud v2 wraps lists in `{"values":[...],"startAt":0,"maxResults":50,"total":N,"isLast":bool,"next":url|null}` — Server v1 returns raw arrays via `/testcase/search` with `maxResults`/`startAt` params
- Cloud v2 creation returns `key` field — Server v1 returns `testCaseKey`

### REST Quick Reference
- Base URL: `${ZEPHYR_BASE_URL}/rest/atm/1.0` (Server) or `https://api.zephyrscale.smartbear.com/v2` (Cloud)
- Auth: `Authorization: Bearer $ZEPHYR_API_TOKEN`
- Content-Type: `application/json`
</transport_selection>

<project_resolution>
## Project Resolution

1. Read `outputs.tms.zephyr.projectKey` from `sparq.config.json` -> `${ZEPHYR_PROJECT_KEY}`
2. If absent: check `$ZEPHYR_PROJECT_KEY` env var
3. If absent: prompt user

Zephyr Scale projects map to Jira project keys. Ensure the key matches the Jira project.
</project_resolution>

<upload_workflow>
## Upload Workflow

REST paths below use Server v1 format. For Cloud v2, substitute per the endpoint path map in Transport Selection above.

### 1. Find/Create Folders
- MCP: `mcp__zephyr__get_folders(project_key, folderType: "TEST_CASE")` -> match by folder name
- REST: `GET /folder?projectKey=${ZEPHYR_PROJECT_KEY}&folderType=TEST_CASE` with auth header
- If folder not found: MCP: `mcp__zephyr__create_folder(project_key, name, folderType: "TEST_CASE")` / REST: `POST /folder` with `{"projectKey":"${ZEPHYR_PROJECT_KEY}","name":"{name}","folderType":"TEST_CASE"}`
- Map test categories to folders: HP -> "Happy Path", VE -> "Validation/Negative", SEC -> "Security", EC -> "Edge Cases", A11Y -> "Accessibility"

### 2. Deduplicate
- MCP: `mcp__zephyr__get_test_cases(project_key, folderId)` -> collect names
- REST: `GET /testcase/search?query=projectKey="${ZEPHYR_PROJECT_KEY}" AND folderId={id}&maxResults=100`
- Match by TC ID prefix in name -> skip (already exists)
- No match -> queue for upload
- Log: `[sparq] Skipped {n} duplicates (already in Zephyr Scale)`

### 3. Upload
- MCP: `mcp__zephyr__create_test_case(project_key, name, folderId, priority, statusName, labels, precondition, steps)` per case
- REST: `POST /testcase` with JSON body:
  ```json
  {
    "projectKey": "${ZEPHYR_PROJECT_KEY}",
    "name": "TC-login-HP-001: Verify login",
    "folderId": "{id}",
    "priority": "High",
    "statusName": "Approved",
    "labels": ["HP", "login"],
    "precondition": "User account exists",
    "testScript": {
      "type": "STEP_BY_STEP",
      "steps": [
        {"description": "Navigate to /login", "expectedResult": "Login form displayed"}
      ]
    }
  }
  ```
- Priority uses string labels: "Critical" | "High" | "Normal" | "Low" — see `zephyr-formats.md` `<zephyr_priority_mapping>`
- Batch: process sequentially (no bulk endpoint), 1s delay between cases

### 4. Link Jira (non-critical)
- Zephyr Scale test cases are linked to Jira projects via `projectKey`
- Additional ticket linking: include Jira issue keys in `labels` array (e.g., `["EP-14"]`)
- Warn on failure, never stop upload

### 5. Write tmsId Frontmatter
- After each successful CREATE, response includes `testCaseKey` (e.g., `TC-PROJ-42`)
- Write `tmsId: zephyr:{testCaseKey}` to local test case YAML frontmatter
- Enables UPDATE on subsequent exports (match by key, not name)
</upload_workflow>

<verification>
## Verification

Three tiers — all must pass before reporting success.

### Tier 1: Response Check
- Each create returns JSON with `testCaseKey` field
- Collect all returned keys
- On error response (non-2xx): log and continue remaining cases

### Tier 2: Fetch-back
- MCP: `mcp__zephyr__get_test_cases(project_key, folderId)` / REST: `GET /testcase/search?query=projectKey="${ZEPHYR_PROJECT_KEY}" AND folderId={id}`
- Paginate: MCP `maxResults` defaults to 50; REST defaults vary by Cloud/Server. Fetch all pages (`startAt` offset) before comparing.
- Count: uploaded + pre-existing = total in folder
- Names: every local name exists in response
- Mismatch: retry 2x with 2s delay. If still mismatched -> report warning, keep local files.

### Tier 3: Spot-check (non-blocking)
- MCP: `mcp__zephyr__get_test_case(project_key, test_case_key)` on 1-2 uploaded cases / REST: `GET /testcase/{testCaseKey}`
- Verify: `steps` non-empty, `precondition` populated, `priority` matches input
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

For remote case removal policy (orphaned Zephyr Scale cases): see `tms-abstraction.md` `<removal_policy>`.
</cleanup_decision>

<partial_recovery>
## Partial Upload Recovery

On retry after previous failure:

1. Read local test cases from `.sparq/test-cases/TC-{feature}-manual.md`
2. Fetch existing cases from Zephyr Scale folder by name (MCP or REST per transport)
3. Diff: upload only cases not found remotely (match by TC ID prefix in name)
4. Run full verification on complete set (local + previously uploaded)
5. Report: `[sparq] Resumed: {n} remaining ({m} already existed)`
</partial_recovery>

<progress_output>
## Progress Output

### Success
```
[sparq] Syncing to Zephyr Scale...
[sparq] +-- Project: ${ZEPHYR_PROJECT_KEY} (found)
[sparq] +-- Folder: "{name}" (found|created, ID: {id})
[sparq] +-- Cases: {n}/{total} uploaded ({skipped} duplicates skipped)
[sparq] +-- Verification: passed
[sparq] +-- Done. Source of truth: Zephyr Scale folder "{name}"
```

### Failure
```
[sparq] +-- Cases: {n}/{total} uploaded
[sparq] +-- FAILED: {reason}
[sparq] Files preserved: .sparq/test-cases/TC-{feature}-manual.md
[sparq] Retry: /sparq:export zephyr {feature}
```
</progress_output>
