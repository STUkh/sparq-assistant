---
name: sparq:config
description: "View, edit, or validate SparQ configuration interactively. Use when: changing Jira project key, enabling/disabling integrations, adjusting checkpoint level, or troubleshooting config issues."
audience: qa
---

# SparQ Configuration Editor

Interactive config viewer and editor for `sparq.config.json`. Provides guided editing without requiring users to understand the JSON schema directly.

## Workflow

### Step 1: Load Config

1. Read `sparq.config.json` from project root
   - If missing: "No config found. Run `/sparq:init` to set up SparQ."
   - If invalid JSON: report parse error with line number, offer to fix

### Step 2: Present Options

```
SparQ Configuration

  Current settings:
    Project: {name from package.json} | Source root: {project.sourceRoot}
    E2E: {e2e.framework} | Test dir: {project.testDir}
    Sources: {enabled sources list}
    Exports: {enabled exports list}
    Checkpoints: {preferences.checkpointLevel}

  What would you like to change?
    1. Requirement sources (where to READ from)
       Jira: {enabled/disabled} | Confluence: {enabled/disabled} | Figma: {enabled/disabled} | Local: {enabled/disabled}
    2. Export targets (where to WRITE to)
       TMS: {provider or "none"} | Jira comments: {enabled/disabled} | Confluence: {enabled/disabled}
    3. Checkpoint verbosity ({current} → full/standard/fast)
    4. E2E settings (framework, test directory, structure paths)
    5. Validate current config
    6. Show full config (raw JSON)
    7. Reset to defaults (re-run auto-detection)
    8. Set up integrations (Jira, Confluence, Figma, TestRail, Qase)
```

### Step 3: Handle Selection

**Selection 1 — Requirement Sources**

Present each source with current status and simple toggle:
- "Jira is currently {enabled/disabled}. Project key: {key}. Change? (enable/disable/change key/skip)"
- "Confluence is currently {enabled/disabled}. Space key: {key}. Change? (enable/disable/change key/skip)"
- "Figma is currently {enabled/disabled}. Change? (enable/disable/skip)"
- "Local requirements directory: {path}. Change? (new path/disable/skip)"

Explain the distinction: "Sources are where SparQ READS requirements FROM (Jira tickets, Confluence pages, Figma designs, local files)."

**Selection 2 — Export Targets**

Present each export with current status:
- "TMS provider: {provider or none}. Change? (testrail/qase/local/none)"
  - If changing to TestRail: prompt for project ID and suite ID
  - If changing to Qase: prompt for project code
- "Jira export (add comments to tickets): {enabled/disabled}. Toggle?"
- "Confluence export (publish test plans): {enabled/disabled}. Toggle?"

Explain: "Exports are where SparQ WRITES test results TO (TestRail, Qase, Jira comments, Confluence pages)."

**Selection 3 — Checkpoint Verbosity**

Explain each option with recommended use cases:
- "**full** (default): All checkpoints with detailed output. Every phase transition requires approval. Best for: first time using SparQ, complex features, multiple sources."
- "**standard**: Skips Phase 1 (requirements) checkpoint when requirements are clean (no open questions, no gaps, no fallbacks). Still shows generation and final review. Best for: familiar users, straightforward tickets, single source."
- "**fast**: Auto-approves all intermediate checkpoints. Only shows the final review with complete run summary. Best for: routine generation, trusted pipeline, batch processing."

**Selection 4 — E2E Settings**

Show detected vs configured values. Allow path changes for `e2e.structure.*`.

**Selection 5 — Validate**

Run config validation against `config-schema.md`. Report issues with actionable fix suggestions.

**Selection 6 — Show Full Config**

Display raw `sparq.config.json` content.

**Selection 7 — Reset**

Re-run auto-detection from `package.json` and filesystem. Confirm before overwriting.

**Selection 8 — Integrations**

Present available integrations with current connection status:

"Which integrations would you like to set up? (select all that apply)"
  1. Jira — read requirements from tickets
     Status: {configured/not configured} | Project key: {key or "not set"}
  2. Confluence — read specification pages
     Status: {configured/not configured} | Space key: {key or "not set"}
  3. Figma — read UI designs for selectors
     Status: {configured/not configured}
  4. TestRail — export test cases
     Status: {configured/not configured} | Project ID: {id or "not set"}
  5. Qase — export test cases
     Status: {configured/not configured} | Project code: {code or "not set"}

For each selected integration, guide setup:

**Jira setup:**
1. "Jira project key (e.g., EP, PROJ):" — validate with regex `[A-Z][A-Z0-9_-]+`
2. Connection: "Jira connects via Anthropic's Atlassian MCP server (configured in `.mcp.json`). Run `npx sparq-assistant doctor --deep` to verify the connection."
3. Update `sources.jira.enabled: true` and `sources.jira.projectKey` in config

**Confluence setup:**
1. "Confluence space key (e.g., TEAM, DOCS):" — validate with regex `[A-Z][A-Z0-9]+`
2. Connection: "Confluence connects via the same Atlassian MCP server as Jira."
3. Update `sources.confluence.enabled: true` and `sources.confluence.spaceKey` in config

**Figma setup:**
1. Connection: "Figma connects via the Figma MCP server. Ensure `FIGMA_PERSONAL_ACCESS_TOKEN` is set in your environment."
2. "Test connection? (y/n)" — if yes, suggest running `npx sparq-assistant doctor --deep`
3. Update `sources.figma.enabled: true` in config

**TestRail setup:**
1. "TestRail project ID (numeric):" — validate as positive integer
2. "TestRail suite ID (numeric, optional):" — validate as positive integer or skip
3. Connection: "Set `TESTRAIL_API_KEY` in your environment before running SparQ workflows."
4. Update `outputs.tms.provider: "testrail"`, `outputs.tms.testrail.projectId`, `outputs.tms.testrail.suiteId` in config

**Qase setup:**
1. "Qase project code (e.g., PROJ):" — validate with regex `[A-Z][A-Z0-9-]+`
2. Connection: "Set `QASE_API_TOKEN` in your environment before running SparQ workflows."
3. Update `outputs.tms.provider: "qase"`, `outputs.tms.qase.projectCode` in config

After setup, show summary:
"Integration setup complete. Run `npx sparq-assistant doctor --deep` to verify all connections."

### Step 4: Apply Changes

1. Show diff of what will change (before/after)
2. Confirm: "Apply these changes? (y/n)"
3. Write updated `sparq.config.json`
4. Validate the updated config
5. Report: "Config updated. Changes will take effect on next SparQ workflow."

## Design Principles

- Always explain the distinction between sources (READ) and exports (WRITE)
- Show current values before asking for changes
- Validate after every change
- Never require users to edit JSON directly

<done_criteria>
1. Current config loaded and summarized in plain language
2. User selection handled with guided prompts (not raw JSON editing)
3. Source vs export distinction explained when relevant
4. Changes validated against config-schema.md before saving
5. Updated config written with confirmation
6. Integration setup guides user through MCP connection for selected providers
</done_criteria>

## Usage

```
/sparq:config
```

Examples:
- `"Configure SparQ settings"`
- `"Update Jira project key to PROJ"`
- `"Enable Confluence integration"`
- `"Change checkpoint level to fast"`

## References

- `.claude/skills/sparq-shared/references/config-schema.md` — full schema and defaults
