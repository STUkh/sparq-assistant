---
name: sparq:qase-api
description: |
  Direct Qase REST API v1 reference for HTTP calls via curl/Bash. Use when Qase MCP server
  is unavailable, broken, or returning errors and direct API interaction is needed. Covers all
  endpoint groups (cases, suites, runs, results, projects, milestones, environments, defects,
  shared steps/parameters, configs, custom fields, attachments, users, search) with curl examples.
  Project code: from outputs.tms.qase.projectCode in sparq.config.json (env: QASE_DEFAULT_PROJECT).
  Triggered by: MCP broken, use Qase API directly, curl Qase, bypass MCP,
  or when mcp__qase__ tools fail and Qase operations are needed.
---

# Qase REST API v1

## Workflow

Config preamble: read `sparq.config.json`, resolve `outputs.tms.qase.projectCode` as `QASE_PROJECT_CODE` for all API calls. If not configured, check `$QASE_DEFAULT_PROJECT` env variable.

1. Identify the operation from the [Endpoint Index](#endpoint-index) below
2. **Read the matching reference file** for curl examples and body schemas:
   - Cases, Suites, Projects → Read [references/cases-suites.md](references/cases-suites.md)
   - Runs, Results, Plans → Read [references/runs-results.md](references/runs-results.md)
   - All other entities → Read [references/other-endpoints.md](references/other-endpoints.md)
3. Use enum values from [Enum Field Mapping](#enum-field-mapping) (integers, not strings)
4. On 404/422 errors → apply [Web Docs Fallback](#web-docs-fallback)

**Do not load all reference files at once — load only the one needed for the current operation.**

## Quick Reference

- Base URL: `https://api.qase.io/v1`
- Auth header: `Token: $QASE_API_TOKEN`
- Content-Type: `application/json`
- Project code: `${QASE_PROJECT_CODE}` — resolved from `outputs.tms.qase.projectCode` in `sparq.config.json`. Env override: `QASE_DEFAULT_PROJECT`
- Rate limit: 600 req/min — 429 returns `Retry-After: 60`
- Pagination: `limit` (1-100, default 10), `offset` (0-100000)
- Response envelope:
  ```json
  { "status": true, "result": { "total": N, "filtered": N, "count": N, "entities": [...] } }
  ```

## Enum Field Mapping

**CRITICAL: Text labels ("high", "smoke") FAIL. Use integer values.**

REST API uses plain integers. MCP tools use numeric strings (`"1"`). Both map identically.

### Priority
- P1 (high) → `1`
- P2 (medium) → `2`
- P3 (low) → `3`
- P4 (not set) → `0`

### Type
- Functional → `1`
- Smoke → `2`
- Regression → `3`
- Security → `4`
- Usability → `5`
- Performance → `6`
- Acceptance → `7`

### Behavior
- Positive → `1`
- Negative → `2`
- Destructive → `3`

### Result Status
- passed → `"passed"`
- failed → `"failed"`
- blocked → `"blocked"`
- skipped → `"skipped"`
- invalid → `"invalid"`

## Error Handling

### 429 Rate Limit Pattern

```bash
response=$(curl -s -w "\n%{http_code}" -X GET "$URL" -H "Token: $QASE_API_TOKEN")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')
if [ "$http_code" = "429" ]; then
  sleep 60
  response=$(curl -s -w "\n%{http_code}" -X GET "$URL" -H "Token: $QASE_API_TOKEN")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
fi
```

### Common Errors
- 401 — token missing/invalid
- 403 — insufficient permissions
- 404 — resource not found (check project code, IDs; if path seems correct → web fallback)
- 422 — validation error (check enum IDs, required fields; if fields seem correct → web fallback)
- 429 — rate limit (wait 60s, retry once)
- 500 — server error (retry once)

### Web Docs Fallback

If REST call returns 404 or 422 and the request looks correct, the endpoint may have changed.

1. Search: `WebSearch "qase api {endpoint-name} site:developers.qase.io"`
2. Fetch: `WebFetch "https://developers.qase.io/reference/{endpoint-slug}"` with prompt to extract path, method, body fields
3. Use extracted info to retry the operation
4. Log: `[sparq] REST endpoint changed — resolved from Qase developer docs`
5. If web lookup fails → stop, report error with `https://developers.qase.io/reference/` for manual check

### Parse Response

```bash
body=$(curl -s -H "Token: $QASE_API_TOKEN" "$URL")
# Extract with python3 (universally available)
status=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
```

## Destructive Operations

**All DELETE endpoints require explicit user confirmation before execution.**

Before calling any DELETE endpoint, present:

```
[sparq] About to DELETE {entity type}:
  - {entity description (title/ID/code)}
  - Endpoint: DELETE {path}

This action is irreversible. Proceed? (yes / cancel)
```

Never execute a DELETE call without user approval. This applies to both direct `/qase-api` usage and when invoked as a fallback from other skills.

## Endpoint Index

### Projects
- GET /project — list all projects
- POST /project — create project
- GET /project/{code} — get by code
- DELETE /project/{code} — delete
- POST /project/{code}/access — grant access
- DELETE /project/{code}/access — revoke access

### Suites
- GET /suite/{code} — list suites
- POST /suite/{code} — create suite
- GET /suite/{code}/{id} — get suite
- PATCH /suite/{code}/{id} — update suite
- DELETE /suite/{code}/{id} — delete suite

### Cases
- GET /case/{code} — list cases (filter: `suite_id`, `search`, `priority`, `type`, `behavior`)
- POST /case/{code} — create case
- POST /case/{code}/bulk — bulk create cases
- GET /case/{code}/{id} — get case
- PATCH /case/{code}/{id} — update case
- DELETE /case/{code}/{id} — delete case
- POST /case/{code}/external-issue/attach — attach external issue
- POST /case/{code}/external-issue/detach — detach external issue

### Runs
- GET /run/{code} — list runs
- POST /run/{code} — create run
- GET /run/{code}/{id} — get run
- DELETE /run/{code}/{id} — delete run
- POST /run/{code}/{id}/complete — complete run
- PATCH /run/{code}/{id}/publicity — update publicity
- POST /run/{code}/{id}/external-issues — update external issues

### Results
- GET /result/{code} — list results
- POST /result/{code}/{run_id} — create result
- POST /result/{code}/{run_id}/bulk — bulk create results
- GET /result/{code}/{run_id}/{hash} — get result
- PATCH /result/{code}/{run_id}/{hash} — update result
- DELETE /result/{code}/{run_id}/{hash} — delete result

### Plans
- GET /plan/{code} — list plans
- POST /plan/{code} — create plan
- GET /plan/{code}/{id} — get plan
- PATCH /plan/{code}/{id} — update plan
- DELETE /plan/{code}/{id} — delete plan

### Milestones
- GET /milestone/{code} — list milestones
- POST /milestone/{code} — create milestone
- GET /milestone/{code}/{id} — get milestone
- PATCH /milestone/{code}/{id} — update milestone
- DELETE /milestone/{code}/{id} — delete milestone

### Environments
- GET /environment/{code} — list environments
- POST /environment/{code} — create environment
- GET /environment/{code}/{id} — get environment
- PATCH /environment/{code}/{id} — update environment
- DELETE /environment/{code}/{id} — delete environment

### Defects
- GET /defect/{code} — list defects
- POST /defect/{code} — create defect
- GET /defect/{code}/{id} — get defect
- PATCH /defect/{code}/{id} — update defect
- DELETE /defect/{code}/{id} — delete defect
- PATCH /defect/{code}/resolve/{id} — resolve defect
- PATCH /defect/{code}/status/{id} — update status

### Shared Steps
- GET /shared_step/{code} — list shared steps
- POST /shared_step/{code} — create shared step
- GET /shared_step/{code}/{hash} — get shared step
- PATCH /shared_step/{code}/{hash} — update shared step
- DELETE /shared_step/{code}/{hash} — delete shared step

### Shared Parameters (workspace-wide, no project code)
- GET /shared_parameter — list parameters
- POST /shared_parameter — create parameter
- GET /shared_parameter/{id} — get parameter
- PATCH /shared_parameter/{id} — update parameter
- DELETE /shared_parameter/{id} — delete parameter

### Configurations
- GET /configuration/{code} — list config groups
- POST /configuration/{code} — create configuration
- POST /configuration/{code}/group — create config group
- DELETE /configuration/{code}/group/{id} — delete config group

### Custom Fields (workspace-wide, no project code)
- GET /custom_field — list custom fields
- POST /custom_field — create custom field
- GET /custom_field/{id} — get custom field
- PATCH /custom_field/{id} — update custom field
- DELETE /custom_field/{id} — delete custom field

### System Fields
- GET /system_field — list all system fields (read-only)

### Attachments
- GET /attachment — list attachments (workspace-wide)
- POST /attachment/{code} — upload attachment (multipart, max 32MB/file, 20 files/req)
- GET /attachment/{hash} — get attachment
- DELETE /attachment/{hash} — delete attachment

### Authors / Users
- GET /author — list authors
- GET /author/{id} — get author
- GET /user — list users
- GET /user/{id} — get user

### Search (QQL)
- GET /search — search entities (`type` + QQL `query` params)

## References

- `claude/skills/sparq-shared/references/qase-formats.md`
- `claude/skills/sparq-shared/references/tms-abstraction.md`
- `claude/skills/sparq-shared/references/degradation-strategy.md`
- `claude/skills/sparq-shared/references/mcp-tool-inventory.md`
- `claude/skills/sparq-shared/references/config-schema.md`

## Cross-References

- Qase MCP tool inventory: [mcp-tool-inventory.md](../sparq-shared/references/mcp-tool-inventory.md) (Qase section)
- Qase export format: [qase-formats.md](../sparq-shared/references/qase-formats.md)
- TMS abstraction: [tms-abstraction.md](../sparq-shared/references/tms-abstraction.md)
- Degradation strategy: [degradation-strategy.md](../sparq-shared/references/degradation-strategy.md)

## Examples

```
/sparq:qase-api
-> "Create a test suite called 'Authentication' in Qase"
-> reads sparq.config.json: outputs.tms.qase.projectCode = "PROJ"
-> curl -s -X POST "https://api.qase.io/v1/suite/PROJ" ...
-> Suite created: id=10

/sparq:qase-api
-> "List all test cases in suite 42"
-> curl -s "https://api.qase.io/v1/case/PROJ?suite_id=42&limit=100"
-> 15 cases found
```
