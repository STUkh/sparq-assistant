# Progress Protocol Reference

User-visible progress signals for pipeline visibility between checkpoints. Referenced by: orchestrator, all sub-agents.

<signal_format>
All progress signals use this format:

`[sparq] {phase} {message}`

- Prefix: always `[sparq]`
- Phase tag: `Phase {N}/{total}` for phase boundaries | `P0.5` | `P1.5` | `--` (cross-cutting)
- Message: concise description with counts where applicable

Rules:
- One signal per milestone, not per item -- a 60-test pipeline should produce ~15-20 signals total
- Include counts when available (requirements, tests, sources, files)
- Include status/outcome for completion signals
- Include position context in X/Y format where applicable (e.g., "Source 1/3", "Category 2/5")
- No emoji -- plain text only
- When emitting progress signals that mention test categories, use full names at first mention: "Happy Path (HP)", "Validation & Error (VE)", "Security (SEC)", "Edge Case (EC)", "Accessibility (A11Y)". Subsequent mentions may use abbreviations only.
- Phase boundary signals are MANDATORY
- Agent milestone signals are RECOMMENDED (minimum 1 per 30s of work)
- Error/fallback signals are MANDATORY when degradation occurs
- Checkpoint preview signals are MANDATORY before every checkpoint
- NEVER use scenario codes (S1-S6) in user-facing signals -- use human-readable descriptions instead
</signal_format>

<signal_types>

## Phase Boundary (orchestrator only, MANDATORY)

Emitted when a phase starts or finishes. Use human-readable workflow descriptions, never S-codes.

- Start: `[sparq] Phase {N}/{total}: {description}...`
- Complete: `[sparq] Phase {N}/{total} complete: {summary with counts}`
- Classification: `[sparq] Plan: {human-readable workflow} for "{feature}" (from {source})`
- Workflow end: `[sparq] Workflow complete: {human-readable workflow}, {N tests}, {N artifacts}`

Human-readable workflow names (never show S-codes to users):
- S1 → "Generate manual test cases"
- S1+S2 → "Generate manual test cases + E2E tests"
- S2 → "Convert manual tests to E2E tests"
- S3 → "Generate E2E tests"
- S4 → "Validate existing tests for UI drift"
- S5 → "Sync tests with updated requirements"
- S6 → "Create regression test for bug fix"

## Agent Milestone (all agents, RECOMMENDED)

Emitted at significant internal milestones. Do NOT emit per-item (per-requirement, per-test-case). Include X/Y position counters where applicable.

- Source fetch: `[sparq]   Source {N}/{total}: {source} -- {summary}`
- Consolidation: `[sparq]   Requirements consolidated: {N} requirements from {N} sources`
- Category complete: `[sparq]   Category {N}/5: {name} -- {N} test cases`
- Code generated: `[sparq]   Generated: {N} page objects, {N} step classes, {N} spec files`
- Verification: `[sparq]   Smoke verification: {command} {PASSED|FAILED}`

## Parallel Status (orchestrator only, MANDATORY when parallel)

Emitted for parallel task lifecycle.

- Dispatch: `[sparq] {phase} Parallel dispatch: {N} {type} agents ({assignment details})`
- Per-task: `[sparq] {phase} Parallel [{completed}/{total}]: {task-id} complete -- {summary}`
- Merge: `[sparq] {phase} Parallel merge: {N} batches merged -- {summary}`
- Dual-agent: `[sparq] {phase} Dual [{completed}/2]: {agent} complete -- {summary}`

## Error/Fallback (all agents, MANDATORY)

Emitted when recoverable errors or fallbacks occur.

- Retry: `[sparq] {phase} Retry: {source} {error} -- backoff {duration}, attempt {N}/{max}`
- Fallback: `[sparq] {phase} Fallback: {source} {reason} -- {fallback action}`
- Warning: `[sparq] {phase} Warning: {description}`

## Checkpoint Preview (orchestrator only, MANDATORY)

Emitted immediately before presenting the checkpoint template.

- Format: `[sparq] {phase} Checkpoint preview: {key metrics summary}`

## Resume/Recovery (orchestrator only, MANDATORY when resuming)

Emitted during workflow resume from interrupted state.

- Resume detected: `[sparq] -- Resume detected: last completed {phase}, interrupted {reason}`
- Staleness check: `[sparq] -- Resume staleness: {age} since interruption, config {matched|changed}`
- Resume started: `[sparq] -- Resuming from {phase}: loading handoff from {path}`
- Resume skipped: `[sparq] -- Fresh start: {reason}`

## Browser Preview (all agents, OPTIONAL)

Emitted when Playwright MCP captures a screenshot for user context.

- Preview: `[sparq] {phase} Preview: {page description} -- screenshot captured`

</signal_types>

<phase_summaries>

## Phase Summary (orchestrator only, MANDATORY)

After each phase completes, orchestrator MUST emit a structured phase summary signal before proceeding. Provides progress visibility during long workflows.

### Format

```
[sparq] === Phase {N}/{total} Complete: {phase name} ===
[sparq]   {key metric 1}: {value}
[sparq]   {key metric 2}: {value}
[sparq]   Next: {next phase name}
```

Rules:
- Emit exactly one phase summary after each phase completes (after handoff received, before next phase starts)
- Include 2-3 key metrics from the agent handoff `report.counts`
- Always include `Next:` line (except for the final phase, which uses `Done.`)
- Phase names use human-readable descriptions (never S-codes)

### Phase Summary Templates Per Scenario

**S1+S2 (Generate manual + E2E tests) -- 4 phases**
- `[1/4] Requirements`: reqs count, source count, open questions
- `[2/4] Manual Tests`: test case count, category count, coverage percentage
- `[3/4] E2E Code`: spec files, page objects, step classes
- `[4/4] Verification`: smoke result, files created, coverage percentage

**S1 (Generate manual test cases) -- 3 phases**
- `[1/3] Requirements`: reqs count, source count, open questions
- `[2/3] Manual Tests`: test case count, category count, coverage percentage
- `[3/3] Review`: files created, coverage percentage, export status

**S3 (Generate E2E tests) -- 3 phases**
- `[1/3] Requirements`: reqs count, source count, open questions
- `[2/3] E2E Code`: spec files, page objects, step classes
- `[3/3] Verification`: smoke result, files created, coverage percentage

**S4 (Validate existing tests) -- 2 phases**
- `[1/2] Scan Tests`: files scanned, findings count, severity breakdown
- `[2/2] Report & Fix`: fixes applied, remaining warnings, smoke result

**S5 (Sync tests with requirements) -- 3 phases**
- `[1/3] Gather Current`: reqs count (new/changed/removed/unchanged), test files parsed
- `[2/3] Diff Analysis`: changes to apply, affected test files, severity breakdown
- `[3/3] Apply Updates`: tests updated, new tests, deprecated tests, smoke result

**S6 (Create regression test) -- 2 phases**
- `[1/2] Parse Bug`: repro steps extracted, affected component, existing page objects found
- `[2/2] Generate Regression`: spec file path, assertions count, smoke result

</phase_summaries>

<milestone_catalog>

### sparq-orchestrator
- Classification: human-readable workflow plan (never S-codes)
- P0.5: Start and complete project discovery (with infrastructure summary and codebase readiness)
- Phase N/total: Phase start (with description and estimate) and phase complete (with counts)
- Phase summary: structured `=== Phase N/total Complete ===` signal after each phase (see `<phase_summaries>`)
- P1.5: Start and complete diff analysis (with change category counts)
- Parallel: dispatch, per-task completion (N/total), merge
- Pre-checkpoint: preview before each checkpoint
- Workflow: complete with final summary and next-step suggestions
- Resume: detection, staleness check, resume/fresh-start decision
- Post-workflow: run summary with files, coverage, and next steps

### sparq-requirements-analyst
- Per-source fetch: one signal per source with position (Source 1/3: Jira, Source 2/3: Confluence)
- Consolidation: after merging and deduplicating across sources
- Gap detection: when >2 open questions or missing criteria found
- S5: Previous requirements snapshot saved before overwrite

### sparq-manual-test-writer
- Per-category complete: with position (Category 1/5: Happy Path, Category 2/5: Validation & Error)
- Coverage matrix: after generation with coverage percentage
- S5 refresh summary: counts of new/updated/deprecated tests

### sparq-automation-engineer
- Convention confirmation: after reading project patterns
- Code generation: after generating pages, steps, specs (with counts)
- Smoke verification: pass/fail result of test listing or type check
- Selector coverage: matched/total ratio for requirement elements vs codebase selectors
- S5 refresh summary: counts of new/updated/deprecated tests

### sparq-test-validator
- File inventory: after cataloging test files with counts
- Per-check category: with position (Check 1/6: Selectors, Check 2/6: Flow)
- Validation summary: total findings with severity breakdown
- S5 traceability: after extracting test-to-requirement map

</milestone_catalog>

<parallel_progress_rules>
Parallel Task agents have NO access to the parent conversation and cannot output signals directly to the user. The orchestrator handles all parallel progress:

1. Before dispatch: emit parallel dispatch signal with task count and assignment details
2. After each task completes: read handoff `report.counts`, emit per-task progress signal
3. After all tasks complete: emit merge signal with combined counts
4. On task failure: emit warning, retry sequentially, report outcome

Task agents MAY write milestone notes into their handoff `instructions` field. The orchestrator extracts these for richer per-task progress reporting.
</parallel_progress_rules>

<integration_with_existing>
### Event Logging
Progress signals (user-visible output) and event log entries (`execution-plan.md` audit trail) coexist. Phase boundary signals require corresponding event log entries; agent milestone signals do not.

### Checkpoints
Checkpoint preview signal emitted BEFORE checkpoint template is presented.

### Execution Plan
Execution plan is the durable state record; progress signals are the ephemeral user-facing projection.
</integration_with_existing>

<budget_signals>
## Budget Signals (orchestrator only, CONDITIONAL)

Emitted when orchestrator estimates accumulated context exceeds thresholds.

- Info: `[sparq] -- Budget info: ~{N}K tokens consumed, ~{M}K remaining`
- Warning: `[sparq] -- Budget warning: approaching limit (~{N}K consumed) -- recommend scope reduction`
- Limit: `[sparq] -- Budget limit: context near capacity (~{N}K) -- recommend fresh conversation for chain`

Rules:
- Emit info signal when accumulated > 100K tokens
- Emit warning signal when accumulated > 120K tokens
- Emit limit signal when accumulated > 150K tokens
- Budget estimation: count phases completed, handoffs received, checkpoint interactions
</budget_signals>
