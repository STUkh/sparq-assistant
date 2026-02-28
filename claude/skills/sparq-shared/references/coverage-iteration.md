# Coverage Iteration Protocol

Coverage-driven iteration loop that measures actual requirement coverage after Phase 2 and re-dispatches to fill gaps. Runs between P2 Output Review checkpoint and Phase 3.

Referenced by: orchestrator (enforcement), completion-verification.md (gate integration).

<applicability>
## Applicability

- **Applies to**: S1, S1+S2, S3 (scenarios that produce test cases linked to requirements)
- **Does NOT apply to**: S2 (conversion), S4 (validation), S5 (sync — diff-based), S3 bug mode (single inline describe block — single bug fix), S6 (publish results)
- **Disabled when**: `preferences.coverageThreshold` is `0`
</applicability>

<coverage_measurement>
## Coverage Measurement

After P2 Output Review checkpoint is approved and merge completes, orchestrator computes coverage from disk artifacts.

### Data Sources
1. **Requirements**: `.sparq/plans/handoffs/P1.json` → `report.counts` for total, scan `.sparq/requirements/` for individual REQ IDs
2. **Test cases**: P2 handoff → `report.artifacts` listing test case files; scan for `requirementIds` links in test titles and metadata
3. **Coverage matrix**: If generated during P2, read `.sparq/coverage/coverage-matrix.md` for structured REQ→TC mapping

### Metrics
- **Requirement coverage %**: `(reqs with >= 1 linked TC / total reqs) * 100`
- **Category breadth %**: `(categories with >= 1 test / 5) * 100` — advisory only, does NOT trigger re-dispatch
- **Uncovered list**: REQ IDs with zero linked TCs
- **Partial list**: REQ IDs where some acceptance criteria lack test coverage
- **Missing categories**: HP/VE/SEC/EC/A11Y categories with zero tests globally

### Threshold
- Config: `preferences.coverageThreshold` (number, 0-100, default `80`)
- Loop triggers when `requirementCoverage < coverageThreshold`
</coverage_measurement>

<iteration_loop>
## Iteration Loop

### Algorithm

```
iteration = 0
MAX_ITERATIONS = 3
MIN_GAIN = 5          // percentage points
previousCoverage = 0

while iteration < MAX_ITERATIONS:
  currentCoverage = measureCoverage()

  if currentCoverage >= coverageThreshold:
    emit "[sparq] P2 Coverage: {current}% -- threshold {threshold}% met"
    break

  gain = currentCoverage - previousCoverage
  if iteration > 0 AND gain < MIN_GAIN:
    emit "[sparq] P2 Coverage: {current}% -- gain {gain}% below {MIN_GAIN}% minimum -- stopping"
    break

  if tokenUsage > 120_000:
    emit "[sparq] P2 Coverage: {current}% -- token budget limit -- stopping"
    break

  iteration++
  gaps = identifyGaps()
  emit "[sparq] P2 Coverage iteration {iteration}/{MAX}: filling {gaps.count} gaps"

  re-dispatch agent for gaps only
  merge new output with existing
  previousCoverage = currentCoverage

finalCoverage = measureCoverage()
emit "[sparq] P2 Coverage final: {finalCoverage}% after {iteration} iteration(s)"
```

### Constants
- `MAX_COVERAGE_ITERATIONS`: 3
- `MIN_COVERAGE_GAIN`: 5 (percentage points)
- Default `coverageThreshold`: 80
</iteration_loop>

<gap_identification>
## Gap Identification

After measuring coverage, build a gap dispatch:

1. **Uncovered requirements**: REQ IDs with zero linked TCs → generate ALL categories
2. **Missing categories per requirement**: REQ IDs where some categories lack tests → generate specific categories
3. **Priority ordering**: Sort gaps by requirement priority (P1 > P2 > P3 > P4)
4. **Scope cap**: If uncovered reqs > 10, take top 10 by priority to avoid oversized dispatch
</gap_identification>

<gap_dispatch>
## Gap Re-Dispatch

Orchestrator re-dispatches to the SAME agent that handled P2:
- S1: sparq-manual-test-writer
- S3: sparq-automation-engineer
- S1+S2: whichever produced the gap (manual-test-writer for manual, automation-engineer for E2E)

### Prompt Additions (appended to standard dispatch)

```
**Coverage Gap Fill (Iteration {N}/{MAX})**
Previous pass delivered {delivered} {type} covering {currentCoverage}% of requirements.
Target: {coverageThreshold}%.

Fill gaps for these UNCOVERED requirements only:
{list of REQ IDs with titles}

Missing categories for these PARTIALLY covered requirements:
{list of REQ IDs with missing category abbreviations}

Start IDs from {lastId + 1}. Do NOT regenerate existing test cases.
Expected output: {gapCount} {type}
```

### Rules
- Inherits ALL decision constraints from original P2 dispatch
- Uses same parallel threshold (gap count > 20 E2E or > 30 manual → batch)
- Each iteration counts toward global re-dispatch limit (max 4 per workflow per `completion-verification.md`)
- Nested: a gap dispatch can trigger at most 1 count-based re-dispatch before next coverage iteration
</gap_dispatch>

<merge_after_iteration>
## Merge After Each Iteration

1. Validate handoff per `handoff-schema.md`
2. Merge new test cases into `.sparq/test-cases/` (append)
3. Merge new spec files (new Tier 1 files in project E2E directory)
4. Regenerate coverage matrix (full recompute, not incremental merge)
5. Update `deliveredCount` in `current-task.json` (cumulative)
6. If parallel gap dispatch: run standard Tier 2 merge per `parallel-execution.md`
</merge_after_iteration>

<checkpoint_interaction>
## Checkpoint Interaction

### Standard Mode (`checkpointLevel: "full"` or `"standard"`)
After loop exits, present **coverage summary checkpoint**:
- Final coverage %, iteration count, gain per iteration
- Remaining gaps (if any) with REQ IDs
- Options: (A) Accept and proceed to Phase 3, (B) Try one more iteration (overrides cap), (C) Reduce scope
This replaces the P3 phase gate for coverage (count-based gate still applies separately).

### Fast Mode (`checkpointLevel: "fast"`)
Coverage iteration runs silently — no gap checkpoint. Auto-accepts once threshold met or loop exits. Log: `"coverage-iteration-auto-accepted"`.

### Batch Approval Mode (`batchApproval: true`)
Coverage iteration runs automatically. **Exception**: final coverage < 50% after all iterations → interrupt with gap report (analogous to <75% delivered count interrupt). Log each: `"batch-approval-coverage-iteration-{N}"`.
</checkpoint_interaction>

<state_persistence>
## State Persistence

### current-task.json Additions

```
coverageIteration: {
  iteration: number        // current iteration (0 = not started)
  maxIterations: number    // 3
  threshold: number        // from config
  measurements: [{
    iteration: number
    coverage: number       // percentage
    uncoveredReqs: string[]
    missingCategories: string[]
    measuredAt: string     // ISO 8601
  }]
}
```

### Journal Events
- `coverage_measure`: `{ iteration, coverage, uncoveredReqs, threshold }`
- `coverage_dispatch`: `{ iteration, gapCount, agent, type }`
- `coverage_complete`: `{ finalCoverage, iterations, reason }` — reason: `"threshold_met"` | `"max_iterations"` | `"diminishing_returns"` | `"budget_limit"` | `"user_override"`

### Resume
When `coverageIteration` present in `current-task.json`:
- `phaseStatus == "agent_dispatched"` + `iteration > 0`: re-dispatch for current iteration gaps
- `phaseStatus == "checkpoint_pending"`: re-present coverage summary checkpoint
- Measurement history preserved — do not re-measure completed iterations
</state_persistence>

<progress_signals>
## Progress Signals

- `[sparq] P2 Coverage: {current}% ({covered}/{total} requirements) -- threshold {threshold}%`
- `[sparq] P2 Coverage iteration {N}/{MAX}: filling {gapCount} gaps`
- `[sparq] P2 Coverage iteration {N}/{MAX} complete: {newCoverage}% (+{gain}%)`
- `[sparq] P2 Coverage final: {finalCoverage}% after {iterations} iteration(s) -- {reason}`
</progress_signals>
