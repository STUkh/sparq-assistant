---
name: sparq:resume
description: "Resuming an interrupted SparQ workflow from the precise interruption point. Use when: a previous session ended mid-workflow, the user wants to continue where they left off, or workflow state shows in-progress or failed status. Supports mid-phase, mid-parallel-dispatch, and mid-merge recovery."
audience: internal
---

# Resume Interrupted Workflow

Resume a SparQ QA workflow from its exact interruption point using machine-readable state files in `.sparq/state/`. Supports six recovery levels: phase re-run, partial parallel re-dispatch, mid-merge continuation, checkpoint re-presentation, next-phase advancement, and failure handling.

## Workflow

### Step 1: Detect State

1. Check `.sparq/state/current-task.json`
   - Present and parseable: proceed to Step 2
   - Present but corrupted: backup to `.bak`, try journal reconstruction (Step 1b)
   - Missing: try legacy detection (Step 1c)

### Step 1b: Journal Reconstruction

1. Read `.sparq/state/journal.jsonl` (last 50 lines)
2. Find most recent `phase_complete` or `workflow_start` event
3. Reconstruct minimal state: scenario, feature, last completed phase
4. Warn: "State file corrupted. Reconstructed from journal. Verify before resuming."
5. Proceed to Step 2 with reconstructed state

### Step 1c: Legacy Detection

1. Check `.sparq/plans/execution-plan.md` for status "In Progress" or "Aborted"
2. If found: extract `resumeState` section, load handoffs from `.sparq/plans/handoffs/`
3. If not found: report "No interrupted workflow found. Use `/sparq:analyze` or another skill to start."
4. Legacy mode supports phase-granularity resume only (no parallel/merge recovery)

### Step 2: Validate Freshness

1. Read `.sparq/state/config-snapshot.json`
2. Compute SHA-256 of current `sparq.config.json`, compare with snapshot `configHash`
3. **Age check**: <24h proceed, 24h-7d warn, >7d recommend fresh start
4. **Config match**: warn if hash differs, detail which config fields changed
5. **Framework consistency check**: compare `config-snapshot.json` → `e2e.framework` against current project detection (presence of `playwright.config.ts` vs `cypress.config.ts`). If mismatch (e.g., snapshot says `cypress` but project now has `playwright.config.ts`): warn user that framework change invalidates generated E2E artifacts and offer fresh-start. Non-E2E workflows (S1 manual-only) can proceed despite mismatch.

### Step 3: Determine Recovery Point

Read `current-task.json` `phaseStatus` and determine recovery action per `resume-protocol.md`:

- `starting`, `agent_dispatched`: **Rerun phase** — re-dispatch same agent with full context
- `parallel_dispatched`, `parallel_collecting`: **Resume parallel** — read `parallel.json`, skip completed tasks, re-dispatch only pending/failed
- `merging`: **Resume merge** — read `parallel.json` merge steps, continue from last completed step
- `checkpoint_pending`: **Re-present checkpoint** — reconstruct from handoff data
- `checkpoint_approved`, `completing`, `completed`: **Advance to next phase** — load handoff, start next
- `failed`: **Handle failure** — present error, offer retry/skip/fresh-start

**For parallel recovery**: validate completed task handoffs exist on disk and referenced artifacts are intact. Mark tasks with missing handoffs for re-dispatch.

**For merge recovery**: read `parallel.json` `merge.steps` array, skip steps with `status: "completed"`, resume from next pending step.

### Step 4: Validate Artifacts

For each phase in `completedPhases`:
1. Read handoff from `handoffPath`
2. Verify each artifact in `handoff.report.artifacts` exists on disk
3. Report: `{verified}/{total}` artifacts intact

### Step 5: Present Recovery Wizard

Present a human-readable summary (never expose phaseStatus values, parallel/merge internals, or JSON paths):

```
Interrupted Workflow Found
──────────────────────────
Feature:  "{feature name}"
Workflow: {human-readable workflow type, e.g., "Generate E2E tests from requirements"}
Started:  {time since interruption, e.g., "2 hours ago" or "yesterday"}

What's been completed:
  {checked list of completed phases in plain language, e.g.:}
  [done] Requirements gathered (12 requirements)
  [done] Manual test cases written (18 tests)
  [>>]   E2E code generation (3 of 5 files done)
```

Map internal recovery actions to plain descriptions (never show raw action names):
- "Rerun phase" displays as: "Re-generate {phase description, e.g., 'E2E test code'}"
- "Resume parallel" displays as: "Continue generating (some tests already done)"
- "Resume merge" displays as: "Finish combining results"
- "Re-present checkpoint" displays as: "Show results for your review"
- "Advance to next" displays as: "Move to next step"

Then offer three clear options:

```
What would you like to do?

  (A) Continue where you left off (recommended)
      → {plain description of recovery action, e.g., "Continue generating (3 of 5 files already done)"}

  (B) Start fresh
      → Archive previous work and begin a new workflow

  (C) View what was generated so far
      → See completed artifacts before deciding
```

**Block until decided.**

### Step 6: Dispatch

**On (A) Continue where you left off**:
1. Load `config-snapshot.json` (use original config for consistency)
2. Dispatch orchestrator with:
   - `resumeMode: true`
   - `recoveryAction`: from Step 3
   - `recoveryDetails`: phase, parallel manifest, merge state as applicable
   - `configSnapshot`: from config-snapshot.json
   - `completedPhases`: from current-task.json
3. Orchestrator skips completed phases, applies recovery action for interrupted phase

**On (B) Start fresh**:
1. Archive `.sparq/state/` + `.sparq/plans/` to `.sparq/plans/archive/{timestamp}/`
2. Report: "Previous workflow archived. Start a new workflow with `/sparq:analyze` or another skill."

**On (C) View what was generated so far**:
1. List all verified artifacts from Step 4 with human-readable descriptions (file path + what it contains)
2. Show coverage summary: "{completed}/{total} phases done, {verified} artifacts on disk"
3. Return to the wizard options (A/B/C) for final decision

## Limitations

- Teammate recovery requires team config to still exist at `~/.claude/teams/`
- Journal reconstruction may miss events between last journal write and interruption
- Legacy mode (no `.sparq/state/` files) supports phase-granularity resume only
- Config changes since workflow start may produce inconsistent results (warned but not blocked)

<done_criteria>
1. `.sparq/state/` files located and read (or legacy `.sparq/plans/execution-plan.md` detected if state files absent)
2. Recovery point identified from `current-task.json` `phaseStatus` field (or reconstructed from `journal.jsonl` if corrupted)
3. Artifact integrity validated — each completed phase's handoff and referenced artifacts verified on disk
4. User presented with recovery wizard options (Continue where you left off / Start fresh / View what was generated) and selection received
5. Workflow restarted at the correct phase with preserved context (on Resume) or previous state archived to `.sparq/plans/archive/{timestamp}/` (on Fresh start)
</done_criteria>

## Usage

```
/sparq:resume
```

Examples:
- `"Resume interrupted workflow"`
- `"Continue where I left off"`
- `"Pick up the previous session"`

## References

- `.claude/skills/sparq-shared/references/resume-protocol.md` — full protocol, schemas, recovery actions, corruption handling
- `.claude/skills/sparq-shared/references/error-handling.md` — recovery steps
- `.claude/skills/sparq-shared/references/handoff-schema.md` — handoff format
- `.claude/templates/sparq-execution-plan.json` — `resumeState` schema (legacy)
- `.claude/agents/sparq-orchestrator.md` — state persistence and handoff persistence
