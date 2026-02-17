---
paths:
  - "test/**"
---

# Test File Rules

## Framework
- `node:test` + `node:assert/strict` — no additional test dependencies
- IMPORTANT: Always use `node:assert/strict` (not `node:assert`) for fail-fast equality checks

## Test Helpers (`test/helpers/setup.mjs`)
- `createTempDir()` — creates isolated temp directory with `sparq-test-` prefix
- `cleanTempDir(dir)` — recursive cleanup
- `createMockProject(dir, options)` — creates package.json + .gitignore + optional .git
- `runCli(args, options)` — executes CLI as subprocess, returns `{stdout, stderr, exitCode}`
- `readJsonFile(dir, relPath)` / `readTextFile(dir, relPath)` — file reading helpers

## Conventions
- Always clean up temp dirs in `after()` hooks using `cleanTempDir()` — leaked temp dirs cause CI failures on Windows
- Integration tests must test the full CLI subprocess via `runCli()` — never import CLI modules directly
- Unit tests must test individual functions in isolation
- Assert exact exit codes from `bin/lib/constants.mjs` (`EXIT_SUCCESS`, `EXIT_GENERAL`, `EXIT_USAGE`, `EXIT_FILESYSTEM`)

## Eval Framework (`test/evals/`)
- **Cases**: YAML format with fields: `name`, `scenario`, `input`, `expected_outputs`, `rubrics`
- **Case naming**: `s{N}-{short-description}.yaml` (e.g., `s1-generate-from-jira.yaml`, `s5-refresh-from-jira.yaml`). Always prefix with scenario number for sorting.
- **Rubrics (code-based)**: Export `evaluate(content, checks)` returning `{score, maxScore, findings}`
- **Rubrics (model-based)**: Markdown files with 1-5 grading scale and dimension definitions
- **Fixtures**: Mock data in `test/evals/fixtures/` (e.g., Jira ticket JSON, Figma design JSON)
- **Run**: `node test/evals/run-eval.mjs test/evals/cases/{case}.yaml`
