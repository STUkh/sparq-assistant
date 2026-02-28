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

## Rubrics (`bin/lib/rubrics/`)
- Export `evaluate(content, checks, options)` returning `{score, maxScore, findings, skipped?}`
- `findings` array: `{ severity: 'critical'|'warning'|'info', message: string }` objects or plain strings
- `skipped: true` when content is not a test file (use `isTestFile()` from `shared/content-detect.mjs`)
- Shared utilities in `bin/lib/rubrics/shared/`: constants, content-detect, finding, json-extract
- Register new rubrics in `FILE_RUBRICS` in `bin/lib/commands/lint.mjs`
- Run via CLI: `sparq lint [path]` — reports findings with severity icons

## Fixtures (`test/evals/fixtures/`)
- Mock data corpus: Jira ticket JSON, Figma design JSON, project conventions — for manual prompt development/debugging
- Cases reference docs in `test/evals/cases/` — serve as documentation of expected agent behaviors
