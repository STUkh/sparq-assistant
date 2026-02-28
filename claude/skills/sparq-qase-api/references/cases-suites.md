# Cases & Suites — Curl Reference

Load for any project, suite, or case operation via REST API.

> `${QASE_PROJECT_CODE}` resolves from `outputs.tms.qase.projectCode` in `sparq.config.json`. Substitute your actual project code in curl examples.

## Contents
- [Common Headers](#common-headers)
- [Projects — List](#projects--list)
- [Projects — Create](#projects--create)
- [Suites — List](#suites--list)
- [Suites — Create](#suites--create)
- [Cases — List](#cases--list)
- [Cases — Create](#cases--create)
- [Cases — Bulk Create](#cases--bulk-create)
- [Cases — Get](#cases--get)
- [Cases — Attach External Issue](#cases--attach-external-issue)
- [Case Body Fields](#case-body-fields)

## Common Headers

Include on every request:

```bash
-H "Token: $QASE_API_TOKEN" -H "Content-Type: application/json"
```

## Projects — List

```bash
curl -s "https://api.qase.io/v1/project?limit=100" \
  -H "Token: $QASE_API_TOKEN"
```

Response: `result.entities[]` — each has `title`, `code`, `counts`

Filter by code: iterate `entities`, match `.code == "${QASE_PROJECT_CODE}"`

## Projects — Create

```bash
curl -s -X POST "https://api.qase.io/v1/project" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Project","code":"${QASE_PROJECT_CODE}","description":"Project test management","access":"none"}'
```

Body fields:
- `title` (required, string)
- `code` (required, 2-10 uppercase chars)
- `description` (string)
- `access`: `"all"` | `"group"` | `"none"`

Response: `result.code` — the created project code

## Suites — List

```bash
curl -s "https://api.qase.io/v1/suite/${QASE_PROJECT_CODE}?limit=100" \
  -H "Token: $QASE_API_TOKEN"
```

Response: `result.entities[]` — each has `id`, `title`, `parent_id`, `cases_count`

Filter by title: iterate `entities`, match `.title`

## Suites — Create

```bash
curl -s -X POST "https://api.qase.io/v1/suite/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Auth","description":"Authentication tests","parent_id":null}'
```

Body fields:
- `title` (required, string)
- `description` (string)
- `parent_id` (integer | null — for nested suites)
- `preconditions` (string)

Response: `result.id` — the created suite ID

## Cases — List

```bash
curl -s "https://api.qase.io/v1/case/${QASE_PROJECT_CODE}?suite_id=42&limit=100&offset=0" \
  -H "Token: $QASE_API_TOKEN"
```

Query params:
- `suite_id` — filter by suite
- `search` — text search
- `priority`, `type`, `behavior` — filter by enum value
- `limit`, `offset` — pagination
- `include=external_issues` — embed linked issues

Response: `result.entities[]` — each has `id`, `title`, `suite_id`, `priority`, `type`, `steps[]`

## Cases — Create

```bash
curl -s -X POST "https://api.qase.io/v1/case/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Verify user can log in with valid credentials",
    "suite_id": 42,
    "priority": 1,
    "type": 2,
    "behavior": 1,
    "preconditions": "User is registered and active",
    "postconditions": "User is on dashboard",
    "description": "Traceability: EP-123 — AC1",
    "steps": [
      {"action": "Navigate to /login", "expected_result": "Login form displayed"},
      {"action": "Enter valid email and password", "expected_result": "Fields accept input"},
      {"action": "Click Sign In", "expected_result": "Redirected to dashboard"}
    ]
  }'
```

Response: `result.id` — the created case ID

## Cases — Bulk Create

```bash
curl -s -X POST "https://api.qase.io/v1/case/${QASE_PROJECT_CODE}/bulk" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cases": [
      {
        "title": "TC-AUTH-001: Verify login with valid credentials",
        "suite_id": 42,
        "priority": 1,
        "type": 2,
        "behavior": 1,
        "preconditions": "User registered",
        "steps": [
          {"action": "Navigate to /login", "expected_result": "Form displayed"}
        ]
      },
      {
        "title": "TC-AUTH-002: Verify login fails with wrong password",
        "suite_id": 42,
        "priority": 1,
        "type": 1,
        "behavior": 2,
        "preconditions": "User registered",
        "steps": [
          {"action": "Enter wrong password", "expected_result": "Error message shown"}
        ]
      }
    ]
  }'
```

Response: `result.ids[]` — array of created case IDs. Verify length matches input.

## Cases — Get

```bash
curl -s "https://api.qase.io/v1/case/${QASE_PROJECT_CODE}/123" \
  -H "Token: $QASE_API_TOKEN"
```

Response: `result` — full case object with `id`, `title`, `suite_id`, `priority`, `type`, `behavior`, `preconditions`, `postconditions`, `steps[]`, `description`

## Cases — Attach External Issue

Link a Jira ticket to test cases.

```bash
curl -s -X POST "https://api.qase.io/v1/case/${QASE_PROJECT_CODE}/external-issue/attach" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "jira-cloud",
    "links": [
      {"case_id": 123, "external_issues": ["EP-47"]},
      {"case_id": 124, "external_issues": ["EP-47"]}
    ]
  }'
```

Body fields:
- `type` (required): integration type — `"jira-cloud"`, `"jira-server"`, `"github"`, etc.
- `links[]` (required): array of `{"case_id": int, "external_issues": ["TICKET-ID", ...]}`

Note: Non-critical — warn on failure, don't stop upload.

## Case Body Fields

Complete field reference for `POST /case/{code}` and `PATCH /case/{code}/{id}`:

- `title` (required, string, max 255)
- `suite_id` (integer)
- `priority` (integer: 0=not set, 1=high, 2=medium, 3=low)
- `type` (integer: 1=functional, 2=smoke, 3=regression, 4=security, 5=usability, 6=performance, 7=acceptance)
- `behavior` (integer: 1=positive, 2=negative, 3=destructive)
- `severity` (integer: 0=not set, 1=blocker, 2=critical, 3=major, 4=normal, 5=minor, 6=trivial)
- `preconditions` (markdown string)
- `postconditions` (markdown string)
- `description` (markdown string)
- `steps` (array of `{"action": "...", "expected_result": "..."}`)
- `tags` (array of strings)
- `is_flaky` (integer: 0 or 1)
- `automation` (integer: 0=not automated, 1=to be automated, 2=automated)
- `status` (integer: 0=actual, 1=draft, 2=deprecated)
- `layer` (integer: 0=unknown, 1=e2e, 2=api, 3=unit)
- `custom_field` (object: `{field_id: value}`)
- `attachments` (array of attachment hashes)
