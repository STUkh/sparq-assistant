# Zephyr Scale Export Format Reference

Zephyr Scale-specific MCP tool patterns, entity mapping, and export format. Referenced by: export skill. For provider-agnostic priority/type mapping and update algorithm, see `tms-abstraction.md`.

<zephyr_tools>
Core MCP tools used by SparQ (from `mcp-zephyr-scale`):
- `mcp__zephyr__get_folders` (project_key, folderType?) — list folders (test case folders / cycle folders)
- `mcp__zephyr__create_folder` (project_key, name, folderType, parentId?) — create folder
- `mcp__zephyr__get_test_cases` (project_key, folderId?, maxResults?) — list test cases
- `mcp__zephyr__get_test_case` (project_key, test_case_key) — get single test case
- `mcp__zephyr__create_test_case` (project_key, name, folderId?, priority?, statusName?, labels?, steps?) — create test case
- `mcp__zephyr__update_test_case` (project_key, test_case_key, ...fields) — update test case
- `mcp__zephyr__create_test_cycle` (project_key, name, folderId?, plannedStartDate?, plannedEndDate?) — create test cycle
- `mcp__zephyr__get_test_executions` (project_key, test_cycle_key) — list executions in a cycle
- `mcp__zephyr__create_test_execution` (project_key, test_cycle_key, test_case_key, statusName, ...) — add execution result
- `mcp__zephyr__add_test_result` (project_key, test_case_key, statusName, comment?, executionTime?) — record result on a test case
</zephyr_tools>

<zephyr_entity_mapping>
SparQ concept -> Zephyr Scale entity:
- Test section/category -> Folder (hierarchical, nested by category under a parent folder)
- Test case -> Test Case (identified by `testCaseKey` e.g. `TC-PROJ-42`)
- Priority -> priority field. Forward/reverse mappings in `tms-abstraction.md` `<priority_mapping>` / `<reverse_priority_mapping>`
- Category -> Folder name (e.g., "Happy Path", "Security", "Edge Cases", "Accessibility")
- Test run / execution cycle -> Test Cycle
- Test result -> Test Execution (`statusName`: PASS / FAIL / BLOCKED / NOT_EXECUTED / IN_PROGRESS)
</zephyr_entity_mapping>

<zephyr_priority_mapping>
Abstract priority -> Zephyr Scale priority value (string label):
- critical -> "Critical"
- high -> "High"
- medium -> "Normal"
- low -> "Low"

Reverse:
- "Critical" -> critical
- "High" -> high
- "Normal" -> medium
- "Low" -> low
- (unrecognised) -> medium
</zephyr_priority_mapping>

<zephyr_status_mapping>
Execution status values (case-sensitive):
- PASS — test passed
- FAIL — test failed
- BLOCKED — test blocked (dependency issue)
- NOT_EXECUTED — test not run yet (default for new executions)
- IN_PROGRESS — test currently being executed
</zephyr_status_mapping>

<zephyr_case_creation>
Parameters for `mcp__zephyr__create_test_case`:
- `project_key`: string — from `ZEPHYR_PROJECT_KEY` env or `outputs.tms.zephyr.projectKey`
- `name`: string — "TC-login-HP-001: Verify successful login with valid credentials"
- `folderId`: string — from category->folder mapping
- `priority`: string — "Critical" | "High" | "Normal" | "Low" (mapped from abstract priority)
- `statusName`: string — "Draft" | "Approved" | "Deprecated" (default "Approved" for exported cases)
- `labels`: string[] — category tags (e.g., ["HP", "smoke", "login"])
- `precondition`: string (optional) — plain text; stored as test case precondition field, not as a step
- `steps`: array — `[{ description, expectedResult, testData? }]`

Steps format:
```json
[
  { "description": "Navigate to login page", "expectedResult": "Login form is displayed" },
  { "description": "Enter valid credentials", "expectedResult": "Fields accept input", "testData": "test.user@example.com / P@ssw0rd123!" }
]
```

Preconditions are stored in the test case `precondition` field (plain text, not steps).

Full create payload example:
```json
{
  "project_key": "PROJ",
  "name": "TC-login-HP-001: Verify successful login with valid credentials",
  "folderId": "f-001",
  "priority": "High",
  "statusName": "Approved",
  "labels": ["HP", "login", "smoke"],
  "precondition": "User account test.user@example.com exists and is active",
  "steps": [
    { "description": "Navigate to /login", "expectedResult": "Login form displayed" },
    { "description": "Enter valid credentials and click Sign In", "expectedResult": "Redirected to /dashboard" }
  ]
}
```
</zephyr_case_creation>

<zephyr_read_response>
**mcp__zephyr__get_test_cases response** (per case):
```json
{
  "testCaseKey": "TC-PROJ-42",
  "name": "TC-login-HP-001: Verify successful login",
  "folderId": "f-001",
  "priority": "High",
  "statusName": "Approved",
  "precondition": "User account exists and is active",
  "labels": ["HP", "login"],
  "steps": [
    { "description": "Navigate to /login", "expectedResult": "Login form displayed", "testData": "" },
    { "description": "Enter credentials", "expectedResult": "Fields accept input", "testData": "test.user@example.com" }
  ]
}
```

**mcp__zephyr__get_folders response** (per folder):
```json
{ "id": "f-001", "name": "Happy Path", "folderType": "TEST_CASE", "parentId": null, "index": 0 }
```

### Normalization Rules
1. Use `testCaseKey` as the remote ID for `tmsId` format: `tmsId: zephyr:TC-PROJ-42`
2. Reverse-map `priority` string per `<zephyr_priority_mapping>`. Infer category from `labels` or folder name.
3. Parse `steps` → TestStep[]. If empty → `automationStatus: "not_automatable"`.
4. `precondition` field maps to TestCase `preconditions[]` (split on newlines or semicolons).
</zephyr_read_response>

<zephyr_cycle_workflow>
When posting test execution results to Zephyr Scale:
1. Create or find an existing test cycle: `mcp__zephyr__create_test_cycle` (name: "SparQ Run {timestamp}")
2. For each test case: `mcp__zephyr__create_test_execution` with `test_cycle_key` and `test_case_key`
3. Set `statusName` from test runner output: PASS / FAIL / BLOCKED / NOT_EXECUTED
4. Optionally include `comment` with failure details or CI link
</zephyr_cycle_workflow>

<zephyr_error_handling>
- 401 Unauthorized: verify ZEPHYR_API_TOKEN is valid and not expired
- 403 Forbidden: verify token has write access to the project (ZEPHYR_PROJECT_KEY)
- 404 Not Found: verify testCaseKey format matches project (e.g., "TC-PROJ-42" not "42")
- 429 Rate Limited: apply exponential backoff per `error-handling.md`; default 60s between large batches
- Duplicate folder: call `mcp__zephyr__get_folders` first, reuse if name matches
- Duplicate case: match by name prefix (TC ID pattern) via `mcp__zephyr__get_test_cases`; update instead of create
- Invalid step format: ensure `description` and `expectedResult` are non-empty strings
</zephyr_error_handling>

<zephyr_fallback>
When Zephyr Scale MCP is unavailable:
1. Log `"[sparq] Zephyr Scale MCP unavailable"`
2. Check if `$ZEPHYR_API_TOKEN` and `$ZEPHYR_BASE_URL` are set
3. If set: use direct REST API (Server: `{ZEPHYR_BASE_URL}/rest/atm/1.0/testcase`; Cloud: `https://api.zephyrscale.smartbear.com/v2/testcases`; see `zephyr-sync.md` for full path map)
4. If REST also fails: apply Web Docs Fallback per `degradation-strategy.md` `<local_skill_fallback>`
5. Final fallback: write JSON to `.sparq/tms-export/TC-{feature}-zephyr.json` for manual import

Fallback JSON format (manual import):
```json
{
  "projectKey": "PROJ",
  "folders": [
    {
      "name": "Happy Path",
      "testCases": [
        {
          "name": "TC-login-HP-001: Verify successful login",
          "priority": "High",
          "statusName": "Approved",
          "labels": ["HP", "login"],
          "precondition": "User account exists",
          "steps": [
            { "description": "Navigate to /login", "expectedResult": "Login form displayed" }
          ]
        }
      ]
    }
  ]
}
```
Written to: `.sparq/tms-export/TC-{feature}-zephyr.json`
For complete sync workflow with verification and recovery, see `zephyr-sync.md`.
</zephyr_fallback>

## See Also

- `testrail-formats.md` — TestRail export format and MCP tools
- `qase-formats.md` — Qase export format and MCP tools
- `local-tms-formats.md` — Local file-based export format
- `tms-abstraction.md` — Provider-agnostic TMS interface, priority/type mappings, update algorithm
