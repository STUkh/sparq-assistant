# Error Handling Reference

Error categories, retry protocol, and recovery steps. Referenced by: orchestrator, all skills. Full fallback details in `degradation-strategy.md`.

## Enforcement Model

<enforcement_model>
**Where error handling runs**: Error handling logic executes in AGENT REASONING, not in CLI code.

- **Agents implement**: Retry loops, circuit breaker state tracking, fallback selection, gap reporting, progress signals. Agents follow the pseudocode patterns in `degradation-strategy.md` during their reasoning.
- **CLI enforces**: Config validation (`schema.mjs`), file structure (`constants.mjs` output dirs), syntax checking (`node --check`). CLI has no runtime involvement in MCP error handling.
- **Eval rubrics verify**: Post-hoc checks that agent outputs demonstrate correct error handling. The `error-handling-compliance` rubric scores agent outputs for retry signals, gap reporting, fallback documentation, and status accuracy.

Error handling compliance is a **soft guarantee** — agents are instructed to follow the protocol, and evals verify they did. It is NOT a hard guarantee like CLI schema validation.
</enforcement_model>

<error_categories>
- **Recoverable** (MCP timeout, format error): auto-retry per retry protocol, then fallback
- **Blocking** (missing config, no reqs found, codebase insufficient for E2E): pause workflow, present user choices per `codebase-readiness.md`, wait for input
- **Critical** (invalid project structure, no test targets, empty source root): HALT ALL, immediate user alert
- **Ambiguous** (unclear scope, conflicting reqs): pause, ask user to clarify
</error_categories>

For retry/fallback protocol, see `degradation-strategy.md`.

<recovery_steps>
1. Agent fails -> retry per protocol above
2. MCP unavailable -> degrade gracefully per `degradation-strategy.md`
3. Output incomplete -> re-run agent with narrower scope
4. Full abort -> clean up `.sparq/parallel/` working files if applicable; for E2E files written to project directory, suggest `git checkout -- {files}` to revert; document state in execution plan
5. Git rollback -> if agent fails after writing files directly to project, orchestrator can revert using `git checkout {baseline} -- {file}` for tracked files, or `rm` for new untracked files
6. State file corrupted -> reconstruct from `journal.jsonl` (scan backward for latest events). If journal also corrupted -> fall back to legacy `execution-plan.md` parsing. If nothing recoverable -> recommend fresh start. See `resume-protocol.md` `<corruption_recovery>`.
</recovery_steps>

<user_facing_error_messages>
When presenting errors to users, ALWAYS use plain language that explains impact and offers next steps. Never expose raw MCP tool names, HTTP status codes, or agent internal names.

MCP connection errors — explain what the connection does, then offer fallback:
- Jira unavailable: "Jira connection unavailable (reads requirements from your tickets). Fallback: paste the ticket requirements here, or provide a local file."
- Confluence unavailable: "Confluence connection unavailable (reads specifications from your pages). Proceeding without Confluence data — coverage may have gaps."
- Figma unavailable: "Figma connection unavailable (reads UI designs for selectors). Falling back to scanning your codebase for data-testid attributes."
- Playwright CLI unavailable: "Playwright not installed (used for browser verification). Relying on codebase analysis only — install with `npm i -D @playwright/test && npx playwright install`."
- TestRail/Qase unavailable: "Test management connection unavailable. Export skipped — results saved locally at .sparq/test-cases/."

General error patterns:
- Instead of "MCP timeout on mcp__atlassian__jira_get_issue" → "Jira is taking too long to respond. Retrying... (attempt 2/3)"
- Instead of "401 Unauthorized" → "Jira authentication failed. Check your API token in .mcp.json."
- Instead of "Agent handoff validation failed" → "Test generation encountered an issue. Retrying with a narrower scope."
- Instead of "Token budget exceeded at 152K" → "This feature has a lot of requirements. Consider splitting into smaller features for best results."
</user_facing_error_messages>

<s5_errors>
- **No registry entry**: Test file has no entry in `.sparq/tracking/test-registry.json`. Fallback: coverage matrix → title matching → treat all requirements as NEW. After first refresh, test gets registered.
- **Registry file missing**: `.sparq/tracking/test-registry.json` does not exist. Initialize empty registry, treat all requirements as NEW.
- **Ambiguous traceability**: Multiple tests claim same REQ-ID with conflicting assertions. Flag as conflict, present to user for resolution.
- **Requirement source unavailable**: Same degradation as S1/S3 Phase 1 (ask user for text or local file).
- **Hash mismatch without content change**: Requirements hash differs but diff shows no NEW/CHANGED/REMOVED items (e.g., formatting-only change). Report "No functional changes detected" and update hash without modifying tests.
- **Target test file modified during refresh**: Re-read file, re-diff, re-apply. If conflict persists, present both versions.
- **Corrupted registry JSON**: If `.sparq/tracking/test-registry.json` fails to parse, backup corrupted file to `.sparq/tracking/test-registry.json.bak`, reinitialize with `{"version":"1.0","lastUpdated":null,"entries":[]}`, treat all requirements as NEW.
- **Stale registry entries**: If registry references test files that no longer exist on disk, prune those entries during S5 Phase 1. Log: `[sparq] P1 Warning: Pruned {N} stale registry entries (files not found)`.
</s5_errors>

<codebase_readiness_errors>
- **Source root missing/empty**: `project.sourceRoot` absent or zero files. Critical. Present user choices per `codebase-readiness.md`.
- **Zero components**: No files matching `project.componentFileExtensions` in source root. Critical.
- **Zero selectors**: No `data-testid` AND no semantic locators (`aria-label`, `role=`) found. Blocking. Test-first mode generates `TODO-` placeholder selectors.
- **Requirements-codebase mismatch**: >50% of requirement pages/features unmatched in source. Blocking. User decides: placeholders, provide context, S1-only, or defer.
- **Partial mismatch**: Some requirement elements unmatched. Warning. Proceed with gaps in handoff `gaps[]` using `[SRC-CB]` label.
</codebase_readiness_errors>

<merge_validation>
Before applying merged artifacts from parallel Task agents:
1. **Handoff presence**: every expected `taskIndex` (1..`totalTasks`) has a handoff file
2. **JSON validity**: all `.partial.json` files parse without errors. If corrupted: skip that batch's registry entries, log gap
3. **File references**: barrel `.additions` export lines reference files that exist on disk
4. **ID collisions**: no duplicate TC/VF IDs across batches (should be impossible with pre-assigned ranges, but validate)
5. **Tier 1 conflicts**: no two batches wrote to the same file path (check `filesWritten` across handoffs)

**On failure**: log which check failed, skip the offending batch's contribution to the merged artifact, document gap. Never fail the entire merge — partial merge is better than no merge.
</merge_validation>

<parallel_errors>
- **Task spawn failure**: Fall back to sequential for that work unit. Log: `parallel_degraded: Task spawn failed`
- **Partial completion** (N-1 of N tasks succeed):
  1. Merge all completed results immediately — never block successful tasks
  2. Emit signal: `[sparq] {phase} Parallel [{completed}/{total}]: {failed-task} FAILED — {error summary}`
  3. Retry the failed task once sequentially with full context from completed tasks
  4. If retry fails: document gap in execution plan, present partial results at checkpoint with clear gap notation
  5. User decides: accept partial results, retry manually, or abort
- **ID collision in merge**: Re-number later batch's IDs. Log warning. Prevention: always pre-assign non-overlapping ID ranges before dispatch.
- **Concurrent file write**: Keep later-written version, log conflict. Prevention: enforce file isolation per `parallel-execution.md`.
</parallel_errors>
