# sparq.config.json Schema Reference

Complete schema for `sparq.config.json`. All SparQ skills and agents read this file at startup. For any missing field, agents use the documented default value.

## Project

<project_fields>
- `version` (string, **required**): Package version. Current: `"1.0.0"`
- `project.testDir` (string, optional, default `"e2e"`): Test directory. Auto-detected from e2e config when omitted.
- `project.sourceRoot` (string, optional, default `"src"`): Where application source code lives. Auto-detected from project structure (`src/`, `app/`, `lib/`).
- `project.routeDiscoveryPattern` (string, optional): Glob pattern for finding route definitions. Derived from detected router. E.g., `"**/router/**/*.ts"` for Vue Router.
- `project.componentFileExtensions` (string[], optional): File extensions to scan for UI components. Auto-populated by init based on detected framework (e.g., `[".vue"]` for Vue, `[".tsx", ".jsx"]` for React, `[".component.html", ".component.ts"]` for Angular, `[".svelte"]` for Svelte). Defaults to `[".tsx", ".jsx", ".vue"]` (broad search) when no framework is detected. Override manually for non-standard setups.
</project_fields>

## Sources

External data sources for requirements gathering. Each source has an `enabled` flag and source-specific configuration.

<sources>
- `sources.jira.enabled` (boolean, default `false`): Enable Jira integration (via `mcp__atlassian__jira_*`)
- `sources.jira.projectKey` (string): Jira project key (e.g., `"EP"`)
- `sources.confluence.enabled` (boolean, default `false`): Enable Confluence integration (via `mcp__atlassian__confluence_*`)
- `sources.confluence.spaceKey` (string): Confluence space key
- `sources.figma.enabled` (boolean, default `false`): Enable Figma integration (via `mcp__figma__*`)
- `sources.local.enabled` (boolean, default `true`): Enable local file scanning
- `sources.local.requirementsDir` (string, default `"docs/specs"`): Directory for local requirement files
</sources>

## Inputs

Configuration for reading test cases from external TMS providers via MCP (S2 TMS read).

<inputs>
- `inputs.tms.provider` (string|null, default `null`): `"testrail"` | `"qase"` | `"zephyr"` | `null`
- `inputs.tms.testrail.projectId` (number|null): TestRail project ID (required when provider is "testrail")
- `inputs.tms.testrail.suiteId` (number|null): TestRail suite ID (required when provider is "testrail")
- `inputs.tms.testrail.sectionId` (number|null): Optional — filter to specific section
- `inputs.tms.qase.projectCode` (string|null): Qase project code (required when provider is "qase")
- `inputs.tms.qase.suiteId` (number|null): Optional — filter to specific suite
- `inputs.tms.zephyr.projectKey` (string|null): Zephyr Scale project key (required when provider is "zephyr")
- `inputs.tms.zephyr.folderId` (number|null): Optional — filter to specific folder
</inputs>

**Fallback**: If `inputs.tms` is not set, agents check `outputs.tms` for matching provider/credentials. This avoids config duplication when input and output TMS are the same.

## E2E Infrastructure (auto-detected)

Auto-detected by `/sparq:init` or on first run. Describes the existing E2E test infrastructure.

<e2e_infrastructure>
- `e2e.detected` (boolean, default `false`): Whether E2E infrastructure was found
- `e2e.framework` (string, default `"none"`): `"playwright"` | `"cypress"` | `"none"`
- `e2e.structure.pages` (string, default `"e2e/pages"`): Page objects directory
- `e2e.structure.components` (string, default `"e2e/components"`): Component objects directory
- `e2e.structure.steps` (string, default `"e2e/steps"`): Step definitions directory
- `e2e.structure.fixtures` (string, default `"e2e/fixtures"`): Test fixtures directory
- `e2e.structure.specs` (string, default `"e2e/specs"`): Test spec files directory
- `e2e.configFile` (string|null): Path to E2E config file (e.g., `"playwright.config.ts"`). Auto-detected.
- `e2e.baseClass` (string): Path to AbstractPage (e.g., `"e2e/pages/abstract.page.ts"`)
- `e2e.hasAbstractPage` (boolean): Whether an abstract page base class was detected
- `e2e.fixtureIndex` (string): Path to fixtures index (e.g., `"e2e/fixtures/index.ts"`)
- `e2e.hasFixtureIndex` (boolean): Whether a fixture index barrel file was detected

When `e2e.framework: 'cypress'`, default structure:
- pages: `cypress/support/pages`
- components: `cypress/support/components`
- steps: `cypress/support/steps`
- fixtures: `cypress/fixtures`
- specs: `cypress/e2e`
</e2e_infrastructure>

## Outputs

Configuration for generated artifacts.

<outputs>
- `outputs.testCases.format` (string, default `"both"`): `"markdown"` | `"xml"` | `"both"`
- `outputs.testCases.outputDir` (string, default `".sparq/test-cases"`): Output directory for test cases
- `outputs.automation.framework` (string, default `"playwright"`): Automation framework

### TMS (Test Management System)

- `outputs.tms.provider` (string|null, default `null`): `"testrail"` | `"qase"` | `"zephyr"` | `"local"` | `null`
- `outputs.tms.testrail.projectId` (number|null): TestRail project ID (required when provider is "testrail")
- `outputs.tms.testrail.suiteId` (number|null): TestRail suite ID (required when provider is "testrail")
- `outputs.tms.qase.projectCode` (string|null): Qase project code (required when provider is "qase")
- `outputs.tms.zephyr.projectKey` (string|null): Zephyr Scale project key (required when provider is "zephyr"). Must match `ZEPHYR_PROJECT_KEY` env var. E.g., `"PROJ"`
- `outputs.tms.zephyr.folderId` (number|null): Optional — filter export to specific Zephyr folder
- `outputs.tms.local.outputDir` (string, default `".sparq/tms-export"`): local export directory
- `outputs.tms.local.format` (string, default `"json"`): `"json"` | `"markdown"`
- `outputs.jira.enabled` (boolean, default `false`): Enable Jira export via `mcp__atlassian__jira_*`. When enabled, coverage comments and `qa-covered` labels are always added to source tickets.
- `outputs.jira.createSubTask` (boolean, default `false`): Create a QA Test Plan sub-task on source ticket
- `outputs.confluence.enabled` (boolean, default `false`): Enable Confluence export (publish test plan pages via `mcp__atlassian__confluence_*`)
- `outputs.confluence.spaceKey` (string|null, default `null`): Confluence space key for export. Falls back to `sources.confluence.spaceKey` if null
- `outputs.confluence.parentPageTitle` (string|null, default `null`): Optional parent page title to nest QA pages under
</outputs>

**Note**: E2E test code is written directly to the project test directory per `e2e.structure.*` paths. The `.sparq/` directory holds metadata artifacts only (requirements, test cases, coverage, validation, tracking, plans).

**Note**: The export skill reads output settings from `outputs.tms`, `outputs.jira`, and `outputs.confluence`. Jira/Confluence source settings (`sources.jira`, `sources.confluence`) are used for requirements gathering only; export uses the `outputs` section.

## Monorepo / Workspace Support

Configuration for monorepo setups (Nx, Turborepo, npm workspaces). Declare each package that has its own E2E setup in a root-level `workspaces` array. Use `--workspace {path}` or `--all-workspaces` CLI flags to scope commands to a package.

<workspaces>
- `workspaces` (array, optional): List of workspace package entries. Each entry:
  - `path` (string, **required**): Relative path from the repo root to the workspace package (e.g., `"packages/web"`). Must be a relative path — no leading `/` or `..` traversal.
  - `name` (string, optional): Human-readable display name shown in CLI output headers (e.g., `"Web App"`). Defaults to `path` when omitted.

**Merge semantics**: When a workspace directory contains its own `sparq.config.json`, it is deep-merged with the root config. Workspace values win on key conflicts. The `workspaces` array itself is root-only and is never inherited by workspace-level configs. When no workspace config file exists, the root config is used with `project.sourceRoot` adjusted to `{workspacePath}/src` (only when the root `sourceRoot` is still the default `"src"`).

**CLI flags** (scoped per command):
- `sparq lint --workspace packages/web` — lint a single workspace
- `sparq lint --all-workspaces` — lint all declared workspaces, aggregate results
- `sparq doctor --workspace packages/web` — check a single workspace install
- `sparq init --workspace packages/web` — create workspace-specific config only (skips global agent/skill install)
</workspaces>

## Refresh (S5)

Configuration for test refresh behavior when syncing existing tests against updated requirements.

<refresh>
- `refresh.preserveDeprecated` (boolean, default `true`): Keep deprecated tests with `[REFRESH] DEPRECATED` comment instead of removing. When `false`, removed requirements trigger test deletion.
- `refresh.autoApplyLowSeverity` (boolean, default `false`): Auto-apply low-severity changes (text-only updates) without checkpoint. When `true`, only medium/high severity changes require user approval.
</refresh>

## Test Registry (Local-Only)

The test registry at `.sparq/tracking/test-registry.json` is a **local-only** runtime artifact. It is NOT project configuration and MUST NOT be committed to version control.

<test_registry>
- **Location**: `.sparq/tracking/test-registry.json` (inside gitignored `.sparq/` directory)
- **Purpose**: Tracks content hashes of requirements and test files for staleness detection in S5 (Refresh)
- **Lifecycle**: Auto-created by S1/S2/S3 scenarios, auto-updated by S5. Agents should never ask users to manually edit this file.
- **Scope**: Per-developer, per-machine. Each developer's registry reflects their local generation history.
- **Loss tolerance**: If deleted, S5 treats all requirements as NEW on next refresh (safe degradation). No data loss — just a full re-diff instead of incremental.
- **NOT shared**: This file should never appear in pull requests, CI artifacts, or team documentation. The `.sparq/` gitignore entry already prevents accidental commits.
</test_registry>

## Preferences

User preferences for interactive behavior and test generation.

<preferences>
- `preferences.interactiveMode` (boolean, default `true`): Enable CHECKPOINT prompts
- `preferences.locatorPriority` (string[], default `["getByTestId", "getByRole", "getByLabel", "getByText"]`): Locator strategy priority order for E2E test generation
- `preferences.testMultiplier` (number, default `5`): Tests per requirement estimate
- `preferences.maxClarifications` (number, default `2`, range `1-5`): Maximum clarification turns before proceeding to execution
- `preferences.checkpointLevel` (string, optional, default `"full"`): Controls checkpoint frequency
  - `"full"`: User confirmation at every phase transition (default, recommended)
  - `"standard"`: User confirmation only at major milestones (S1->S2, final output)
  - `"fast"`: Minimal confirmation — only on blocking decisions (missing data, ambiguous reqs)
- `preferences.smokeVerify` (string, optional, default `"list"`): Controls Phase 3 smoke verification depth
  - `"list"`: Playwright: `npx playwright test --list`; Cypress: `npx cypress verify` + `npx tsc --noEmit`
  - `"typecheck"`: `npx tsc --noEmit` (both frameworks)
  - `"run-subset"`: Playwright: `npx playwright test {file} --grep "{first-test-title}"`; Cypress: `npx cypress run --spec {file}`
- `preferences.modelTier` (string, optional, default `"premium"`): Controls which model tier is used for agents
  - `"premium"`: opus + sonnet (default) — strongest reasoning and structured generation
  - `"balanced"`: all sonnet — good quality at lower cost
  - `"economy"`: all haiku — lowest cost, best for simple/well-constrained workflows
- `preferences.batchApproval` (boolean, optional, default `false`): Plan-once, run-mostly-uninterrupted mode
  - When `false` (default): standard checkpoint behaviour controlled by `checkpointLevel`
  - When `true`: orchestrator presents an enhanced Phase 0 plan showing ALL phases (test count estimates by category, source breakdown, agent assignments, expected artifacts) → single user approval gate → subsequent P1/P2 checkpoints auto-approved (logged as "batch-approval-mode")
  - Interrupted automatically if: any agent returns `status: "failed"`, delivered artifact count is <75% of estimated, token budget exceeds 120K, critical codebase readiness issue, or unresolvable blocking question
  - Phase 3 final approval is always presented regardless of this setting
  - Contrast with `checkpointLevel: fast` which silently skips ALL approvals including critical gaps. `batchApproval` is the recommended middle ground for team CI pipelines
- `preferences.coverageThreshold` (number, optional, default `80`, range `0-100`): Minimum requirement coverage % to accept after Phase 2. When coverage is below this threshold, the orchestrator runs a coverage iteration loop (up to 3 rounds) to fill gaps before proceeding to Phase 3. Set to `0` to disable the coverage loop entirely. Applies to S1, S1+S2, S3 (feature mode) only. S3 bug mode excluded. Full protocol: `coverage-iteration.md`
- Note: `preferences.locatorPriority` maps to Cypress commands per `cypress-patterns.md` when `e2e.framework` is `"cypress"`
</preferences>

## Viewports

Configuration for responsive viewport testing. When enabled, the automation-engineer wraps generated E2E tests in `test.each(VIEWPORTS)` using the data-driven pattern from `data-driven-patterns.md`. Test count multiplies by the number of active viewports.

<viewports>
- `viewports.enabled` (boolean, default `false`): Enable viewport matrix testing. When `false`, desktop-only tests are generated (no change from baseline behavior).
- `viewports.presets` (string[], optional): Named presets to include. Valid values: `"desktop"`, `"laptop"`, `"tablet"`, `"mobile"`, `"mobile-lg"`. Resolved to `{ width, height }` per `viewport-patterns.md` presets table.
- `viewports.custom` (object[], optional): Additional viewport definitions. Each entry: `{ name: string, width: number, height: number }`. Custom entries are merged after presets; name collisions favor custom.
</viewports>

## Example Configuration

```json
{
  "version": "1.0.0",
  "project": {
    "testDir": "e2e",
    "sourceRoot": "src",
    "routeDiscoveryPattern": "**/router/**/*.ts",
    "componentFileExtensions": [".vue"]
  },
  "inputs": { "tms": { "provider": null } },
  "sources": {
    "jira": { "enabled": true, "projectKey": "EP" },
    "confluence": { "enabled": true, "spaceKey": "TEAM" },
    "figma": { "enabled": true },
    "local": { "enabled": true, "requirementsDir": "docs/specs" }
  },
  "e2e": {
    "detected": true,
    "framework": "playwright",
    "structure": {
      "pages": "e2e/pages",
      "components": "e2e/components",
      "steps": "e2e/steps",
      "fixtures": "e2e/fixtures",
      "specs": "e2e/specs"
    },
    "baseClass": "e2e/pages/abstract.page.ts",
    "fixtureIndex": "e2e/fixtures/index.ts"
  },
  "outputs": {
    "testCases": { "format": "both" },
    "automation": { "framework": "playwright" },
    "tms": { "provider": "testrail", "testrail": { "projectId": 1, "suiteId": 1 } },
    "jira": { "enabled": true, "createSubTask": false },
    "confluence": { "enabled": true, "spaceKey": "TEAM" }
  },
  "preferences": {
    "locatorPriority": ["getByTestId", "getByRole", "getByLabel", "getByText"],
    "testMultiplier": 5,
    "maxClarifications": 2,
    "checkpointLevel": "full",
    "smokeVerify": "list",
    "modelTier": "premium",
    "batchApproval": false,
    "coverageThreshold": 80
  },
  "refresh": { "autoApplyLowSeverity": false, "preserveDeprecated": true },
  "viewports": {
    "enabled": true,
    "presets": ["desktop", "mobile"],
    "custom": []
  },
  "workspaces": [
    { "path": "packages/web", "name": "Web App" },
    { "path": "packages/admin" }
  ]
}
```
