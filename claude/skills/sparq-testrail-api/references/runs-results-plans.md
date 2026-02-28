# Runs, Results, Plans & Tests — Curl Reference

Load when creating test runs, recording results, managing test plans, or querying test instances.

> `${TESTRAIL_PROJECT_ID}` resolves from `outputs.tms.testrail.projectId` in `sparq.config.json`. `${TESTRAIL_BASE_URL}` from env. Auth: `-u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"`.

## Contents
- [Runs — List](#runs--list)
- [Runs — Create](#runs--create)
- [Runs — Close](#runs--close)
- [Tests — List](#tests--list)
- [Tests — Get](#tests--get)
- [Results — Add for Case](#results--add-for-case)
- [Results — Add Bulk](#results--add-bulk)
- [Results — List for Run](#results--list-for-run)
- [Results — List for Case](#results--list-for-case)
- [Plans — List](#plans--list)
- [Plans — Create](#plans--create)
- [Plans — Close](#plans--close)

## Runs — List

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_runs/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Query params: `is_completed` (0 or 1), `milestone_id`, `created_after`, `created_before` (Unix timestamps), `limit`, `offset`

Response: `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "runs": [...] }`

Each run has `id`, `name`, `description`, `suite_id`, `milestone_id`, `passed_count`, `failed_count`, `untested_count`, `blocked_count`, `is_completed`, `created_on`, `completed_on`.

## Runs — Create

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_run/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "suite_id": ${TESTRAIL_SUITE_ID},
    "name": "Regression Run — 2026-02-19",
    "description": "Full regression after EP-47",
    "include_all": false,
    "case_ids": [5001, 5002, 5003, 5004, 5005],
    "milestone_id": null,
    "assignedto_id": null
  }'
```

Body fields:
- `suite_id` (integer — required for multi-suite projects)
- `name` (required, string)
- `description` (string)
- `include_all` (boolean — true includes all cases in suite/project)
- `case_ids` (array of case IDs — when `include_all` is false)
- `milestone_id` (integer)
- `assignedto_id` (integer — user to assign the run to)

Response: created run object with `id`

## Runs — Close

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/close_run/42" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

No request body. Marks run as completed. **This is irreversible** — no results can be added after closing.

## Tests — List

Tests are instances of cases within a run. Each test maps to one case.

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_tests/42" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Query params: `status_id` (comma-separated, e.g., `1,5` for passed+failed), `limit`, `offset`

Response: `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "tests": [...] }`

Each test has `id`, `case_id`, `status_id`, `run_id`, `title`, `assignedto_id`, `type_id`, `priority_id`.

## Tests — Get

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_test/1001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Response: full test object including `custom_*` fields inherited from the case.

## Results — Add for Case

Record a test result for a specific case in a run. This is the most common way to add results.

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_result_for_case/42/5001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status_id": 1,
    "comment": "All steps verified successfully",
    "elapsed": "1m 30s",
    "defects": "EP-55",
    "version": "1.2.0"
  }'
```

URL format: `add_result_for_case/{run_id}/{case_id}`

Body fields:
- `status_id` (required, integer: 1=Passed, 2=Blocked, 3=Untested, 4=Retest, 5=Failed)
- `comment` (string — markdown supported)
- `elapsed` (string: "30s", "1m 30s", "2h", "1h 15m")
- `defects` (string: comma-separated defect IDs, e.g., "EP-55, EP-56")
- `version` (string: build or app version)
- `assignedto_id` (integer)
- `custom_*` (any custom result fields)

Response: created result object with `id`

## Results — Add Bulk

Add results for multiple cases in a run at once.

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_results_for_cases/42" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "results": [
      {"case_id": 5001, "status_id": 1, "comment": "Passed", "elapsed": "45s"},
      {"case_id": 5002, "status_id": 5, "comment": "Button not found", "defects": "EP-60"},
      {"case_id": 5003, "status_id": 2, "comment": "Blocked by EP-55"}
    ]
  }'
```

Response: array of created result objects.

## Results — List for Run

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_results_for_run/42" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Query params: `status_id` (comma-separated), `limit`, `offset`

Response: `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "results": [...] }`

Each result has `id`, `test_id`, `case_id`, `status_id`, `comment`, `elapsed`, `defects`, `created_on`, `created_by`.

## Results — List for Case

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_results_for_case/42/5001" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

URL format: `get_results_for_case/{run_id}/{case_id}`

Response: `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "results": [...] }`

Returns results for a specific case within a specific run, ordered by most recent first.

## Plans — List

```bash
curl -s "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_plans/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

Query params: `is_completed` (0 or 1), `milestone_id`, `limit`, `offset`

Response: `{ "offset": 0, "limit": 250, "size": N, "_links": {...}, "plans": [...] }`

Each plan has `id`, `name`, `description`, `milestone_id`, `passed_count`, `failed_count`, `is_completed`.

## Plans — Create

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/add_plan/${TESTRAIL_PROJECT_ID}" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sprint 12 Regression Plan",
    "description": "Covers auth + orders modules",
    "milestone_id": null,
    "entries": [
      {
        "suite_id": ${TESTRAIL_SUITE_ID},
        "name": "Auth Tests",
        "include_all": false,
        "case_ids": [5001, 5002, 5003],
        "config_ids": [1, 2],
        "runs": [
          {"config_ids": [1], "include_all": false, "case_ids": [5001, 5002]},
          {"config_ids": [2], "include_all": false, "case_ids": [5001, 5003]}
        ]
      }
    ]
  }'
```

Body fields:
- `name` (required, string)
- `description` (string)
- `milestone_id` (integer)
- `entries` (array of plan entries):
  - `suite_id` (required, integer)
  - `name` (string — defaults to suite name)
  - `include_all` (boolean)
  - `case_ids` (array — when `include_all` is false)
  - `config_ids` (array — configuration group IDs for matrix runs)
  - `runs` (array — specific run definitions with their own `config_ids` and `case_ids`)

Response: created plan object with `id` and `entries[]` including generated `runs[]`.

## Plans — Close

```bash
curl -s -X POST "${TESTRAIL_BASE_URL}/index.php?/api/v2/close_plan/5" \
  -u "$TESTRAIL_USERNAME:$TESTRAIL_API_KEY"
```

No request body. Closes the plan and all its runs. **This is irreversible.**
