# Other Endpoints — Curl Reference

Load when working with milestones, users, priorities, statuses, case types, case fields, result fields, templates, configs, or attachments.

> `${TESTRAIL_PROJECT_ID}` resolves from `outputs.tms.testrail.projectId` in `sparq.config.json`. `${TESTRAIL_BASE_URL}` from env. Auth: `-u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"`.

## Contents
- [Milestones](#milestones)
- [Users](#users)
- [Priorities](#priorities)
- [Statuses](#statuses)
- [Case Types](#case-types)
- [Case Fields](#case-fields)
- [Result Fields](#result-fields)
- [Templates](#templates)
- [Configs](#configs)
- [Attachments](#attachments)

## Milestones

CRUD at `*_milestone/{id}` (project-scoped for list/create).

```bash
# List
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_milestones/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# Create
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_milestone/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sprint 12","description":"Feb release","due_on":1740873600}'

# Get
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_milestone/5" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Body (create/update):
- `name` (required, string)
- `description` (string)
- `due_on` (Unix timestamp)
- `start_on` (Unix timestamp)
- `parent_id` (integer — for sub-milestones)
- `is_completed` (boolean)
- `is_started` (boolean)

Query params (list): `is_completed` (0 or 1), `is_started` (0 or 1), `limit`, `offset`

Response (list): `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "milestones": [...] }`

Each milestone has `id`, `name`, `description`, `due_on`, `start_on`, `is_completed`, `milestones` (sub-milestones array).

## Users

Read-only. Account-level and project-level.

```bash
# List all users (admin only)
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_users" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# List project users
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_users/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# Get user by ID
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_user/1" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# Get user by email
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_user_by_email&email=user@example.com" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Each user has `id`, `name`, `email`, `is_active`, `role_id`.

## Priorities

Read-only system values. Use to discover available priority IDs.

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_priorities" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct array. Each has `id`, `name`, `short_name`, `is_default`, `priority`.

Default priorities: 1=Low, 2=Medium, 3=High, 4=Critical. Custom priorities may exist.

## Statuses

Read-only system values. Use to discover available result status IDs.

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_statuses" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct array. Each has `id`, `name`, `label`, `color_dark`, `color_medium`, `color_bright`, `is_system`, `is_untested`, `is_final`.

Default statuses: 1=Passed, 2=Blocked, 3=Untested, 4=Retest, 5=Failed. Custom statuses may exist (ID >= 6).

## Case Types

Read-only. Returns all available case types (built-in + custom).

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_case_types" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct array. Each has `id`, `name`, `is_default`.

Default types: 1=Acceptance, 2=Accessibility, 3=Automated, 4=Compatibility, 5=Destructive, 6=Functional, 7=Performance, 8=Regression, 9=Security, 10=Usability. Custom types may exist (ID >= 11).

## Case Fields

Read-only. Returns field definitions including custom fields.

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_case_fields" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct array. Each field has `id`, `label`, `name`, `system_name`, `type_id`, `configs[]`, `display_order`.

Field types: 1=String, 2=Integer, 3=Text, 4=URL, 5=Checkbox, 6=Dropdown, 7=User, 8=Date, 9=Milestone, 10=Steps, 11=Step Results, 12=Multi-select.

Custom fields are prefixed with `custom_` in API requests/responses (e.g., `custom_preconds`, `custom_steps_separated`).

## Result Fields

Read-only. Returns result field definitions.

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_result_fields" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct array. Same structure as case fields but for result entities.

## Templates

Read-only. Returns available test case templates for a project.

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_templates/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: direct array. Each has `id`, `name`, `is_default`.

Common templates: 1=Test Case (Text), 2=Test Case (Steps), 3=Exploratory Session.

Use `template_id` in `add_case` to select template. Steps template (2) enables `custom_steps_separated`.

## Configs

Config groups and configurations. Used in test plans for matrix/combination runs.

```bash
# List config groups (with nested configs)
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_configs/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# Create config group
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_config_group/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Browsers"}'

# Create config in group
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_config/1" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Chrome 120"}'

# Update config group
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/update_config_group/1" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Browsers (Updated)"}'

# Update config
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/update_config/1" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Chrome 121"}'
```

Response (list): array of config groups, each with `id`, `name`, `project_id`, `configs[]`. Each config has `id`, `name`, `group_id`.

Use `config_ids` in plan entries to create matrix runs (e.g., same test suite across Chrome, Firefox, Safari).

## Attachments

Add and retrieve file attachments on cases, results, and tests.

```bash
# Attach file to case (multipart)
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_attachment_to_case/5001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "attachment=@screenshot.png"

# Attach file to result
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_attachment_to_result/1001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "attachment=@failure-log.txt"

# List attachments for case
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_attachments_for_case/5001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# List attachments for test
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_attachments_for_test/1001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# Get attachment metadata
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_attachment/abc123" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"

# Delete attachment
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/delete_attachment/abc123" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Attachment response: `attachment_id` on upload. List response: array with `id`, `name`, `filename`, `size`, `created_on`, `user_id`.

Note: Attachments use multipart form data for upload (not JSON). GET endpoints use standard auth headers.
