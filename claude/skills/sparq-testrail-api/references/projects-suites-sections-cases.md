# Projects, Suites, Sections & Cases — Curl Reference

Load for any project, suite, section, or case operation via REST API.

> `${TESTRAIL_PROJECT_ID}` resolves from `outputs.tms.testrail.projectId` in `sparq.config.json`. `${TESTRAIL_BASE_URL}` from `outputs.tms.testrail.baseUrl` or env. Auth: `-u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"`.

## Contents
- [Common Headers](#common-headers)
- [Projects — Get](#projects--get)
- [Projects — Create](#projects--create)
- [Suites — List](#suites--list)
- [Suites — Create](#suites--create)
- [Sections — List](#sections--list)
- [Sections — Create](#sections--create)
- [Cases — List](#cases--list)
- [Cases — Create](#cases--create)
- [Cases — Bulk Update](#cases--bulk-update)
- [Cases — Get](#cases--get)
- [Cases — Get History](#cases--get-history)
- [Case Body Fields](#case-body-fields)

## Common Headers

Include on every request:

```bash
-u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" -H "Content-Type: application/json"
```

## Projects — Get

```bash
# Get single project
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_project/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# List all projects
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_projects" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct object (single) or `projects[]` array (list). Each has `id`, `name`, `announcement`, `suite_mode`, `is_completed`.

Suite modes: `1` = single suite, `2` = single suite + baselines, `3` = multi-suite.

## Projects — Create

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_project" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","announcement":"Project for testing","show_announcement":true,"suite_mode":1}'
```

Body fields:
- `name` (required, string)
- `announcement` (string)
- `show_announcement` (boolean)
- `suite_mode` (integer: 1=single, 2=single+baselines, 3=multi-suite)

Response: created project object with `id`

## Suites — List

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_suites/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct array. Each has `id`, `name`, `description`, `project_id`, `url`.

Only relevant for multi-suite projects (suite_mode=3). Single-suite projects have one implicit suite.

## Suites — Create

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_suite/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Authentication Tests","description":"All auth-related test cases"}'
```

Body fields:
- `name` (required, string)
- `description` (string)

Response: created suite object with `id`

## Sections — List

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_sections/${TESTRAIL_PROJECT_ID}&suite_id=${TESTRAIL_SUITE_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Query params:
- `suite_id` — required for multi-suite projects
- `limit`, `offset` — pagination (default 250)

Response: `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "sections": [...] }`

Each section has `id`, `name`, `description`, `parent_id`, `depth`, `display_order`, `suite_id`.

Nested hierarchy: `parent_id` references another section's `id`. `depth` = 0 for root sections.

## Sections — Create

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_section/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"suite_id":${TESTRAIL_SUITE_ID},"name":"Happy Path","description":"Core happy path test cases","parent_id":null}'
```

Body fields:
- `name` (required, string)
- `suite_id` (integer — required for multi-suite projects)
- `parent_id` (integer | null — for nested sections)
- `description` (string)

Response: created section object with `id`

## Cases — List

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_cases/${TESTRAIL_PROJECT_ID}&suite_id=${TESTRAIL_SUITE_ID}&section_id=101" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Query params:
- `suite_id` — required for multi-suite projects
- `section_id` — filter by section
- `type_id` — filter by type (comma-separated for multiple)
- `priority_id` — filter by priority (comma-separated)
- `created_after`, `created_before` — Unix timestamps
- `updated_after`, `updated_before` — Unix timestamps
- `limit`, `offset` — pagination (default 250)

Response: `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "cases": [...] }`

Each case has `id`, `title`, `section_id`, `type_id`, `priority_id`, `estimate`, `refs`, `custom_preconds`, `custom_steps_separated`.

## Cases — Create

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_case/101" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TC-login-HP-001: Verify user can log in with valid credentials",
    "type_id": 6,
    "priority_id": 3,
    "template_id": 2,
    "estimate": "5m",
    "refs": "EP-14",
    "custom_preconds": "1. User has valid credentials\n2. User is not logged in",
    "custom_steps_separated": [
      {"content": "Navigate to /login", "expected": "Login form displayed"},
      {"content": "Enter valid email and password", "expected": "Fields accept input"},
      {"content": "Click Sign In", "expected": "Redirected to dashboard"}
    ],
    "custom_postconditions": "User session is active"
  }'
```

Note: `add_case` takes `section_id` in the URL path (not project_id). The case is created in that section.

Response: created case object with `id`

## Cases — Bulk Update

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/update_cases/${TESTRAIL_SUITE_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "case_ids": [5001, 5002, 5003],
    "priority_id": 3,
    "type_id": 6
  }'
```

For single-suite projects, use `update_cases/${TESTRAIL_PROJECT_ID}` instead.

Body: `case_ids` (required, array) + any case fields to update on all listed cases.

## Cases — Get

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_case/5001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: full case object with all fields including `custom_*` fields.

## Cases — Get History

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_history_for_case/5001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: array of change records with `created_on`, `user_id`, `changes[]`.

## Case Body Fields

Complete field reference for `POST add_case/{section_id}` and `POST update_case/{case_id}`:

- `title` (required, string, max 250 chars)
- `type_id` (integer: see Enum Field Mapping in SKILL.md)
- `priority_id` (integer: 1=Low, 2=Medium, 3=High, 4=Critical)
- `template_id` (integer: 1=Test Case (Text), 2=Test Case (Steps), 3=Exploratory Session)
- `estimate` (string: "5m", "15m", "1h", "2h 30m")
- `milestone_id` (integer)
- `refs` (string: comma-separated Jira issue keys, e.g., "EP-14, EP-15")
- `custom_preconds` (string: preconditions text, numbered list)
- `custom_postconditions` (string: postconditions text)
- `custom_steps_separated` (array of `{"content": "...", "expected": "..."}`)
- `custom_steps` (string: plain text steps — for Text template only)
- `custom_expected` (string: plain text expected — for Text template only)
- Custom fields: any field with `custom_` prefix as defined in TestRail admin. Use `get_case_fields` to discover available fields.
