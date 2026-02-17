---
name: sparq:init
description: "Bootstrap SparQ configuration. Use when: starting SparQ for the first time, re-initializing config, or switching projects."
audience: qa
---

# Initialize SparQ Configuration

**Purpose**: Create or reset `sparq.config.json` and set up the `.sparq/` directory structure. This is the entry point for new SparQ users or when switching to a new project.

## Quick Start Mode

When user provides `--quick` or asks for quick setup, use the streamlined 3-question flow:

1. Auto-detect everything from `package.json` and filesystem (tech stack, E2E, source root, routes)
2. Show what was detected: "Detected: {framework} + {e2e.framework} + TypeScript"
3. Ask only: "Jira project key? (press Enter to skip)"
4. Apply smart defaults: all detected MCP sources enabled, TMS none, checkpoint full, export disabled
5. Generate config, create directories, report summary
6. End with: "Get started: `/sparq:start`"

Quick mode defaults:
- Sources: enable all that have MCP servers configured, plus local files
- TMS: none (user adds later via `/sparq:config`)
- Checkpoint level: full (safe default for new users)
- Exports: disabled (user enables later)
- Framework, router, and component extensions: auto-detected

## Standard Workflow

1. **Check existing config**: If `sparq.config.json` exists, prompt user:
   - **Keep**: Use existing config, skip to step 8 (verification only)
   - **Reset**: Delete and regenerate from scratch
   - **Merge**: Keep existing values, fill in missing fields with defaults

2. **Auto-detect tech stack** from `package.json` and project structure:
   - `package.json` -> detect framework (`vue`, `react`, `angular`, `svelte`) — framework name is NOT stored in config; only derived fields (`componentFileExtensions`, `sourceRoot`, `routeDiscoveryPattern`) are stored in the `project` section
   - **Component file extensions**: derived from detected framework, stored in `project.componentFileExtensions`
   - Router: `vue-router` -> `"vue-router"`, `react-router` or `react-router-dom` -> `"react-router"`, `@angular/router` -> `"angular-router"`, `next` -> `"next-router"`, `nuxt` -> `"nuxt-router"`
   - **Detect `project.sourceRoot`**: check for `src/`, `app/`, `lib/` directories; use whichever exists (prefer `src/` if multiple)
   - **Detect `project.routeDiscoveryPattern`**: derive from detected router (e.g., `"**/router/**/*.ts"` for vue-router, `"app/**/page.tsx"` for Next.js, `"**/app-routing*.ts"` for Angular)

3. **Auto-detect E2E setup** from filesystem:
   - Check for `playwright.config.*` AND `cypress.config.*` to determine E2E framework
   - If no E2E framework detected, default to Playwright and set `e2e.framework: "playwright"`
   - Scan for `e2e/` or `cypress/` directory
   - Discover page objects: glob `e2e/pages/**/*.page.ts`
   - Discover components: glob `e2e/components/**/*.component.ts`
   - Discover steps: glob `e2e/steps/**/*.steps.ts`
   - Discover fixtures: glob `e2e/fixtures/**/*.fixture.ts`
   - Discover specs: glob `e2e/specs/**/*.spec.ts`
   - Find base class: look for `abstract.page.ts` or class extending nothing with abstract methods
   - Find fixture index: look for `e2e/fixtures/index.ts`

4. **Prompt for source configuration** (requirements gathering):
   - Jira: "Enter Jira project key (e.g., EP) or press Enter to skip"
   - Confluence: "Enter Confluence space key or press Enter to skip"
   - Figma: "Enable Figma integration? (y/n)"
   - Local requirements: "Requirements directory path" (default: `docs/specs`)

5. **Prompt for export targets** (where to publish results):
   - TMS provider: "Select TMS provider: (1) TestRail, (2) Qase, (3) Local folder, (4) None" (default: None)
   - If TestRail: "Enter TestRail project ID" and "Enter TestRail suite ID"
   - If Qase: "Enter Qase project code (e.g., PROJ)"
   - If Local: uses default `.sparq/tms-export` (configurable via `outputs.tms.local.outputDir`)
   - Jira export: "Link test results back to Jira tickets? (y/n)" (default: yes if Jira source enabled)
   - Confluence export: "Publish test plans to Confluence? (y/n)" (default: yes if Confluence source enabled)
   - If Confluence export enabled and no source space key: "Confluence space key for publishing"

6. **Generate `sparq.config.json`**: Assemble all detected and user-provided values. See `.claude/skills/sparq-shared/references/config-schema.md` for full schema and defaults.

7. **Create `.sparq/` directory structure**:
   ```
   .sparq/
   ├── requirements/     # REQ-{feature}.md files
   ├── test-cases/       # TC-{feature}-manual.md and .xml files
   ├── coverage/         # Coverage matrices
   ├── validation/       # Validation reports
   ├── refresh/          # S5 diff reports and previous requirement snapshots
   ├── plans/            # Execution plans
   ├── parallel/         # Temporary parallel staging (shared file patches only, cleaned after merge)
   └── tracking/         # Test registry for traceability
       └── test-registry.json  # Auto-maintained test-to-requirement mapping
   ```
   Note: E2E test code (pages, steps, fixtures, specs) is written directly to the project's test directory per `e2e.structure.*` config. The `.sparq/` directory holds metadata only.
   Note: `.sparq/state/` is NOT created by init — the orchestrator creates it at workflow start and is the sole writer. See `resume-protocol.md`.
   Directory `.sparq/tracking/` must be created before initializing `test-registry.json`.
   Initialize `test-registry.json` with: `{"version":"1.0","lastUpdated":null,"entries":[]}`

8. **Verify MCP server availability** (30s timeout per server): Test each enabled source:
   - Jira: attempt `mcp__atlassian__jira_get_issue` with a known ticket (or list projects)
   - Confluence: attempt `mcp__atlassian__confluence_search` with space key
   - Figma: attempt `mcp__figma__whoami`
   - TestRail: attempt `mcp__testrail__get_sections` with project ID
   - Qase: attempt `mcp__qase__list_suites` with project code
   If verification fails, warn and continue -- user can configure later (see `degradation-strategy.md` Init Skill Fallback).
   - Playwright (when `e2e.framework` is `playwright`): attempt `mcp__playwright__browser_navigate` to `about:blank`
   - Report status for each: available / unavailable / auth required

   After verification, present results in a clear dashboard:

   ```
   Integration Status
   ──────────────────
   Jira ({key}):      {status} -- {action if failed}
   Confluence ({key}): {status} -- {action if failed}
   Figma:             {status} -- {action if failed}
   Playwright:        {status} -- {action if failed}
   ```

   Status values:
   - "Ready" -- connection verified, tool responded
   - "Auth failed" -- "Check your API token in .mcp.json"
   - "Not configured" -- "Enable in sparq.config.json or via /sparq:config"
   - "Timeout" -- "Service may be temporarily unavailable. SparQ will retry during workflows."

   If any source is unavailable, explain impact:
   - "Jira unavailable: Requirements must be provided manually (paste or local file)"
   - "Figma unavailable: Selectors will be derived from codebase analysis only"
   - "Playwright unavailable: Test verification will be manual"

9. **Report setup summary** (use plain language — explain what each connection does):
   ```
   SparQ Configuration Summary
   ===========================
   Project: my-app
   Source Root: src/
   Tech Stack: {framework} + {e2e.framework}
   E2E Framework: {e2e.framework} (from config)
   E2E Infrastructure: 3 pages, 2 components, 1 fixture, 5 specs

   Connections (how SparQ talks to your tools):
     Jira (EP):       Reads requirements from your Jira tickets ........... available
     Confluence (TEAM): Reads specifications from your Confluence pages ... available
     Figma:           Reads UI designs for selector discovery ............. not configured
     Playwright:      Runs tests and verifies selectors in a browser ..... available
     Local (docs/specs): Reads requirements from local markdown files .... available

   Export Targets (where results are published):
     TMS: testrail (project 1, suite 1)
     Jira: adds coverage comments to tickets
     Confluence: publishes test plans to space TEAM

   Config saved to: sparq.config.json

   Get started: /sparq:start (guided workflow)
   Or jump in:  /sparq:generate {ticket-id}
   ```

10. **Generate quick reference card** at `.sparq/QUICKREF.md` using the `claude/templates/sparq-quickref.md` template, filling in project-specific values from the config:
    - `{project.name}` from `package.json` `name` field (not stored in sparq.config.json)
    - `{e2e.framework}` from `sparq.config.json` `e2e.framework`
    - `{project.testDir}` from `sparq.config.json` `e2e.structure.specsDir` (e.g., `e2e/specs`)
    - `{enabled sources}` — comma-separated list of sources where `enabled: true` (e.g., `Jira, Confluence, Local files`)
    - `{outputs.tms.provider}` from `sparq.config.json` `outputs.tms.provider` (or `none` if not configured)
    - `{preferences.checkpointLevel}` from `sparq.config.json` `preferences.checkpointLevel`
    - Write the filled template to `.sparq/QUICKREF.md`
    - Tell the user: "Quick reference card saved to `.sparq/QUICKREF.md`"

## Entry Conditions

- User runs `/sparq:init` explicitly
- Another skill detects missing `sparq.config.json` and suggests running init
- User switches to a new project directory

## Exit Conditions

- `sparq.config.json` written to project root
- `.sparq/` directory structure created
- MCP availability verified and reported
- User informed of next steps

## Error Handling

- If `package.json` not found: prompt user for project name and tech stack manually
- If no `e2e/` directory and no E2E config files: set `e2e.detected: false`, default to `e2e.framework: "playwright"` for new projects
- If MCP verification fails: log warning, set source as enabled but note unavailability
- Never fail entirely -- always produce a config file with available information

<done_criteria>
1. Project structure scanned — tech stack, E2E setup, source root, and component extensions auto-detected from `package.json` and filesystem
2. `sparq.config.json` generated at project root with all detected and user-provided settings
3. Config validated against `config-schema.md` — all required fields present with correct types and no unknown keys
4. `.sparq/` directory structure created with all required subdirectories and `test-registry.json` initialized
5. User confirmed config values and received setup summary listing detected stack, source availability, and export targets
6. Quick reference card generated at `.sparq/QUICKREF.md` with project-specific values filled in from config
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/config-schema.md` -- full schema documentation
- `.claude/skills/sparq-shared/references/degradation-strategy.md` -- fallback behaviors for unavailable sources
- `claude/templates/sparq-quickref.md` -- quick reference card template (filled during step 10)

## Usage

```
/sparq:init
```

Examples:
- `"Initialize SparQ in this project"`
- `"Set up SparQ with quick mode"`
- `"Re-initialize SparQ config for a new project"`

## Example

```
/sparq:init
-> checks for existing config (not found)
-> reads package.json: detects framework, router, componentFileExtensions
-> detects project.sourceRoot: src/
-> detects componentFileExtensions from framework
-> checks for playwright.config.* / cypress.config.* -> determines e2e.framework
-> scans e2e/: 3 pages, 2 components, 1 step, 1 fixture, 5 specs
-> prompts: Jira key? "EP" | Confluence? "TEAM" | Figma? "y" | TMS? "testrail" (project 1, suite 1)
-> generates sparq.config.json (with all detected fields)
-> creates .sparq/ directories
-> verifies: Jira OK, Confluence OK, Figma OK, TestRail OK, Qase N/A, E2E runner OK
-> output: setup summary
-> generates .sparq/QUICKREF.md from template with project values
```
