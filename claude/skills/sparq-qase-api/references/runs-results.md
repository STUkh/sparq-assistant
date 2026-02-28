# Runs, Results & Plans — Curl Reference

Load when creating test runs, recording results, or managing test plans.

> `${QASE_PROJECT_CODE}` resolves from `outputs.tms.qase.projectCode` in `sparq.config.json`. Substitute your actual project code in curl examples.

## Contents
- [Runs — List](#runs--list)
- [Runs — Create](#runs--create)
- [Runs — Complete](#runs--complete)
- [Runs — Get Public Link](#runs--get-public-link)
- [Results — Create](#results--create)
- [Results — Bulk Create](#results--bulk-create)
- [Results — List](#results--list)
- [Plans — List](#plans--list)
- [Plans — Create](#plans--create)
- [Plans — Get](#plans--get)

## Runs — List

```bash
curl -s "https://api.qase.io/v1/run/${QASE_PROJECT_CODE}?limit=25&offset=0" \
  -H "Token: $QASE_API_TOKEN"
```

Query params: `limit`, `offset`, `include=cases`

Response: `result.entities[]` — each has `id`, `title`, `status`, `start_time`, `end_time`, `cases_count`, `untested_count`, `passed_count`, `failed_count`

## Runs — Create

```bash
curl -s -X POST "https://api.qase.io/v1/run/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Regression Run — 2026-02-19",
    "description": "Full regression after EP-47",
    "include_all": false,
    "cases": [1, 2, 3, 4, 5],
    "environment_id": 1,
    "milestone_id": null,
    "plan_id": null,
    "is_autotest": true
  }'
```

Body fields:
- `title` (required, string)
- `description` (string)
- `include_all` (boolean — true includes all cases in project)
- `cases` (array of case IDs — when `include_all` is false)
- `environment_id` (integer)
- `milestone_id` (integer)
- `plan_id` (integer)
- `is_autotest` (boolean)
- `custom_field` (object)

Response: `result.id` — the created run ID

## Runs — Complete

```bash
curl -s -X POST "https://api.qase.io/v1/run/${QASE_PROJECT_CODE}/42/complete" \
  -H "Token: $QASE_API_TOKEN"
```

No request body. Marks run as completed.

## Runs — Get Public Link

```bash
curl -s "https://api.qase.io/v1/run/${QASE_PROJECT_CODE}/42/publicity" \
  -H "Token: $QASE_API_TOKEN"
```

Response: `result.url` — public shareable link

## Results — Create

Record a test result for a case within a run.

```bash
curl -s -X POST "https://api.qase.io/v1/result/${QASE_PROJECT_CODE}/42" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": 123,
    "status": "passed",
    "time_ms": 5400,
    "comment": "All steps verified",
    "stacktrace": null,
    "defect": false,
    "steps": [
      {"position": 1, "status": "passed"},
      {"position": 2, "status": "passed"}
    ]
  }'
```

Body fields:
- `case_id` (required, integer)
- `status` (required): `"passed"`, `"failed"`, `"blocked"`, `"skipped"`, `"invalid"`
- `time_ms` (integer — execution time in milliseconds)
- `comment` (string)
- `stacktrace` (string — for failures)
- `defect` (boolean — auto-create defect on failure)
- `steps` (array of `{"position": N, "status": "passed|failed"}`)
- `attachments` (array of attachment hashes)

Response: `result.hash` — unique result identifier

## Results — Bulk Create

```bash
curl -s -X POST "https://api.qase.io/v1/result/${QASE_PROJECT_CODE}/42/bulk" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "results": [
      {"case_id": 123, "status": "passed", "time_ms": 3200},
      {"case_id": 124, "status": "failed", "comment": "Button not found", "stacktrace": "..."}
    ]
  }'
```

Response: `result.entities[]` — array of result objects with `hash`

## Results — List

```bash
curl -s "https://api.qase.io/v1/result/${QASE_PROJECT_CODE}?limit=100&run_id=42" \
  -H "Token: $QASE_API_TOKEN"
```

Query params: `limit`, `offset`, `run_id`, `case_id`, `status`

Response: `result.entities[]` — each has `hash`, `case_id`, `run_id`, `status`, `time_ms`, `comment`

## Plans — List

```bash
curl -s "https://api.qase.io/v1/plan/${QASE_PROJECT_CODE}?limit=25" \
  -H "Token: $QASE_API_TOKEN"
```

Response: `result.entities[]` — each has `id`, `title`, `description`, `cases_count`

## Plans — Create

```bash
curl -s -X POST "https://api.qase.io/v1/plan/${QASE_PROJECT_CODE}" \
  -H "Token: $QASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sprint 12 Regression Plan",
    "description": "Covers auth + orders modules",
    "cases": [1, 2, 3, 4, 5]
  }'
```

Body fields:
- `title` (required, string)
- `description` (string)
- `cases` (required, array of case IDs)

Response: `result.id` — the created plan ID

## Plans — Get

```bash
curl -s "https://api.qase.io/v1/plan/${QASE_PROJECT_CODE}/5" \
  -H "Token: $QASE_API_TOKEN"
```

Response: `result` — full plan object with `id`, `title`, `description`, `cases_count`, `cases[]`
