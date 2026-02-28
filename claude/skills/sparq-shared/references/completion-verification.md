# Completion Verification Protocol

External validation that agents delivered all requested items. Orchestrator verifies every handoff — agents cannot self-declare "success" with missing items. Referenced by: orchestrator (enforcement), all sub-agents (awareness via dispatch contract).

Design principle: the external system decides when a task is complete, not the LLM.

<dispatch_contract>
## Dispatch Contract

Every orchestrator dispatch prompt MUST include a structured count expectation:

```
Expected output: {count} {type}
```

Examples:
- `Expected output: 20 specs`
- `Expected output: 30 testCases`
- `Expected output: 15 findings`
- `Expected output: 8 diffs`

Rules:
- Orchestrator calculates expected count from Phase 1 outputs (reqs × testMultiplier, diff item count, etc.)
- Sub-agents MUST parse this line at the start of their work
- Sub-agents track `currentCount` incrementally during generation
- If no expected count in dispatch (e.g., S4 where count is unknown upfront): agent sets own estimate after inventory, reports in handoff
- For parallel batches: each task receives its own expected count (per-batch, not total)

### Canonical Count Keys

Agents MUST use these exact `report.counts` keys matching each `expectedType`:

| expectedType | Primary Agent | report.counts key | Calculation |
|-------------|---------------|-------------------|-------------|
| `"specs"` | automation-engineer | `specs` | count of spec files |
| `"testCases"` | manual-test-writer | `testCases` | total test cases |
| `"findings"` | test-validator | `findings` | `critical + warning + info` |
| `"diffs"` | manual-test-writer (S5) / automation-engineer (S5) | `diffs` | `newTests + changedTests + deprecatedTests` |

Agents MUST include the primary key even when scenario-specific breakdown keys are also present.
</dispatch_contract>

<handoff_verification>
## Handoff Verification (Orchestrator)

After receiving EVERY handoff, orchestrator validates before accepting:

1. Extract primary metric from `report.counts` matching the dispatched `expectedType`
2. Compare `delivered` (from counts) against `expected` (from dispatch contract)

### Decision Matrix

| Delivered vs Expected | Status | Action |
|----------------------|--------|--------|
| `delivered >= expected` | `success` | Accept handoff, proceed |
| `delivered < expected` | `partial` + non-empty `gaps[]` | Accept, surface gap at checkpoint |
| `delivered < expected` | `success` (no gaps) | Shortfall <= 10%: accept with warning. Shortfall > 10%: **REJECT** — re-dispatch |
| `delivered < expected` | `partial` + empty `gaps[]` | Accept with warning — agent forgot to list gaps |
| any | `failed` | Evaluate gaps, decide re-dispatch or escalate |

On rejection: re-dispatch per `<re_dispatch>` protocol below.

### Completion Signal

After every handoff verification:
- `[sparq] {phase} Completion: {delivered}/{expected} {type}`
- On shortfall: `[sparq] {phase} Completion shortfall: {delivered}/{expected} -- re-dispatching remaining {N}`
</handoff_verification>

<phase_gate>
## Phase Gate Validation

Cross-phase count checks before proceeding to next phase:

### Before Phase 2 (E2E from manual tests — S2)
- Gate: `automatable_test_cases >= total_test_cases * 0.5` (at least 50% automatable)
- Shortfall: present at checkpoint — "Only {N} of {M} test cases are automatable. Proceed?"

### Before Phase 3 (all scenarios)
- Gate: `deliveredCount == expectedCount` OR user explicitly approved gap at Phase 2 checkpoint
- Shortfall: present structured gap report with options: (A) Re-run Phase 2 for remaining items, (B) Accept partial and proceed, (C) Reduce scope

### S5 Sync Validation
- Gate: `count(addressed_diffs) == count(total_diffs_approved)` (only count user-approved diffs from P1.5)
- Shortfall: list unaddressed diffs, offer re-run for remaining

### Gate Override
User can always approve proceeding despite shortfall. Log override in `decisions.json` with `choice: "approved_with_changes"` and `constraints: ["accepted_shortfall:{count}"]`.
</phase_gate>

<coverage_gate>
## Coverage-Driven Gate (Post-Phase 2)

After Phase 2 count-based verification passes, a coverage-driven iteration loop runs for applicable scenarios (S1, S1+S2, S3 feature mode). S3 bug mode is excluded. Full protocol in `coverage-iteration.md`.

### Gate Condition
- `requirementCoverage >= preferences.coverageThreshold` (default 80%)
- Formula: `(reqs with >= 1 linked TC / total reqs) * 100`

### On Shortfall
1. Identify uncovered/partial requirements from coverage matrix
2. Re-dispatch to same P2 agent with gap-specific prompt
3. Max 3 iterations, min 5% gain per iteration
4. Stop on: threshold met, max iterations, diminishing returns, budget limit, or user override

### Interaction with Count Gate
- Count gate (`deliveredCount == expectedCount`) runs FIRST
- Coverage gate runs AFTER count gate passes
- Coverage re-dispatches increment `deliveredCount` and `expectedCount` (both grow)
- Coverage re-dispatches count toward the global re-dispatch limit (max 4 per workflow)

### Interaction with Re-Dispatch Protocol
- Coverage gap dispatches use the same re-dispatch mechanics (same agent, same constraints)
- If a coverage gap dispatch itself has a count shortfall, the standard re-dispatch protocol applies
- Nested: a gap dispatch can trigger at most 1 count-based re-dispatch before the next coverage iteration

### Not Applicable
- S2: input-driven conversion, no requirement mapping for new coverage
- S4: validation findings, not requirement coverage
- S5: diff-driven — coverage is measured by addressed diffs, not requirement linkage
- S3 bug mode: single inline describe block — coverage loop excluded; S6 (Publish Results): no test artifacts
</coverage_gate>

<parallel_completeness>
## Parallel Completeness Gate

Before merging parallel task results:

1. **All-present check**: Verify handoff file exists on disk for ALL `taskIndex` values (1..`totalTasks`)
2. **Timeout**: If any task hasn't returned after 2× estimated duration, emit warning signal
3. **Missing task escalation**: Never silently merge partial results. Present: "Task {N} did not complete. Options: (A) Retry task, (B) Proceed with {N-1}/{N} results, (C) Abort"
4. **Per-task count check**: For each completed task, verify `delivered >= expectedPerTask` OR `status == "partial"` with gaps
5. **Merge total check**: After merge, verify `sum(all_delivered) >= total_expected` OR generate structured gap report for checkpoint

ID range validation: `count(IDs in assigned range) == expectedItemCount` per task. Underflow → document in merge gap report.
</parallel_completeness>

<re_dispatch>
## Re-Dispatch Protocol

When handoff verification detects a count shortfall:

### First Shortfall
- Split remaining items into a smaller batch
- Re-dispatch with prompt: "Previous attempt delivered {N}/{M}. Complete remaining {M-N} items only. Start IDs from {last_id + 1}."
- Include: same config summary, E2E summary, decision constraints
- Do NOT re-generate already-completed items

### Second Shortfall (same phase)
- Escalate to user: "Phase cannot complete all {M} items within current context. Delivered: {N}. Options: (A) Accept {N} items and proceed, (B) Continue in fresh conversation via /sparq:resume, (C) Reduce scope to {N} items"
- Log in journal: `re_dispatch_exhausted` with counts

### Limits
- Max re-dispatches per phase: 2
- Max re-dispatches per workflow: 4
- Re-dispatch inherits all decision constraints from original dispatch
- Re-dispatch does NOT count against checkpoint rejection limit
</re_dispatch>

<agent_count_tracking>
## Sub-Agent Count Tracking

Sub-agent responsibilities when dispatch includes "Expected output: {N} {type}":

1. **Parse at start**: Extract expectedCount and expectedType from dispatch prompt
2. **Track incrementally**: Maintain running `currentCount` during generation
3. **Re-anchor integration**: At each re-anchor point (per `context-anchoring.md`), verify: `Generated {current}/{expected}` — emit as part of re-anchor signal
4. **Budget-aware shortfall**: If approaching token budget limit (>80%) with items remaining:
   - Emit: `[sparq] {phase} Budget warning: {current}/{expected} generated at ~80% budget`
   - Finish current artifact (do not leave partial files)
   - Set `status: "partial"`, list all remaining items in `gaps[]` with reason "token_budget"
   - Do NOT attempt to start new artifacts after budget warning
5. **Handoff consistency**: `report.counts.{primaryMetric}` MUST equal `currentCount`. If `currentCount < expectedCount`: status MUST be "partial" with remaining items in gaps[]
6. **Dispatch echo**: Include `dispatch: { expectedCount, expectedType }` in handoff for orchestrator verification
7. **Scope**: This protocol covers sub-agent output completeness. The Stop hook (`sparq-stop-guard.mjs`) separately guards the orchestrator conversation from premature exit. Both layers are independent — neither replaces the other.

Never set `status: "success"` when `currentCount < expectedCount`. This is the cardinal rule of completion verification.
</agent_count_tracking>
