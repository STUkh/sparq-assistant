# Qase Export Format Reference

Qase-specific MCP tool patterns, entity mapping, and export format. Referenced by: export skill, manual-test-writer. For provider-agnostic interface, see `tms-abstraction.md`.

<qase_tools>
Core MCP tools used by SparQ (from `@qase/mcp-server`):
- `mcp__qase__list_suites` (project_code) — list all suites
- `mcp__qase__create_suite` (project_code, title, description?, parent_id?) — create suite
- `mcp__qase__list_cases` (project_code, suite_id?) — list test cases
- `mcp__qase__get_case` (project_code, case_id) — get single case
- `mcp__qase__create_case` (project_code, title, suite_id?, severity?, priority?, preconditions?, postconditions?, steps?) — create case
- `mcp__qase__update_case` (project_code, case_id, ...fields) — update case
- `mcp__qase__bulk_create_cases` (project_code, cases[]) — batch create (use for >5 cases)
- `mcp__qase__create_run` (project_code, title, cases[]) — create test run
- `mcp__qase__create_result` (project_code, run_id, case_id, status, ...) — add result
</qase_tools>

<qase_entity_mapping>
SparQ concept -> Qase entity:
- Test section/category -> Suite (hierarchical, nested by category)
- Test case -> Case (with steps_type: "classic")
- Priority -> severity field. Forward/reverse mappings in `tms-abstraction.md` `<priority_mapping>` / `<reverse_priority_mapping>`
- Category -> Suite name (e.g., "Happy Path", "Security", "Edge Cases", "Accessibility"). Mappings in `tms-abstraction.md` `<type_mapping>` / `<reverse_type_mapping>`
- Test run -> Run
- Test result -> Result (status: passed/failed/blocked/skipped/invalid)
</qase_entity_mapping>

<qase_case_creation>
Parameters for `mcp__qase__create_case`:
- `project_code`: string — from `outputs.tms.qase.projectCode`
- `title`: string — "TC-login-HP-001: Verify successful login with valid credentials"
- `suite_id`: number — from category->suite mapping
- `severity`: number — 1-6, mapped from abstract priority (see tms-abstraction.md)
- `priority`: number — 1 (high), 2 (medium), 3 (low)
- `preconditions`: string — precondition text
- `postconditions`: string — expected final state
- `steps`: array — `[{ position, action, expected_result, data }]`
- `tags`: string[] — category tags (e.g., ["HP", "smoke", "login"])
- `refs`: string — Jira ticket reference (e.g., "EP-14")

Steps format:
```json
[
  { "position": 1, "action": "Navigate to login page", "expected_result": "Login form is displayed" },
  { "position": 2, "action": "Enter valid credentials", "expected_result": "Fields accept input" }
]
```
</qase_case_creation>

<qase_json_export>
Fallback JSON format (when Qase MCP unavailable):
```json
{
  "projectCode": "PROJ",
  "suites": [
    {
      "title": "Happy Path",
      "cases": [
        {
          "title": "TC-login-HP-001: Verify successful login",
          "severity": 2,
          "priority": 1,
          "preconditions": "User has valid credentials",
          "steps": [
            { "position": 1, "action": "Navigate to /login", "expected_result": "Login form displayed" }
          ],
          "tags": ["HP", "login"],
          "refs": "EP-14"
        }
      ]
    }
  ]
}
```
Written to: `.sparq/tms-export/TC-{feature}-qase.json`
</qase_json_export>

<qase_read_response>
**mcp__qase__list_cases response** (per case):
```json
{
  "id": 301,
  "title": "Verify successful login",
  "suite_id": 10,
  "severity": 2,
  "priority": 1,
  "preconditions": "User has valid credentials",
  "postconditions": "User session is active",
  "steps_type": "classic",
  "steps": [
    { "position": 1, "action": "Navigate to /login", "expected_result": "Login form displayed", "data": "" }
  ],
  "tags": [{ "title": "HP" }, { "title": "smoke" }],
  "refs": "EP-14"
}
```

**mcp__qase__list_suites response** (per suite):
```json
{ "id": 10, "title": "Happy Path", "description": "...", "parent_id": null, "cases_count": 15 }
```

### Normalization Rules
1. Generate SparQ TC ID: `TC-{feature}-{ABBR}-{NNN}`.
2. Reverse-map `severity` per `tms-abstraction.md`. Infer category from `tags` or suite title.
3. Parse `steps` → TestStep[]. If empty → `automationStatus: "not_automatable"`.
</qase_read_response>

<qase_error_handling>
- 429 Rate Limited: respect Retry-After header, exponential backoff per `error-handling.md`
- 400 Bad Request: verify field names match Qase API schema
- 403 Forbidden: verify API token and project access permissions
- Duplicate suite: search existing suites first, reuse by title match
- Duplicate case: match by title prefix (TC ID pattern), update instead of create
- Batch creation: use `bulk_create_cases` for >5 cases, 2s delay between batches of 20
</qase_error_handling>
