---
name: sparq:analyze
description: "Gather and consolidate requirements from Jira, Confluence, Figma, and local files. Use when: (1) analyzing a Jira ticket for testing, (2) extracting requirements from Confluence specs, (3) understanding UI flows from Figma designs, (4) preparing requirements for test generation. Triggers: Jira ticket ID, Confluence page URL, Figma link, or feature description."
audience: internal
---

# Analyze Requirements

Config and fallback per `claude/rules/skills.md` preamble. Only query sources where `enabled: true`.

## Workflow

1. Parse input -- determine source type (Jira ID, Confluence URL, Figma link, file path, or plain text)
2. Scan `{project.sourceRoot}` from config for existing types and route definitions relevant to the feature (informs selectors and URL patterns). Use `project.componentFileExtensions` to determine which file types to grep (e.g., `*.vue` for Vue, `*.tsx`/`*.jsx` for React, `*.svelte` for Svelte).
3. Delegate to `sparq-requirements-analyst` agent with delegation payload:
   - **Source type** and **identifiers** (ticket ID, URL, file path)
   - **Enabled sources** from config (`sources.jira.enabled`, `sources.confluence.enabled`, etc.)
   - **E2E infrastructure summary** from config `e2e` section (existing pages, components, fixtures)
   - **Tech stack context** from config:
     - `project.componentFileExtensions` (for grep patterns)
     - `project.sourceRoot` (for source scanning scope)
   - **Feature name** (derived from input or user-specified)
4. Consolidate into structured requirements doc
5. Write to `.sparq/requirements/REQ-{feature}.md` -- include E2E Infrastructure Summary (from config e2e section) so downstream agents know existing page objects/components

## Accepted Inputs

- **Jira ticket ID**: `EP-14`, `PROJ-200` (Jira MCP via `mcp__atlassian__jira_*`)
- **Confluence URL**: `https://team.atlassian.net/wiki/spaces/...` (Confluence MCP via `mcp__atlassian__confluence_*`)
- **Figma link**: `https://www.figma.com/design/...` (Figma MCP via `mcp__figma__*`)
- **Local file path**: `docs/specs/feature.md` (filesystem)
- **Plain text**: `"User login with MFA"` (used as-is)

Multiple inputs combinable: `/sparq:analyze EP-14 https://figma.com/design/...`

## Usage Modes

- **Standalone**: Run `/sparq:analyze EP-14` to review requirements before generating tests. Useful for requirements review, gap analysis, or preparing a spec for stakeholders.
- **Internal**: Called automatically by `/sparq:generate-manual` and `/sparq:generate-e2e` when no `.sparq/requirements/REQ-{feature}.md` exists -- no need to run separately in that case.

## Output

Write to `.sparq/requirements/REQ-{feature}.md` with sections:

1. **Sources** -- origin references with labels (SRC-J, SRC-C, SRC-F, SRC-L)
2. **User Journey** -- ordered user steps through the feature
3. **Requirements** -- structured requirements with IDs (`REQ-{feature}-{NNN}`)
4. **UI Elements** -- interactive elements with suggested selectors
5. **Edge Cases** -- boundary conditions, error scenarios, unusual inputs
6. **Open Questions** -- ambiguities requiring stakeholder clarification

## Fallback Behavior

When MCP sources are unavailable, degrade per `degradation-strategy.md`. Primary source fails: prompt user for text/file. Secondary sources: skip and continue. Never block entirely -- always produce output from available sources.

<done_criteria>
1. `sparq.config.json` read and validated; only sources with `enabled: true` are queried
2. All enabled requirement sources queried (Jira/Confluence/Figma/local) with fallback applied for any unavailable source per `degradation-strategy.md`
3. Requirements document written to `.sparq/requirements/REQ-{feature}.md` with unique `REQ-{feature}-{NNN}` IDs and source labels (SRC-J/C/F/L)
4. Every requirement entry contains at least one acceptance criterion
5. Open Questions section lists any ambiguities or coverage gaps identified during analysis
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/jira-patterns.md`, `confluence-patterns.md`, `figma-patterns.md`
- `.claude/skills/sparq-shared/references/config-schema.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`

## Example

```
/sparq:analyze EP-14
-> reads config, enables: jira, confluence, figma
-> fetches EP-14, finds linked Confluence page + Figma link
-> delegates to sparq-requirements-analyst with source type, identifiers, enabled sources
-> output: .sparq/requirements/REQ-login.md
```
