---
paths:
  - "bin/**"
---

# CLI Code Rules

## Module Constraints
- Pure ESM with `.mjs` extensions — `import`/`export` only
- IMPORTANT: Zero runtime dependencies — only Node.js built-in modules (requires Node >= 22)
- Named exports only — no default exports
- `const` required, `var` forbidden
- Use `node:` prefix for all built-in imports (`'node:fs'`, `'node:path'`, `'node:util'`, etc.)
- Colors/styling: use `style` object from `state.mjs` (wraps `node:util` `styleText`) — never raw ANSI codes
- CLI args: parsed via `node:util` `parseArgs` in `args.mjs`
- File glob: use `node:fs` `globSync` — no manual recursive traversal
- Spinner: use `createSpinner()` from `spinner.mjs` for progress indication

## Architecture Conventions
- **State**: Use `state.mjs` singleton for verbosity, dry-run, colors — never use globals or module-level mutable state
- **Constants**: All magic values go in `constants.mjs` — never hardcode paths, exit codes, or agent names
- **Exit codes**: Use from `constants.mjs` — `EXIT_SUCCESS` (0), `EXIT_GENERAL` (1), `EXIT_USAGE` (2), `EXIT_FILESYSTEM` (3)
- **File operations**: Use `files.mjs` helpers — never use raw `fs` outside of `files.mjs`
- **Output**: Use `state.mjs` helpers — `ok()`, `warn()`, `fail()`, `info()`, `heading()`, `dryRun()`
- **New agent files**: Add to `AGENT_NAMES` array in `constants.mjs`

## Testing Requirements
- Every new module must have a corresponding test file: `test/unit/{module}.test.mjs`
- Use test helpers from `test/helpers/setup.mjs`: `createTempDir()`, `cleanTempDir()`, `createMockProject()`, `runCli()`
- Integration tests use `runCli()` subprocess — never import CLI modules directly in integration tests

## Adding a New Command
1. Create `bin/lib/commands/{command}.mjs` with a named export function
2. Add the command to `COMMANDS` in `bin/lib/constants.mjs`
3. Register in the `switch` statement in `bin/sparq.mjs`
4. Add help text to `bin/lib/commands/help.mjs`
5. Create `test/unit/{command}.test.mjs` for unit tests
6. Add integration test coverage in `test/integration/`
7. Run `node --check bin/lib/commands/{command}.mjs` and full test suite

## Verification
- `node --check bin/sparq.mjs` after any entry point change
- `node --check bin/lib/{module}.mjs` after modifying a module
- `npm run lint` passes with zero warnings
- `npm test` passes with zero failures
