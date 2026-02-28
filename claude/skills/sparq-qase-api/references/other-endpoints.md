# Other Endpoints — Curl Reference

Load when working with milestones, environments, defects, shared steps/parameters, configurations, custom fields, system fields, attachments, authors, users, or search.

> `${QASE_PROJECT_CODE}` resolves from `outputs.tms.qase.projectCode` in `sparq.config.json`. Substitute your actual project code in curl examples.

## Contents
- [Milestones](#milestones)
- [Environments](#environments)
- [Defects](#defects)
- [Shared Steps](#shared_steps)
- [Shared Parameters](#shared-parameters)
- [Configurations](#configurations)
- [Custom Fields](#custom_fields)
- [System Fields](#system_fields)
- [Attachments](#attachments)
- [Authors / Users](#authors--users)
- [Search (QQL)](#search-qql)

## Milestones

CRUD at `/milestone/${QASE_PROJECT_CODE}`. All accept `limit`, `offset` on GET.

```bash
# List
curl -s "https://api.qase.io/v1/milestone/${QASE_PROJECT_CODE}?limit=25" -H "Token: $QASE_API_TOKEN"

# Create
curl -s -X POST "https://api.qase.io/v1/milestone/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Sprint 12","description":"Feb release","due_date":"2026-03-01"}'
```

Body: `title` (required), `description`, `status` (`"active"` | `"completed"`), `due_date` (YYYY-MM-DD)

## Environments

CRUD at `/environment/${QASE_PROJECT_CODE}`.

```bash
# List
curl -s "https://api.qase.io/v1/environment/${QASE_PROJECT_CODE}?limit=25" -H "Token: $QASE_API_TOKEN"

# Create
curl -s -X POST "https://api.qase.io/v1/environment/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Staging","description":"staging.example.com","slug":"staging"}'
```

Body: `title` (required), `slug` (required, unique), `description`, `host` (URL string)

## Defects

CRUD at `/defect/${QASE_PROJECT_CODE}` + resolve/status actions.

```bash
# List
curl -s "https://api.qase.io/v1/defect/${QASE_PROJECT_CODE}?limit=25&status=open" -H "Token: $QASE_API_TOKEN"

# Create
curl -s -X POST "https://api.qase.io/v1/defect/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Login button unresponsive","actual_result":"Nothing happens","severity":"3"}'

# Resolve
curl -s -X PATCH "https://api.qase.io/v1/defect/${QASE_PROJECT_CODE}/resolve/5" -H "Token: $QASE_API_TOKEN"
```

Body: `title` (required), `actual_result` (required), `severity` (integer: 0-6), `attachments[]`

Query filters: `status` (`"open"`, `"resolved"`), `severity`

## Shared Steps

CRUD at `/shared_step/${QASE_PROJECT_CODE}`. Identified by `hash` (not integer ID).

```bash
# List
curl -s "https://api.qase.io/v1/shared_step/${QASE_PROJECT_CODE}?limit=25" -H "Token: $QASE_API_TOKEN"

# Create
curl -s -X POST "https://api.qase.io/v1/shared_step/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Login as admin","action":"Navigate to /login, enter admin creds, click Sign In","expected_result":"Dashboard displayed"}'
```

Body: `title` (required), `action`, `expected_result`

## Shared Parameters

Workspace-wide (no project code in path). CRUD at `/shared_parameter`.

```bash
# List
curl -s "https://api.qase.io/v1/shared_parameter?limit=25" -H "Token: $QASE_API_TOKEN"

# Create
curl -s -X POST "https://api.qase.io/v1/shared_parameter" \
  -H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Browser","values":[{"title":"Chrome"},{"title":"Firefox"},{"title":"Safari"}]}'
```

Body: `title` (required), `values[]` (array of `{"title": "..."}`)

## Configurations

List groups + create configs at `/configuration/${QASE_PROJECT_CODE}`.

```bash
# List groups
curl -s "https://api.qase.io/v1/configuration/${QASE_PROJECT_CODE}" -H "Token: $QASE_API_TOKEN"

# Create group
curl -s -X POST "https://api.qase.io/v1/configuration/${QASE_PROJECT_CODE}/group" \
  -H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Browsers"}'

# Create config in group
curl -s -X POST "https://api.qase.io/v1/configuration/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Chrome 120","group_id":1}'
```

## Custom Fields

Account-level (no project code in path). CRUD at `/custom_field`.

```bash
# List
curl -s "https://api.qase.io/v1/custom_field?limit=25" -H "Token: $QASE_API_TOKEN"

# Get
curl -s "https://api.qase.io/v1/custom_field/5" -H "Token: $QASE_API_TOKEN"
```

Body (create): `title` (required), `entity` (`"case"`, `"run"`, `"defect"`), `type` (int), `value` (string), `projects_codes[]`

## System Fields

Read-only reference of all built-in Qase fields.

```bash
curl -s "https://api.qase.io/v1/system_field" -H "Token: $QASE_API_TOKEN"
```

Response: `result` — array of field definitions with `title`, `slug`, `options[]`

## Attachments

Upload/manage at `/attachment`. Account-level.

```bash
# List
curl -s "https://api.qase.io/v1/attachment?limit=25" -H "Token: $QASE_API_TOKEN"

# Upload (multipart, project-scoped, max 32MB/file, 20 files/req)
curl -s -X POST "https://api.qase.io/v1/attachment/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" \
  -F "file[]=@screenshot.png"

# Get
curl -s "https://api.qase.io/v1/attachment/abc123hash" -H "Token: $QASE_API_TOKEN"
```

Response (upload): `result[]` — array with `hash`, `filename`, `url`, `mime`

## Authors / Users

Read-only. Account-level.

```bash
# List authors
curl -s "https://api.qase.io/v1/author?limit=25" -H "Token: $QASE_API_TOKEN"

# List users
curl -s "https://api.qase.io/v1/user?limit=25" -H "Token: $QASE_API_TOKEN"

# Get user
curl -s "https://api.qase.io/v1/user/5" -H "Token: $QASE_API_TOKEN"
```

## Search (QQL)

Qase Query Language — search across entity types.

```bash
# Search cases by title
curl -s "https://api.qase.io/v1/search?type=case&query=title%20%3D%20%22login%22&limit=25" \
  -H "Token: $QASE_API_TOKEN"
```

Query params:
- `type` — entity type: `case`, `run`, `result`, `defect`, `plan`, `suite`, `milestone`
- `query` — QQL expression (URL-encoded)
- `limit`, `offset` — pagination

QQL syntax examples:
- `title = "login"` — exact title match
- `title ~ "login"` — contains
- `priority = 1 and type = 2` — compound filter
- `suite_id = 42` — filter by suite
