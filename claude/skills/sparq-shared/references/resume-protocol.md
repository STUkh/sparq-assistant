# Resume Protocol Reference

State persistence and recovery system for interrupted SparQ workflows. Enables precise resume from any interruption point — mid-phase, mid-parallel-dispatch, mid-merge, or between phases. Referenced by: orchestrator, resume skill, all sub-agents (read-only awareness).

## State Directory

<state_directory>
Location: `.sparq/state/`

- `current-task.json`: Active workflow position and status. Writer: orchestrator only. Readers: resume skill, orchestrator on restart.
- `config-snapshot.json`: Frozen config + E2E summary. Writer: orchestrator only. Readers: all agents, resume skill.
- `parallel.json`: Parallel dispatch manifest + merge progress. Writer: orchestrator only. Readers: resume skill, orchestrator.
- `journal.jsonl`: Chronological event log (append-only). Writer: orchestrator only. Readers: resume skill (fallback), debugging.

**Write authority**: ONLY the orchestrator writes to `.sparq/state/`. Sub-agents NEVER write. Parallel Task agents read `config-snapshot.json` (Tier 3 read-only).
</state_directory>

## Schemas

<schema name="current-task">
```typescript
interface CurrentTask {
  version: "1.0"
  workflowId: string
  scenario: "S1" | "S2" | "S3" | "S4" | "S5"
  feature: string
  autoChain: boolean
  chainPosition?: { chain: string[]; currentIndex: number }
  phase: "P0" | "P0.5" | "P1" | "P1.5" | "P2" | "P3"
  phaseStatus: PhaseStatus
  activeAgent?: string
  lastApprovedCheckpoint?: { phase: string; checkpointId: number; approvedAt: string }
  completedPhases: Array<{
    phase: string; completedAt: string; handoffPath: string
    status: "success" | "partial" | "failed"
  }>
  lastError?: {
    phase: string; category: "recoverable" | "blocking" | "critical"
    message: string; timestamp: string; retryCount: number
  }
  executionMode: "orchestrator_only" | "task_parallel" | "teammate_persistent"
  teammates?: Array<{
    name: string; role: string
    status: "active" | "idle" | "completed" | "failed" | "shutdown"
    assignedPhase?: string; lastMessageAt?: string
  }>
  startedAt: string
  updatedAt: string
  interruptedAt?: string
  reason?: "user_abort" | "error" | "timeout" | "session_end"
}

type PhaseStatus =
  | "starting"               // Phase begun, no agent dispatched yet
  | "agent_dispatched"       // Single agent dispatched, awaiting handoff
  | "parallel_dispatched"    // Multiple parallel tasks dispatched
  | "parallel_collecting"    // Some parallel tasks returned, others pending
  | "merging"                // Tier 2 merge in progress
  | "checkpoint_pending"     // Checkpoint presented, awaiting user decision
  | "checkpoint_approved"    // Checkpoint approved, phase wrapping up
  | "completing"             // Phase finalization in progress
  | "completed"              // Phase fully done
  | "failed"                 // Phase encountered unrecoverable error
```
</schema>

<schema name="config-snapshot">
```typescript
interface ConfigSnapshot {
  version: "1.0"
  workflowId: string
  capturedAt: string
  configHash: string
  configSummary: {
    projectName: string; sourceRoot: string; testDir: string
    enabledSources: string[]
    e2eFramework: string
    e2eStructure: { pages: string; components: string; steps: string; fixtures: string; specs: string }
    baseClass: string | null; fixtureIndex: string | null
    locatorPriority: string[]
    checkpointLevel: "full" | "standard" | "fast"
    smokeVerify: "list" | "typecheck" | "run-subset"
  }
  e2eSummary?: { detected: boolean; authPattern?: string; frameworkConfig?: string }
}
```
</schema>

<schema name="parallel-manifest">
```typescript
interface ParallelManifest {
  version: "1.0"
  workflowId: string
  phase: string
  pattern: "fan-out" | "batches" | "checks" | "dual-agent" | "exports" | "s5-dual"
  dispatchedAt: string
  tasks: Array<{
    taskId: string; taskIndex: number; agent: string; description: string
    featureOwnership?: string[]; idRange?: { prefix: string; start: number; end: number }
    status: "dispatched" | "completed" | "failed" | "retrying"
    handoffPath?: string; completedAt?: string; error?: string
    retryCount: number; teammateName?: string
  }>
  totalTasks: number; completedCount: number; failedCount: number
  merge: { status: "pending" | "in_progress" | "completed" | "failed"; startedAt?: string; completedAt?: string; steps: MergeStep[] }
}

type MergeStep = { name: string; status: "pending" | "completed" | "skipped" | "failed"; completedAt?: string; error?: string; details?: string }
```
</schema>

<schema name="journal-entry">
```typescript
interface JournalEntry { ts: string; workflowId: string; event: string; phase?: string; agent?: string; details: Record<string, unknown> }
```
Events: `workflow_start|complete|abort|resume`, `phase_start|complete|fail`, `agent_dispatch|handoff|error`, `parallel_dispatch|task_complete|task_fail|task_retry|merge_start|merge_step|merge_complete`, `checkpoint_present|approve|reject|auto_approve`, `error`, `retry`, `fallback`, `state_snapshot`, `config_snapshot`, `teammate_spawn|message|idle|shutdown`
</schema>

## Write Protocol

<write_protocol>
**Atomic writes**: Write state files to `{filename}.tmp`, then rename to `{filename}`. A crash mid-write leaves the previous valid state intact.

**Write timing** (orchestrator):
- `config-snapshot.json`: workflow start (once) + P0.5 complete (e2eSummary update)
- `current-task.json`: every state transition — phase start, agent dispatch, parallel dispatch, task completion, merge step, checkpoint present/approve, phase complete, error
- `parallel.json`: parallel dispatch (create), per-task completion, each merge step
- `journal.jsonl`: every event — append one JSON line terminated by `\n` (never read-modify-write)

**Journal append**: Each entry is a complete, self-contained JSON line. A partial write (crash mid-append) produces an incomplete last line, detectable on read (JSON.parse fails). Truncate the partial line on recovery.

**No concurrent writers**: The orchestrator is the sole writer for all state files. This invariant eliminates write conflicts by design.
</write_protocol>

## Resume Detection

<resume_detection>
### Algorithm

**Step 1 — Check state directory**:
- `.sparq/state/current-task.json` exists and parseable -> proceed to Step 2
- Exists but corrupted -> backup to `.bak`, try journal reconstruction (Step 1b)
- Missing -> try legacy detection (Step 1c)

**Step 1b — Journal reconstruction**:
- Read `.sparq/state/journal.jsonl` (last 50 lines)
- Find most recent `phase_complete` or `workflow_start` event
- Reconstruct minimal state: scenario, feature, last completed phase
- Warn: "State file corrupted. Reconstructed from journal."

**Step 1c — Legacy detection**:
- Check `.sparq/plans/execution-plan.md` for status "In Progress" or "Aborted"
- If found: extract `resumeState` section, load handoffs from `.sparq/plans/handoffs/`
- If not found: "No interrupted workflow found."
- Legacy mode supports phase-granularity resume only

**Step 2 — Validate staleness**:
- Compute SHA-256 of current `sparq.config.json`, compare with `config-snapshot.json` hash
- Age = now - `updatedAt` (or `interruptedAt`): <24h proceed, 24h-7d warn, >7d recommend fresh start
- Config mismatch: warn with changed field details

**Step 3 — Determine recovery point** (from `phaseStatus`):

- `starting` / `agent_dispatched` → `rerun_phase` — re-dispatch same agent
- `parallel_dispatched` / `parallel_collecting` → `resume_parallel` — re-dispatch only pending/failed tasks
- `merging` → `resume_merge` — continue from last completed merge step
- `checkpoint_pending` → `re_present_checkpoint` — reconstruct and re-present
- `checkpoint_approved` / `completing` / `completed` → `advance_to_next_phase` — load handoff, start next
- `failed` → `handle_failure` — present error, offer retry/skip/fresh-start

**Step 4 — Validate artifacts**: For each completed phase, verify handoff file exists and referenced artifacts are on disk. Report missing items.

**Step 5 — Present summary**: Scenario, feature, interruption point, recovery action, parallel/merge status, artifact integrity, staleness, config status. Offer: (A) Resume, (B) Fresh start, (C) View details.

**Step 6 — Execute recovery**: Dispatch orchestrator with `resumeMode`, `recoveryAction`, `recoveryDetails`, `configSnapshot`, `completedPhases`.
</resume_detection>

## Recovery Actions

<recovery_actions>
### rerun_phase
Re-dispatch the phase's assigned agent with full context from completed phases.
1. Read config-snapshot.json for config + E2E summary
2. Read handoffs from all completed phases
3. Update current-task.json: phaseStatus=starting
4. Dispatch agent, proceed normally

### resume_parallel
Skip completed tasks, re-dispatch only pending/failed.
1. Read parallel.json for full manifest
2. Verify completed task handoffs intact (file exists + artifacts on disk)
3. Re-dispatch ONLY tasks where status != "completed"
4. Update parallel.json: reset failed task status to "dispatched", increment retryCount
5. When all tasks complete: proceed to merge

### resume_merge
Continue merge from last completed step.
1. Read parallel.json for merge state
2. Skip steps with status "completed"
3. Execute from next pending step
4. Update parallel.json per step completion
5. On merge complete: proceed to checkpoint

### re_present_checkpoint
Reconstruct checkpoint from existing handoff data.
1. Read handoff from phase's handoff file
2. Rebuild checkpoint template from handoff counts, artifacts, gaps
3. Present to user
4. Wait for decision, proceed accordingly

### advance_to_next_phase
Phase completed but orchestrator didn't start the next one.
1. Load previous phase handoff
2. Compute next phase from scenario flow
3. Update current-task.json: advance phase, phaseStatus=starting
4. Dispatch next phase agent

### handle_failure
Present error with recovery options.
1. Show error details: phase, category, message
2. Offer: (A) Retry phase, (B) Skip to next phase, (C) Fresh start
3. On retry: clear lastError, rerun_phase
4. On skip: mark phase partial, advance_to_next_phase
</recovery_actions>

## Backward Compatibility

<backward_compatibility>
**Legacy state** (pre-state-persistence):
- `.sparq/plans/execution-plan.md` with `## Resume State` section
- `.sparq/plans/handoffs/*.json` files

**Detection**: If `.sparq/state/current-task.json` does not exist BUT `.sparq/plans/execution-plan.md` exists with status "In Progress":
1. Parse execution plan for `resumeState` section
2. Load handoffs from `.sparq/plans/handoffs/`
3. Construct minimal recovery context (phase-granularity only — no parallel/merge recovery)
4. After successful resume, create `.sparq/state/` files for future runs

**Migration**: First workflow run after upgrade creates `.sparq/state/` directory automatically. No manual migration needed.
</backward_compatibility>

## Cleanup Protocol

<cleanup_protocol>
**On successful completion**:
1. Update `current-task.json` phaseStatus to "completed"
2. Append journal: `workflow_complete`
3. Archive: move `.sparq/state/` contents to `.sparq/plans/archive/{timestamp}/state/`
4. Archive: move `.sparq/plans/handoffs/` to `.sparq/plans/archive/{timestamp}/handoffs/`
5. Verify `.sparq/parallel/` cleaned up (should be done during merge)

**On fresh start** (user chooses to restart):
1. Archive `.sparq/state/` and `.sparq/plans/` to `.sparq/plans/archive/{timestamp}/`
2. Create fresh `.sparq/state/` directory

**On abort**:
1. Set `current-task.json` interruptedAt and reason
2. Append journal: `workflow_abort`
3. Leave all files in place (enables future resume)

**Archive retention**: No automatic cleanup. Users manage `.sparq/plans/archive/` manually or via `npx sparq-assistant clean`.
</cleanup_protocol>

## Corruption Recovery

<corruption_recovery>
### Source Priority

When multiple state sources exist, resolve conflicts using this priority order:
1. `current-task.json` — primary state (highest priority for phase position and status)
2. `journal.jsonl` (latest matching event) — append-only log is authoritative for event history
3. `execution-plan.md` — legacy fallback (lowest priority, phase-granularity only)

**When journal event conflicts with state file**: journal wins. The journal is append-only and therefore authoritative — a state file may have been partially written or corrupted, but a complete journal entry was fully committed.

### Conflict Resolution Rules

- If `phaseStatus` in `current-task.json` says "completed" but no `phase_complete` or next-phase `agent_dispatch` event exists in journal: treat as "completing" and re-dispatch the next phase
- If `phaseStatus` says "agent_dispatched" but journal has a `agent_handoff` event for that agent: advance to the post-handoff state (checkpoint or next phase)

### Journal Event Validation

Minimum valid journal event must have these fields (entries missing any are discarded during recovery):
- `event`: string (one of the documented event types)
- `ts`: string (ISO 8601 timestamp)
- `workflowId`: string (must match the active workflow)

Entries with unknown `event` values are preserved but ignored during reconstruction. Entries with mismatched `workflowId` are skipped.

### Per-File Recovery

**current-task.json corrupted** (unparseable JSON):
1. Backup to `current-task.json.bak`
2. Reconstruct from `journal.jsonl`: scan backward for most recent state events
3. If journal also corrupted: fall back to legacy detection (`execution-plan.md`)
4. If nothing recoverable: report "State corrupted. Recommend fresh start."

**config-snapshot.json corrupted**:
1. Re-read current `sparq.config.json` and regenerate snapshot
2. Warn: "Config snapshot regenerated from current config. Changes since workflow start are lost."
3. If config-snapshot.json was regenerated from current config, warn user: "Config changed since workflow started. Results may differ from original run." Compare `configHash` if the old hash is recoverable from journal `config_snapshot` event.

**parallel.json corrupted**:
1. Scan `.sparq/plans/handoffs/{phase}-*.json` to reconstruct task completion status
2. If handoffs intact: rebuild parallel.json from handoff data
3. If handoffs missing: re-run entire parallel dispatch

**journal.jsonl corrupted** (incomplete last line):
1. Truncate last incomplete line
2. Validate remaining entries against minimum schema (`event`, `ts`, `workflowId` fields present)
3. Discard entries failing validation — log count of discarded entries
4. Journal is non-critical for resume — corruption only affects audit trail and conflict resolution fallback
</corruption_recovery>

## Teammate Compatibility

<teammate_compatibility>
The state files support both Task tool (ephemeral) and TeamCreate (persistent teammate) execution patterns.

**ExecutionMode detection**:
- TeamCreate tool available AND `preferences.executionModel: "teammate"` -> `teammate_persistent`
- Task tool available (default) -> `task_parallel`
- Neither available -> `orchestrator_only` (sequential fallback)

**Teammate state tracking** (`current-task.json`):
- `teammates[]` array tracks name, role, status, assignedPhase, lastMessageAt
- Updated when teammate messages arrive (spawn, complete, idle, shutdown)

**Parallel manifest** (`parallel.json`):
- `tasks[].teammateName` set when task assigned to a persistent teammate
- Recovery differs: Task tool re-dispatches new Task, teammate mode sends resume message

**Recovery in teammate mode**:
1. Read `current-task.json` teammates array
2. Read team config at `~/.claude/teams/{team-name}/config.json`
3. Dead teammates (not in team config): spawn replacements
4. Alive teammates: SendMessage with resume instructions
5. Completed teammates: skip
</teammate_compatibility>

## Edge Cases

<edge_cases>
**Concurrent workflow prevention**: If `current-task.json` exists with phaseStatus != "completed", refuse new workflow. Report: "Another workflow is in progress. Use /sparq:resume to continue or choose Fresh Start."

**Filesystem permissions**: If `.sparq/state/` cannot be created, warn and fall back to `execution-plan.md` state tracking only. Set `stateFilesDisabled` flag.

**Disk full**: State write failure does NOT halt the workflow. Warn: "State persistence degraded. Resume may not work." Continue workflow normally.

**Clock skew**: All timestamps are ISO 8601 with UTC timezone (`Z` suffix). Agents must use UTC for all state files.

**Version mismatch**: If `file.version != "1.0"`, warn and attempt best-effort field extraction. Missing fields use defaults, unknown fields ignored.

**WorkflowId mismatch**: If `current-task.workflowId != config-snapshot.workflowId`, warn "State files may be from different runs." Use `current-task.json` as authoritative.

**Manifest vs handoff disagreement**: Handoff file is ground truth. If `parallel.json` says "dispatched" but handoff file exists on disk, trust the handoff and update manifest. If manifest says "completed" but handoff missing, mark task for re-dispatch.
</edge_cases>
