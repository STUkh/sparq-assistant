# SparQ Setup Guide

> **New to SparQ?** Start with the [Getting Started guide](GETTING-STARTED.md) for a beginner-friendly introduction to concepts, installation, and your first workflow. This page covers advanced configuration and MCP server setup.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Install](#quick-install)
- [Step-by-Step Installation](#step-by-step-installation)
- [MCP Server Authentication](#mcp-server-authentication)
- [Verifying MCP Connections](#verifying-mcp-connections)
- [Troubleshooting MCP](#troubleshooting-mcp)
- [Configuration Reference](#configuration-reference)
- [Upgrading](#upgrading)
- [CI/CD Usage](#cicd-usage)
- [Dry Run Mode](#dry-run-mode)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)

## Prerequisites

- **Node.js** >= 22.0.0 (`node --version`)
- **Claude Code CLI** latest (`claude --version`)

**MCP server access (optional):**

| Server | Required For | Auth |
|--------|-------------|------|
| Figma | UI element extraction, selector enrichment | OAuth (auto-prompted) |
| Atlassian | Requirement gathering from Jira/Confluence | OAuth (auto-prompted) |
| TestRail | Exporting test cases | API key (env vars) |
| Qase | Exporting test cases | API token (env var) |
| Playwright | Browser verification, selector testing | None (local) |

No MCP servers are required. SparQ degrades gracefully when servers are unavailable.

## Quick Install

```bash
npx sparq-assistant@latest init
```

Restart Claude Code to load MCP servers.

For CI/scripted installations:

```bash
npx sparq-assistant init --non-interactive
```

Uses safe local-first defaults (local requirements enabled; Jira/Confluence/Figma disabled). Edit `sparq.config.json` manually afterward.

## Step-by-Step Installation

### 1. Navigate to Your Project Root

```bash
cd /path/to/your/project
```

Run from the root where your `e2e/` tests and `CLAUDE.md` live.

### 2. Run the Setup Wizard

```bash
npx sparq-assistant init
```

The wizard will:
- Check Node.js version
- Create `.claude/` directory if needed
- Ask configuration questions (project name, integrations, test directory, TestRail)
- **Auto-detect e2e structure** -- page objects, components, steps, fixtures, naming conventions
- **Auto-detect project settings** -- framework (Vue, React, Angular, Svelte), UI library, test runner (Playwright, Cypress), component file extensions, source root
- Copy agent definitions, skill files, and templates into `.claude/`
- Generate `sparq.config.json` with detection results
- Merge MCP configs into `.mcp.json`
- Append SparQ reference block to `CLAUDE.md`
- Add `.sparq/` to `.gitignore`
- Run health check

### 3. Restart Claude Code

After init completes, **restart Claude Code** so it picks up the new MCP server entries in `.mcp.json`.

### 4. Interactive Prompts

Defaults below are for interactive setup (`npx sparq-assistant init`).
For non-interactive setup (`--non-interactive`), SparQ uses safe local-first defaults: Jira/Confluence/Figma disabled, local requirements enabled.

| Prompt | Default | Description |
|--------|---------|-------------|
| Project name | Directory name | Display name for reports |
| Enable Figma? | Yes | Figma MCP for design extraction |
| Enable Jira? | Yes | Jira MCP for ticket data |
| Jira project key | EP | Default project key for JQL |
| Enable Confluence? | Yes | Confluence MCP for specs |
| Confluence space key | PROJ | Default space |
| Enable local requirements? | Yes | Scan `docs/specs/` |
| Playwright test directory | e2e | Where Playwright tests live |
| Enable TestRail? | No | TestRail MCP for export |
| TestRail project ID | -- | Required if enabled |
| TestRail suite ID | -- | Required if enabled |
| Enable Qase? | No | Qase MCP for export |
| Qase project code | -- | Required if enabled |

### 5. Feature Selection (Optional)

Use `--features` to install only the capabilities you need:

```bash
npx sparq-assistant init --features=e2e,jira,figma
```

**Available features:**

| Feature | Description |
|---------|-------------|
| `core` | Orchestrator, analysis skill, execution plan template (always included) |
| `manual-tests` | Requirements analysis and manual test case generation |
| `e2e` | Playwright automation engineering and test validation |
| `jira` | Jira integration via Atlassian MCP server |
| `confluence` | Confluence integration via Atlassian MCP server |
| `figma` | Figma design integration via Figma MCP server |
| `testrail` | TestRail export via TestRail MCP server |
| `playwright-mcp` | Playwright browser automation via MCP server |
| `qase` | Qase export via Qase MCP server |
| `export` | Export skill for pushing artifacts to external systems |
| `regression` | Bug regression test generation (S6) |
| `resume` | Workflow resume capability |

**Presets:**

| Preset | Includes |
|--------|----------|
| `all` / `full-qa` | All features |
| `minimal` | Core only |
| `e2e-only` | Core + E2E + Playwright MCP |

### 6. CI Workflow Generation (Optional)

Generate a CI workflow template for running Playwright tests:

```bash
npx sparq-assistant init --ci-provider=github
npx sparq-assistant init --ci-provider=gitlab
npx sparq-assistant init --ci-provider=azure
```

This creates a ready-to-use workflow file (`.github/workflows/e2e.yml`, `.gitlab-ci.yml`, or `azure-pipelines-e2e.yml`) pre-configured with your project's test directory and Playwright config.

### 7. Verify

```bash
npx sparq-assistant doctor
```

## MCP Server Authentication

### Figma

- **Type:** HTTP -- `https://mcp.figma.com/mcp`
- **Auth:** OAuth, auto-prompted on first use
- **Source:** `mcp/figma.json` (merged into your `.mcp.json` during init)
- **Environment variables:** None required
- No manual setup required. Claude Code prompts for OAuth on first tool invocation.

### Atlassian (Jira + Confluence)

- **Type:** HTTP -- `https://mcp.atlassian.com/v1/mcp`
- **Auth:** OAuth, auto-prompted on first use
- **Source:** `mcp/atlassian.json` (merged into your `.mcp.json` during init)
- **Environment variables:** None required
- Both Jira and Confluence use the same server. Claude Code prompts for OAuth on first tool invocation.

### TestRail

- **Type:** stdio -- `npx -y @bun913/mcp-testrail`
- **Auth:** API key via environment variables
- **Source:** `mcp/testrail.json` (merged into your `.mcp.json` during init)

**Required environment variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `TESTRAIL_BASE_URL` | Your TestRail instance URL (no trailing slash) | `https://yourteam.testrail.io` |
| `TESTRAIL_USERNAME` | TestRail login email | `your.email@company.com` |
| `TESTRAIL_API_KEY` | TestRail API key (not your password) | `ABcd1234EFgh5678` |

**How to set them:**

Option A -- Export in your shell profile (`~/.zshrc`, `~/.bashrc`):

```bash
export TESTRAIL_BASE_URL="https://yourteam.testrail.io"
export TESTRAIL_USERNAME="your.email@company.com"
export TESTRAIL_API_KEY="your-api-key-here"
```

Option B -- Create a `.env` file in your project root (add to `.gitignore`):

```dotenv
TESTRAIL_BASE_URL=https://yourteam.testrail.io
TESTRAIL_USERNAME=your.email@company.com
TESTRAIL_API_KEY=your-api-key-here
```

Then source it before launching Claude Code: `source .env && claude`

**How `${VAR}` interpolation works:** The `mcp/testrail.json` config uses `"${TESTRAIL_BASE_URL}"` syntax in the `env` block. When Claude Code merges this into `.mcp.json`, these `${VAR}` references are resolved from your shell environment at MCP server launch time. If the variable is not set, the server receives an empty string and will fail to authenticate.

**How to generate an API key:** TestRail > My Settings > API Keys > Add Key.

### Qase

- **Type:** stdio -- `npx -y @qase/mcp-server`
- **Auth:** API token via environment variable
- **Source:** `mcp/qase.json` (merged into your `.mcp.json` during init)

**Required environment variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `QASE_API_TOKEN` | Qase API token | `abc123def456ghi789` |

**How to set it:**

Option A -- Export in your shell profile (`~/.zshrc`, `~/.bashrc`):

```bash
export QASE_API_TOKEN="your-api-token-here"
```

Option B -- Create a `.env` file in your project root (add to `.gitignore`):

```dotenv
QASE_API_TOKEN=your-api-token-here
```

Then source it before launching Claude Code: `source .env && claude`

**How to generate an API token:** Qase > Workspace Settings > API tokens > Create new token.

### Playwright

- **Type:** stdio -- `npx -y @playwright/mcp@latest`
- **Auth:** None (runs locally)
- **Source:** `mcp/playwright.json` (merged into your `.mcp.json` during init)
- **Environment variables:** None required
- Runs a local Chromium browser for selector verification and debugging.

## Required Environment Variables Summary

| Server | Variable | Required | How to Obtain |
|--------|----------|----------|---------------|
| **TestRail** | `TESTRAIL_BASE_URL` | Yes | Your TestRail instance URL |
| **TestRail** | `TESTRAIL_USERNAME` | Yes | Your TestRail login email |
| **TestRail** | `TESTRAIL_API_KEY` | Yes | TestRail > My Settings > API Keys |
| **Qase** | `QASE_API_TOKEN` | Yes | Qase > Workspace Settings > API tokens |
| **Figma** | _(none)_ | -- | OAuth auto-prompted by Claude Code |
| **Atlassian** | _(none)_ | -- | OAuth auto-prompted by Claude Code |
| **Playwright** | _(none)_ | -- | No auth needed |

To verify all required variables are set:

```bash
echo "TESTRAIL_BASE_URL: ${TESTRAIL_BASE_URL:-(not set)}"
echo "TESTRAIL_USERNAME: ${TESTRAIL_USERNAME:-(not set)}"
echo "TESTRAIL_API_KEY:  ${TESTRAIL_API_KEY:+(set)}"
echo "QASE_API_TOKEN:   ${QASE_API_TOKEN:+(set)}"
```

## Verifying MCP Connections

After running `npx sparq-assistant init` and restarting Claude Code, verify each MCP server is working.

### Verify Atlassian (Jira + Confluence)

In a Claude Code session, ask Claude to fetch a Jira ticket:

```
Fetch Jira ticket EP-1 and summarize it.
```

Expected: Claude invokes the Atlassian MCP tool and returns ticket details. On first use, you will be prompted to authorize via OAuth in your browser.

You can also test Confluence:

```
Search Confluence space PROJ for pages about "test strategy".
```

### Verify Figma

In a Claude Code session, provide a Figma URL:

```
Get the design details from this Figma file: https://www.figma.com/design/YOUR_FILE_ID/YOUR_FILE_NAME
```

Expected: Claude invokes the Figma MCP tool and returns design metadata. On first use, you will be prompted to authorize via OAuth in your browser.

### Verify TestRail

First, confirm your environment variables are set (see above). Then in a Claude Code session:

```
List the test sections in TestRail project 1, suite 1.
```

Expected: Claude invokes the TestRail MCP tool and returns section data. If you see an authentication error, double-check your `TESTRAIL_BASE_URL`, `TESTRAIL_USERNAME`, and `TESTRAIL_API_KEY`.

You can also verify connectivity outside Claude Code:

```bash
curl -s -u "${TESTRAIL_USERNAME}:${TESTRAIL_API_KEY}" \
  "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_projects" | head -c 200
```

Expected: JSON response with your TestRail projects (or `{"projects":[...]}`).

### Verify Qase

First, confirm your `QASE_API_TOKEN` is set (see above). Then in a Claude Code session:

```
List the test suites in Qase project "MYPROJECT".
```

Expected: Claude invokes the Qase MCP tool and returns suite data. If you see an authentication error, double-check your `QASE_API_TOKEN`.

### Verify Playwright

In a Claude Code session:

```
Use the Playwright MCP to navigate to https://example.com and take a screenshot.
```

Expected: Claude launches a local Chromium browser, navigates to the URL, and returns a screenshot. No authentication required.

You can also verify the package is available:

```bash
npx -y @playwright/mcp@latest --help
```

## Troubleshooting MCP

### Server Not Starting

**Symptoms:** Claude says the MCP server is unavailable, or tool calls hang indefinitely.

| Check | Command | Fix |
|-------|---------|-----|
| Node.js version | `node --version` | Must be >= 22.0.0 |
| npx available | `npx --version` | Comes with npm; reinstall Node.js if missing |
| Package resolvable | `npx -y @playwright/mcp@latest --help` | Check network; try `npm cache clean --force` |
| .mcp.json exists | `cat .mcp.json` | Re-run `npx sparq-assistant init` |
| Server entry present | `cat .mcp.json \| grep playwright` | Re-run `npx sparq-assistant update` |

For stdio servers (TestRail, Playwright), verify the command runs standalone:

```bash
# TestRail -- should print usage or start the server
npx -y @bun913/mcp-testrail

# Qase -- should print usage or start the server
npx -y @qase/mcp-server

# Playwright -- should print help
npx -y @playwright/mcp@latest --help
```

### Authentication Failures

**Symptoms:** "Unauthorized", "403 Forbidden", or "Invalid credentials" errors.

**Figma / Atlassian (OAuth):**
- Restart Claude Code to re-trigger the OAuth flow
- Revoke and re-authorize if the token expired
- Ensure your Atlassian account has access to the Jira project and Confluence space
- Ensure your Figma account has access to the design file

**TestRail (API key):**
- Verify variables are set: `echo $TESTRAIL_BASE_URL`
- Verify the API key is valid (not your password):
  ```bash
  curl -s -u "${TESTRAIL_USERNAME}:${TESTRAIL_API_KEY}" \
    "${TESTRAIL_BASE_URL}/index.php?/api/v2/get_projects"
  ```
- Regenerate the key if it was rotated: TestRail > My Settings > API Keys
- Ensure your TestRail user has API access enabled (admin setting)

**Qase (API token):**
- Verify token is set: `echo $QASE_API_TOKEN`
- Regenerate the token if expired: Qase > Workspace Settings > API tokens
- Ensure the token has read/write access to the target project

### Timeout Issues

**Symptoms:** Tool calls hang for 30+ seconds then fail.

- **Network/firewall:** HTTP servers (Figma, Atlassian) require outbound HTTPS. Check `curl -I https://mcp.figma.com/mcp` and `curl -I https://mcp.atlassian.com/v1/mcp`.
- **VPN:** Some corporate VPNs block MCP endpoints. Try disconnecting VPN.
- **Proxy:** If behind a proxy, set `HTTPS_PROXY` in your environment.
- **Playwright:** First run downloads Chromium (~150 MB). Run `npx playwright install chromium` to pre-install.

### "Tool Not Found" Errors

**Symptoms:** Claude says it cannot find a tool like `mcp__atlassian__jira_get_issue`.

- **Server name mismatch:** The server key in `.mcp.json` must match what Claude Code expects. Verify with `cat .mcp.json` -- keys should be `atlassian`, `figma`, `testrail`, `playwright` (lowercase, no prefix).
- **Server not running:** Restart Claude Code. MCP servers are started when Claude Code launches.
- **Stale config:** Run `npx sparq-assistant update` to re-merge MCP configs, then restart Claude Code.
- **Wrong .mcp.json location:** The file must be in your project root (same directory as `sparq.config.json`).

## Configuration Reference

`sparq.config.json` is generated during `init`. Full field reference:

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Schema version (auto-set, e.g., `"1.0.0"`) |
| **project** | | |
| `project.testDir` | string | E2E test directory (default: `"e2e"`) |
| `project.sourceRoot` | string | Application source root (auto-detected, e.g., `"src"`) |
| `project.routeDiscoveryPattern` | string | Glob for route files (auto-detected, e.g., `"**/router/**/*.ts"`) |
| `project.componentFileExtensions` | string[] | Component file extensions (auto-detected, e.g., `[".vue"]`, `[".tsx", ".jsx"]`) |
| **sources** | | |
| `sources.jira.enabled` | boolean | Query Jira MCP |
| `sources.jira.projectKey` | string | Default Jira project key |
| `sources.confluence.enabled` | boolean | Query Confluence MCP |
| `sources.confluence.spaceKey` | string | Default Confluence space |
| `sources.figma.enabled` | boolean | Query Figma MCP |
| `sources.local.enabled` | boolean | Scan local spec files |
| `sources.local.requirementsDir` | string | Local specs directory |
| **inputs** | | |
| `inputs.tms.provider` | string \| null | TMS read source: `"testrail"`, `"qase"`, or `null` |
| `inputs.tms.testrail.projectId` | number \| null | TestRail project ID (required when provider is "testrail") |
| `inputs.tms.testrail.suiteId` | number \| null | TestRail suite ID (required when provider is "testrail") |
| `inputs.tms.testrail.sectionId` | number \| null | Optional TestRail section filter |
| `inputs.tms.qase.projectCode` | string \| null | Qase project code (required when provider is "qase") |
| `inputs.tms.qase.suiteId` | number \| null | Optional Qase suite filter |
| **outputs** | | |
| `outputs.testCases.format` | string | `"markdown"`, `"xml"`, or `"both"` |
| `outputs.testCases.outputDir` | string | Test case output path |
| `outputs.automation.framework` | string | `"playwright"` or `"cypress"` |
| `outputs.tms.provider` | string \| null | Active TMS provider: `"testrail"`, `"qase"`, `"local"`, or `null` |
| `outputs.tms.testrail.projectId` | number \| null | TestRail project ID |
| `outputs.tms.testrail.suiteId` | number \| null | TestRail suite ID |
| `outputs.tms.qase.projectCode` | string \| null | Qase project code |
| `outputs.tms.local.outputDir` | string | Local export directory (default: `.sparq/tms-export`) |
| `outputs.tms.local.format` | string | Local export format: `"json"` or `"markdown"` |
| `outputs.jira.enabled` | boolean | Enable Jira export (coverage comments and labels are always added when enabled) |
| `outputs.jira.createSubTask` | boolean | Create QA sub-task with test checklist |
| `outputs.confluence.enabled` | boolean | Confluence export available |
| `outputs.confluence.spaceKey` | string \| null | Override space key for export (falls back to `sources.confluence.spaceKey`) |
| `outputs.confluence.parentPageTitle` | string \| null | Parent page for QA test plan pages |
| **e2e** | | |
| `e2e.detected` | boolean | Whether E2E infrastructure was found |
| `e2e.framework` | string | Detected framework: `"playwright"`, `"cypress"`, or `"none"` |
| `e2e.structure.pages` | string | Path to page objects directory |
| `e2e.structure.components` | string | Path to components directory |
| `e2e.structure.steps` | string | Path to step helpers directory |
| `e2e.structure.fixtures` | string | Path to fixtures directory |
| `e2e.structure.specs` | string | Path to specs directory |
| `e2e.baseClass` | string | Path to abstract page class |
| `e2e.configFile` | string \| null | Detected config file (e.g., `playwright.config.ts` or `cypress.config.ts`) |
| `e2e.fixtureIndex` | string | Path to fixture index file |
| **refresh** | | |
| `refresh.preserveDeprecated` | boolean | Keep deprecated test markers (default: true) |
| `refresh.autoApplyLowSeverity` | boolean | Auto-apply low-severity changes without review |
| **preferences** | | |
| `preferences.interactiveMode` | boolean | Enable checkpoints (default: true) |
| `preferences.locatorPriority` | string[] | Selector strategy order (framework-aware: Playwright or Cypress locators) |
| `preferences.testMultiplier` | number | Test count multiplier (1-20, default: 5) |
| `preferences.maxClarifications` | number | Max clarification turns before execution (1-5, default: 2) |
| `preferences.checkpointLevel` | string | Checkpoint verbosity: `"full"`, `"standard"`, or `"fast"` (default: `"full"`) |
| `preferences.smokeVerify` | string | Smoke verification depth: `"list"`, `"typecheck"`, or `"run-subset"` (default: `"list"`) |
| `preferences.modelTier` | string | Agent model tier: `"premium"`, `"balanced"`, or `"economy"` (default: `"premium"`) |

## Upgrading

```bash
npx sparq-assistant update
```

Overwrites agent, skill, and template files but preserves:
- `sparq.config.json`
- `.mcp.json` (additive merge only)
- Custom modifications outside `.claude/agents/` and `.claude/skills/`


Your `sparq.config.json` values are preserved -- only structural changes are applied. Run `npx sparq-assistant doctor` after updating to verify.

## CI/CD Usage

SparQ can run in non-interactive mode for CI pipelines. It also generates CI workflow templates for running Playwright tests.

### CI Workflow Templates

Generate a CI workflow for your provider:

```bash
npx sparq-assistant init --ci-provider=github   # .github/workflows/e2e.yml
npx sparq-assistant init --ci-provider=gitlab   # .gitlab-ci.yml
npx sparq-assistant init --ci-provider=azure    # azure-pipelines-e2e.yml
```

Templates are pre-configured with your project's test directory and Node.js version. They will not overwrite existing workflow files.

### Non-Interactive Init

```bash
npx sparq-assistant init --non-interactive
```

Uses safe local-first defaults. Edit `sparq.config.json` manually afterward. No MCP OAuth prompts will appear (configure MCP servers separately for CI environments).

### Environment Variables for CI

Set MCP credentials as CI secrets:

```yaml
env:
  TESTRAIL_BASE_URL: ${{ secrets.TESTRAIL_BASE_URL }}
  TESTRAIL_USERNAME: ${{ secrets.TESTRAIL_USERNAME }}
  TESTRAIL_API_KEY: ${{ secrets.TESTRAIL_API_KEY }}
  QASE_API_TOKEN: ${{ secrets.QASE_API_TOKEN }}
```

### Doctor Exit Codes

`npx sparq-assistant doctor` returns structured exit codes for CI:

| Exit Code | Meaning |
|-----------|---------|
| `0` | All checks passed |
| `1` | One or more checks failed (missing agents, broken config, etc.) |

Use in CI pipelines to gate test generation steps:

```bash
npx sparq-assistant doctor || exit 1
```

## Dry Run Mode

Preview what `init` or `update` will do without writing any files:

```bash
npx sparq-assistant init --dry-run
npx sparq-assistant update --dry-run
```

Sample output:

```
[dry-run] Would create: .claude/agents/sparq-orchestrator.md
[dry-run] Would create: .claude/agents/sparq-requirements-analyst.md
[dry-run] Would create: .claude/agents/sparq-manual-test-writer.md
[dry-run] Would create: .claude/agents/sparq-automation-engineer.md
[dry-run] Would create: .claude/agents/sparq-test-validator.md
[dry-run] Would create: .claude/skills/sparq-analyze/SKILL.md
[dry-run] Would create: .claude/skills/sparq-generate/SKILL.md
[dry-run] Would create: .claude/skills/sparq-generate-manual/SKILL.md
[dry-run] Would create: .claude/skills/sparq-manual-to-e2e/SKILL.md
[dry-run] Would create: .claude/skills/sparq-generate-e2e/SKILL.md
[dry-run] Would create: .claude/skills/sparq-sync/SKILL.md
[dry-run] Would create: .claude/skills/sparq-export/SKILL.md
[dry-run] Would create: .claude/skills/sparq-resume/SKILL.md
[dry-run] Would create: .claude/skills/sparq-init/SKILL.md
[dry-run] Would create: .claude/skills/sparq-regression/SKILL.md
[dry-run] Would create: .claude/skills/sparq-refactor/SKILL.md
[dry-run] Would create: .claude/skills/sparq-shared/references/ (36 files)
[dry-run] Would create: .claude/templates/ (11 files)
[dry-run] Would merge into: .mcp.json (adding: atlassian, figma, playwright, testrail, qase)
[dry-run] Would create: sparq.config.json
[dry-run] Would append to: CLAUDE.md
[dry-run] Would append to: .gitignore
[dry-run] No files were modified.
```

## FAQ

### Does SparQ work with React, Angular, or Svelte?

Yes. SparQ auto-detects your framework from `package.json` during `npx sparq-assistant init`. Manual test generation (Scenario 1) is fully framework-agnostic. Automated test generation (Scenarios 2, 3, 4) produces Playwright code that works with any framework. Selector strategies and import patterns adapt to your detected tech stack.

### Does SparQ support Cypress?

Yes. Cypress is detected during `npx sparq-assistant init` and recorded in `sparq.config.json` as `e2e.framework: "cypress"`. **Code generation (Scenarios 2, 3, 4, 6) fully supports both Playwright and Cypress.** SparQ adapts selector strategies, import patterns, and smoke verification commands to your detected framework. Manual test generation (Scenario 1) is fully framework-agnostic.

### What happens if I run `init` twice?

Running `init` again is safe. SparQ checks for existing files and prompts before overwriting any that have been modified. Unmodified files are updated silently. Your `sparq.config.json` is preserved.

### Does SparQ support monorepos?

SparQ operates on a single project root at a time. For monorepos, run `npx sparq-assistant init` from each package that has its own `e2e/` directory. Each package gets its own `sparq.config.json`.

### Can I customize the templates?

Templates in `.claude/templates/` can be modified. Running `npx sparq-assistant update` will detect modifications (via checksums) and prompt before overwriting. Back up customized templates before updating.

### Can I re-run a single scenario step?

Yes. Skills are independent entry points. Run `/sparq:analyze` to re-gather requirements, `/sparq:generate-manual` to regenerate test cases, or `/sparq:manual-to-e2e` to re-convert. Each skill reads the latest artifacts from `.sparq/`.

### Does SparQ modify my existing tests?

Scenarios 2, 3, and 5 write E2E test code directly to your project's `e2e/` directory (per `e2e.structure.*` config), after explicit user approval at the checkpoint. Scenario 4 (`/sparq:sync`) may also modify existing test files after approval. Use `git diff` to review all changes.

### How do I add a new MCP server after init?

Run `npx sparq-assistant update` to re-merge MCP configs, or manually add the server entry to `.mcp.json`. Then restart Claude Code.

### What if a Jira ticket has no acceptance criteria?

SparQ falls back to the ticket description, linked Confluence pages, and Figma designs. If no structured requirements are found from any source, it prompts you to provide them as text.

## Troubleshooting

### Doctor Checks

```bash
npx sparq-assistant doctor
```

- **Agent files** -- all `.md` definitions exist in `.claude/agents/`
- **Skill directories** -- all skill folders in `.claude/skills/`
- **MCP servers** -- `.mcp.json` has `atlassian`, `figma`, `playwright`, `testrail`, `qase` entries (per enabled features)
- **Config file** -- `sparq.config.json` exists and is valid JSON
- **e2e structure** -- `e2e/` exists and `e2e.detected` is populated
- **Project settings** -- `project.sourceRoot`, `project.componentFileExtensions` populated from detection
- **Gitignore** -- `.gitignore` includes `.sparq/`

### Common Issues

| Issue | Fix |
|-------|-----|
| MCP server not connecting | Restart Claude Code to re-trigger OAuth |
| "Agent missing" in doctor | Run `npx sparq-assistant update` |
| `.sparq/` files in git | Add `.sparq/` to `.gitignore` |
| TestRail export fails | Set `TESTRAIL_BASE_URL`, `TESTRAIL_USERNAME`, `TESTRAIL_API_KEY` |
| Qase export fails | Set `QASE_API_TOKEN` |
| "No requirements found" | Provide requirements as text or local file path |
| Config parse error | Re-run `init` or fix JSON manually |

## Uninstalling

```bash
npx sparq-assistant uninstall
```

Removes all SparQ agent, skill, template files, config, and `.sparq/` output. Also cleans up the SparQ block in `CLAUDE.md`, MCP server entries in `.mcp.json`, and the `.sparq/` line in `.gitignore`. All files and configuration entries are cleaned up automatically.

## Publishing Recommendation

If publishing this project as an npm package, ensure `docs/` and `examples/` are included for users. Add the following to your `package.json` `files` array:

```json
{
  "files": [
    "docs/",
    "examples/",
    "CHANGELOG.md"
  ]
}
```

> **Note:** `package.json` is not managed by the documentation team. Coordinate with the CLI team for changes.

---

**Next**: Read [DAILY-USAGE.md](DAILY-USAGE.md) to learn common workflows and best practices.
