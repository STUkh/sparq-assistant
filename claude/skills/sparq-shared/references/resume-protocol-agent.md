# Resume Protocol — Sub-Agent Reference

Minimal resume awareness for sub-agents dispatched by the orchestrator. Full state machine and recovery logic are in `resume-protocol.md` (orchestrator-only).

## Config Snapshot

Read frozen config from `.sparq/state/config-snapshot.json` when available.
Fallback: config summary embedded in dispatch prompt.

Key fields: `configSummary` (project name, source root, test dir, framework, enabled sources, E2E structure, locator priority, checkpoint level) and `e2eSummary` (existing pages, components, steps, fixtures, specs, auth pattern).

## Write Prohibition

Sub-agents NEVER write to `.sparq/state/`. All state files are orchestrator-exclusive.
Parallel Task agents read `config-snapshot.json` as Tier 3 (read-only).
