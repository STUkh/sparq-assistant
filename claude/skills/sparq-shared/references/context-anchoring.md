# Context Anchoring Protocol

Mid-task re-anchoring system for long-running agent phases. Prevents context rot (instruction drift, format degradation, pattern violations) by triggering deliberate re-reads of governing references at measurable work-unit intervals.

Referenced by: orchestrator (dispatch compliance + decision persistence), automation-engineer, manual-test-writer, test-validator. NOT referenced by: requirements-analyst (short Phase 1 runs, negligible drift risk).

## When to Load

<when_to_load>
Load this reference conditionally based on estimated work volume:

- **orchestrator**: always (decision persistence + dispatch compliance apply regardless of work volume)
- **automation-engineer**: when generating >= 10 test cases (specs + page objects + steps)
- **manual-test-writer**: when generating >= 15 test cases across categories
- **test-validator**: when validating >= 10 test files
- **requirements-analyst**: never (max 4 sources, 2-min timeout — drift risk negligible)

If work volume is below threshold, skip loading this reference entirely.
</when_to_load>

## Re-Anchor Triggers

<re_anchor_triggers>
Concrete, measurable triggers per agent. Each trigger pauses generation to re-read specific governing references from disk.

### automation-engineer
- **Every 5th spec file**: re-read `pattern-adherence.md` rules 1-4, framework-specific patterns reference "Code Patterns" section, and E2E Infrastructure Summary from execution plan to confirm import paths, base class, barrel convention
- **Every 5th spec file**: re-read fixture index file to verify import convention matches project

### manual-test-writer
- **After each category (HP/VE/SEC/EC/A11Y)**: re-read `test-generation-patterns.md` section for the NEXT category before generating it
- **After 15th test case**: re-read first 20 lines of `.sparq/requirements/REQ-{feature}.md` to confirm REQ IDs and feature name

### test-validator
- **After each check category (1/6 through 6/6)**: re-read `validation-checklist.md` severity definitions
- **After 10th finding**: re-read severity examples from `validation-checklist.md` to recalibrate Critical vs Warning vs Info thresholds

### orchestrator
- **Before every sub-agent dispatch**: re-read `.sparq/state/decisions.json` and include relevant `constraints[]` in dispatch prompt
- **Before Phase 3**: re-read `decisions.json` + all handoffs from disk (extends existing P3 disk re-read rule)
- **Before chained scenario**: re-read own `<done_criteria>` to verify prior scenario fully complete
</re_anchor_triggers>

## Decision Persistence

<decision_persistence>
User decisions at checkpoints are persisted to disk so they survive context compression and are available across phases.

### Schema
Location: `.sparq/state/decisions.json`

```typescript
interface DecisionLog {
  version: "1.0"
  workflowId: string
  decisions: Decision[]
}
interface Decision {
  phase: string           // "P0"|"P0.5"|"P1"|"P1.5"|"P2"|"P3"
  checkpoint: string      // "classification"|"plan_approval"|"diff_approval"|"output_review"|"final_approval"
  decidedAt: string       // ISO 8601 UTC
  choice: string          // "approved"|"approved_with_changes"|"rejected"
  context: string         // max 200 chars: what was decided
  constraints: string[]   // max 5: locked constraints from this decision
}
```

### Write Rules
- **Writer**: orchestrator only (same as all `.sparq/state/` files)
- **Atomic writes**: write to `decisions.json.tmp`, then rename to `decisions.json`
- **Timing**: immediately after each checkpoint resolution
- **Append**: read existing array, append new decision, write full file

### Read Rules
- **Orchestrator**: re-read before every dispatch; include relevant `constraints[]` in dispatch prompt
- **Sub-agents**: receive constraints via dispatch prompt; never read `decisions.json` directly
</decision_persistence>

## Drift Detection

<drift_detection>
Objective self-check indicators evaluated at each re-anchor point. Detects whether generated output has drifted from governing instructions.

### Indicators (checked at each re-anchor pause)
1. **ID format**: last 3 generated IDs still match the governing pattern (`TC-`, `REQ-`, `VF-`, `REG-`)?
2. **Import convention**: last 3 files import from fixture index (not `@playwright/test` or raw imports)?
3. **Locator style**: last 3 page objects use `get` accessors (not `readonly` properties)?
4. **Severity calibration** (test-validator only): Critical:Warning:Info ratio consistent with `validation-checklist.md` definitions?
5. **Template compliance**: last 3 outputs follow the governing template structure (sections present, order correct)?

### On Drift Detection
- **Single indicator**: emit signal, re-read the specific governing reference for that indicator
- **2+ indicators**: re-read own `<done_criteria>` section in addition to specific references
- **Log**: record drift corrections in handoff `anchoring.driftCorrections` count and `gaps[]` description
</drift_detection>

## Dispatch Compliance

<dispatch_compliance>
Pre-flight checklist the orchestrator runs before EVERY sub-agent dispatch. Ensures the dispatch prompt contains all anchoring data the sub-agent needs.

1. Config summary from `config-snapshot.json` included
2. E2E Infrastructure Summary included (E2E scenarios: S2/S3/S5/S6/S1+S2)
3. Decision constraints from `decisions.json` included (all constraints from decisions so far)
4. Feature name and scenario code stated
5. Estimated work-item count stated (so sub-agent knows whether to load `context-anchoring.md`)
</dispatch_compliance>
