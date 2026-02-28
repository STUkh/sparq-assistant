---
name: sparq:testrail-api
description: |
  Direct TestRail REST API v2 reference for HTTP calls via curl/Bash. Use when TestRail MCP server
  is unavailable, broken, or returning errors and direct API interaction is needed. Covers all
  endpoint groups (projects, suites, sections, cases, tests, runs, results, plans, milestones,
  users, priorities, statuses, case types/fields, configs, attachments) with curl examples.
  Project ID: from outputs.tms.testrail.projectId in sparq.config.json (env: TESTRAIL_PROJECT_ID).
  Triggered by: MCP broken, use TestRail API directly, curl TestRail, bypass MCP,
  or when mcp__testrail__ tools fail and TestRail operations are needed.
---

# TestRail REST API v2

## Workflow

Config preamble: read `sparq.config.json`, resolve `outputs.tms.testrail.projectId` as `TESTRAIL_PROJECT_ID` and `outputs.tms.testrail.baseUrl` as `TESTRAIL_BASE_URL` for all API calls. If not configured, check `$TESTRAIL_PROJECT_ID` and `$TESTRAIL_BASE_URL` env variables. For multi-suite projects, also resolve `outputs.tms.testrail.suiteId` as `TESTRAIL_SUITE_ID`.

1. Identify the operation from the [Endpoint Index](#endpoint-index) below
2. **Read the matching reference file** for curl examples and body schemas:
   - Projects, Suites, Sections, Cases → Read [references/projects-suites-sections-cases.md](references/projects-suites-sections-cases.md)
   - Runs, Results, Plans, Tests → Read [references/runs-results-plans.md](references/runs-results-plans.md)
   - All other entities → Read [references/other-endpoints.md](references/other-endpoints.md)
3. Use enum values from [Enum Field Mapping](#enum-field-mapping) (integers, not strings)
4. On 404/422 errors → apply [Web Docs Fallback](#web-docs-fallback)

**Do not load all reference files at once — load only the one needed for the current operation.**

## Quick Reference

- Base URL: `${TESTRAIL_BASE_URL}/index.php?/api/v2` — instance-specific. Resolved from `outputs.tms.testrail.baseUrl` in `sparq.config.json`, or `$TESTRAIL_BASE_URL` env. Format: `https://{instance}.testrail.io`
- Auth: HTTP Basic via `-u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"` — env variables from `mcp/testrail.json`
- Content-Type: `application/json`
- Project ID: `${TESTRAIL_PROJECT_ID}` — numeric, resolved from `outputs.tms.testrail.projectId` in `sparq.config.json`. Env override: `TESTRAIL_PROJECT_ID`
- Suite ID: `${TESTRAIL_SUITE_ID}` — required for multi-suite projects. From `outputs.tms.testrail.suiteId`. Env: `TESTRAIL_SUITE_ID`
- Rate limit: 429 with variable `Retry-After` header (seconds to wait)
- Pagination: `limit` (default 250), `offset`. Bulk endpoints return `_links.next` URL for next page
- Response format: Direct JSON objects/arrays (no wrapper envelope). Bulk endpoints:
  ```json
  { "offset": 0, "limit": 250, "size": N, "_links": { "next": "/api/v2/..." }, "cases": [...] }
  ```
- Suite modes: single-suite (no `suite_id` needed), single-suite+baselines, multi-suite (`suite_id` required on section/case endpoints)

## Enum Field Mapping

**CRITICAL: Text labels ("high", "smoke") FAIL. Use integer values.**

**WARNING: TestRail priority order is REVERSED from Qase. TestRail: 4=Critical (highest). Qase: 1=High (highest). Double-check when migrating.**

### Priority
- 1 → Low
- 2 → Medium
- 3 → High
- 4 → Critical

### Type
- 1 → Acceptance
- 2 → Accessibility
- 3 → Automated
- 4 → Compatibility
- 5 → Destructive
- 6 → Functional
- 7 → Performance
- 8 → Regression
- 9 → Security
- 10 → Usability

### Status (for results)
- 1 → Passed
- 2 → Blocked
- 3 → Untested (default)
- 4 → Retest
- 5 → Failed

## Error Handling

### 429 Rate Limit Pattern

```bash
response=$(curl -s -w "\n%{http_code}" -X GET "$URL" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')
if [ "$http_code" = "429" ]; then
  retry_after=$(echo "$response" | grep -i "Retry-After" | awk '{print $2}' | tr -d '\r')
  sleep "${retry_after:-60}"
  response=$(curl -s -w "\n%{http_code}" -X GET "$URL" \
    -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
fi
```

### Common Errors
- 401 — invalid credentials (check username + API key)
- 403 — insufficient permissions (check project access, API enabled in admin settings)
- 404 — resource not found (check project ID, entity IDs; if path seems correct → web fallback)
- 422 — validation error (check required fields, enum IDs; if fields seem correct → web fallback)
- 429 — rate limit (wait `Retry-After` seconds, retry once)
- 500 — server error (retry once)

### Web Docs Fallback

If REST call returns 404 or 422 and the request looks correct, the endpoint may have changed.

1. Search: `WebSearch "testrail api {endpoint-name} site:support.testrail.com"`
2. Fetch: `WebFetch "https://support.testrail.com/hc/en-us/articles/{article-id}"` with prompt to extract path, method, body fields
3. Use extracted info to retry the operation
4. Log: `[sparq] REST endpoint changed — resolved from TestRail support docs`
5. If web lookup fails → stop, report error with `https://support.testrail.com/hc/en-us/sections/7077185274644-API-reference` for manual check

### Parse Response

```bash
body=$(curl -s -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" "$URL")
# Extract with python3 (universally available)
count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d.get('size',1))")
```

## Destructive Operations

**All DELETE endpoints and close operations require explicit user confirmation before execution.**

Before calling any DELETE endpoint or `close_run`/`close_plan`, present:

```
[sparq] About to {DELETE|CLOSE} {entity type}:
  - {entity description (title/ID)}
  - Endpoint: POST {path}

This action is irreversible. Proceed? (yes / cancel)
```

Never execute a DELETE or close call without user approval. Closing a run or plan is permanent — no results can be added afterward.

## Endpoint Index

### Projects
- GET get_project/{project_id} — get project
- GET get_projects — list all projects
- POST add_project — create project
- POST update_project/{project_id} — update project
- POST delete_project/{project_id} — delete project

### Suites
- GET get_suite/{suite_id} — get suite
- GET get_suites/{project_id} — list suites
- POST add_suite/{project_id} — create suite
- POST update_suite/{suite_id} — update suite
- POST delete_suite/{suite_id} — delete suite

### Sections
- GET get_section/{section_id} — get section
- GET get_sections/{project_id} — list sections (filter: `&suite_id=`)
- POST add_section/{project_id} — create section
- POST update_section/{section_id} — update section
- POST delete_section/{section_id} — delete section

### Cases
- GET get_case/{case_id} — get case
- GET get_cases/{project_id} — list cases (filter: `&suite_id=`, `&section_id=`, `&type_id=`, `&priority_id=`)
- POST add_case/{section_id} — create case
- POST update_case/{case_id} — update case
- POST delete_case/{case_id} — delete case
- POST update_cases/{suite_id} — bulk update cases (or `/{project_id}` for single-suite)
- GET get_history_for_case/{case_id} — case change history

### Tests
- GET get_test/{test_id} — get test (case instance in a run)
- GET get_tests/{run_id} — list tests in a run

### Runs
- GET get_run/{run_id} — get run
- GET get_runs/{project_id} — list runs (filter: `&is_completed=`, `&milestone_id=`)
- POST add_run/{project_id} — create run
- POST update_run/{run_id} — update run
- POST close_run/{run_id} — close run (irreversible)
- POST delete_run/{run_id} — delete run

### Plans
- GET get_plan/{plan_id} — get plan (includes entries with runs)
- GET get_plans/{project_id} — list plans
- POST add_plan/{project_id} — create plan
- POST update_plan/{plan_id} — update plan
- POST close_plan/{plan_id} — close plan (irreversible)
- POST delete_plan/{plan_id} — delete plan

### Results
- GET get_results/{test_id} — list results for a test
- GET get_results_for_case/{run_id}/{case_id} — results for a case in a run
- GET get_results_for_run/{run_id} — all results in a run
- POST add_result/{test_id} — add result for a test
- POST add_result_for_case/{run_id}/{case_id} — add result for a case in a run
- POST add_results/{run_id} — bulk add results by test ID
- POST add_results_for_cases/{run_id} — bulk add results by case ID

### Users
- GET get_user/{user_id} — get user
- GET get_user_by_email — get user by email (`&email=`)
- GET get_users — list all users
- GET get_users/{project_id} — list project users

### Milestones
- GET get_milestone/{milestone_id} — get milestone
- GET get_milestones/{project_id} — list milestones
- POST add_milestone/{project_id} — create milestone
- POST update_milestone/{milestone_id} — update milestone
- POST delete_milestone/{milestone_id} — delete milestone

### Priorities
- GET get_priorities — list all priorities (read-only system values)

### Statuses
- GET get_statuses — list all statuses (read-only system values)

### Case Types
- GET get_case_types — list all case types (read-only)

### Case Fields
- GET get_case_fields — list all case field definitions (includes custom fields)

### Result Fields
- GET get_result_fields — list all result field definitions

### Templates
- GET get_templates/{project_id} — list available templates

### Configs
- GET get_configs/{project_id} — list config groups with configs
- POST add_config_group/{project_id} — create config group
- POST add_config/{config_group_id} — create config in group
- POST update_config_group/{config_group_id} — update config group
- POST update_config/{config_id} — update config
- POST delete_config_group/{config_group_id} — delete config group
- POST delete_config/{config_id} — delete config

### Attachments
- POST add_attachment_to_case/{case_id} — attach file to case (multipart)
- POST add_attachment_to_result/{result_id} — attach file to result (multipart)
- GET get_attachments_for_case/{case_id} — list case attachments
- GET get_attachments_for_test/{test_id} — list test attachments
- GET get_attachment/{attachment_id} — get attachment
- POST delete_attachment/{attachment_id} — delete attachment

## References

- `claude/skills/sparq-shared/references/testrail-formats.md`
- `claude/skills/sparq-shared/references/tms-abstraction.md`
- `claude/skills/sparq-shared/references/degradation-strategy.md`
- `claude/skills/sparq-shared/references/mcp-tool-inventory.md`
- `claude/skills/sparq-shared/references/config-schema.md`

## Cross-References

- TestRail MCP tool inventory: [mcp-tool-inventory.md](../sparq-shared/references/mcp-tool-inventory.md) (TestRail section)
- TestRail export format: [testrail-formats.md](../sparq-shared/references/testrail-formats.md)
- TMS abstraction: [tms-abstraction.md](../sparq-shared/references/tms-abstraction.md)
- Degradation strategy: [degradation-strategy.md](../sparq-shared/references/degradation-strategy.md)

## Examples

```
/sparq:testrail-api
-> "Create a section called 'Authentication' in TestRail"
-> reads sparq.config.json: outputs.tms.testrail.projectId = 1
-> curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_section/1" ...
-> Section created: id=101

/sparq:testrail-api
-> "List all test cases in section 101"
-> curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_cases/1&section_id=101" ...
-> 15 cases found
```
