# Parallel Execution Reference

Patterns for launching parallel Task agents in Claude Code. Maximum 6 concurrent agents. Referenced by: all agents, all skills.

<task_tool_usage>
The Task tool spawns an independent sub-agent that:
- Receives a text prompt, returns a text result
- Has NO access to the parent conversation context
- CAN read/write files on the filesystem
- Writes E2E code directly to the project test directory (Tier 1) and staged shared artifacts to `.sparq/parallel/` (Tier 2)

To parallelize: launch multiple Task tool calls in a single message.
Each Task agent must receive ALL context it needs in its prompt (config summary, file paths, references to read, output path, Tier assignments).
Sub-agents cannot ask clarifying questions — provide complete, unambiguous instructions.
</task_tool_usage>

## File Isolation Convention

<file_tiers>
Parallel Task agents classify every file they write into one of three tiers:

### Tier 1: Direct-Write (Exclusive Files)
Feature-scoped files where each parallel agent owns a distinct feature — no file overlap.
- Spec files: `{e2e.structure.specs}/{feature}.spec.ts`
- Feature page objects: `{e2e.structure.pages}/{feature}.page.ts`
- Feature steps: `{e2e.structure.steps}/{feature}.steps.ts`
- Feature fixtures: `{e2e.structure.fixtures}/{feature}.fixture.ts`

Each agent writes directly to the project E2E directory. Two agents MUST NOT write to the same file.

### Tier 2: Staged Shared (Merge-Required Files)
Files that multiple agents may need to extend. Agents write additive patches to `.sparq/parallel/{task-id}/shared/`:
- **Barrel additions**: `.sparq/parallel/{task-id}/shared/{dir}/index.ts.additions` (just the new export lines)
- **Registry entries**: `.sparq/parallel/{task-id}/shared/test-registry.partial.json` (this agent's entries only)
- **Shared component extensions**: `.sparq/parallel/{task-id}/shared/components/{name}.extensions.ts`

After all tasks complete, the orchestrator merges these into the actual project files.

### Tier 3: Read-Only (Existing Project Files)
Files that agents read but never modify during parallel execution:
- Base classes (e.g., `e2e/pages/abstract.page.ts`)
- Existing page objects and components not owned by this agent
- Framework config (`playwright.config.ts`)
- Application source code (`src/`)

Safe for concurrent reads — no coordination needed.
</file_tiers>

## Pattern 1: Fan-Out / Fan-In

<pattern name="fan-out-fan-in">
**When**: Multiple independent work units producing separate outputs, merged afterward.

### Structure
1. **Fan-Out**: Launch N Task agents (max 6), each with:
   - Config reference: read `.sparq/state/config-snapshot.json` for project config and E2E summary
   - Feature ownership assignment (which feature this agent owns)
   - Tier classification for every file it will write
   - Instruction to emit handoff JSON at end of output
2. **Fan-In**: After ALL tasks complete:
   - Validate each handoff block
   - Run Tier 2 merge protocol (see below)
   - Verify no Tier 1 file conflicts occurred
   - Continue pipeline

### Metadata Files
Non-E2E artifacts (requirements, test cases, coverage) still use namespaced `.sparq/` paths:
- `.sparq/requirements/parallel/SRC-J/raw-login.md`
- `.sparq/test-cases/parallel/batch-1/TC-login-HP.md`

After fan-in merge, consolidated file goes to the standard `.sparq/` path. Parallel dirs cleaned up.

### Task Prompt Template

```
You are sparq-{agent-name} operating in parallel mode.

**Config**: Read `.sparq/state/config-snapshot.json` for project config and E2E summary.
Do NOT write to `.sparq/state/` — state files are orchestrator-only.

**Input**: Read {input file path}

**Your Assignment**: {specific work unit description}

**Feature Ownership**: You own the `{feature}` feature. You have exclusive write
access to all `{feature}.*` files under the E2E directory.

**Tier Write Rules**:
- Tier 1 (Direct-Write): Write specs, pages, steps, fixtures for your feature
  directly to the project E2E directory per `e2e.structure.*` config paths.
- Tier 2 (Staged Shared): Write barrel export additions to
  `.sparq/parallel/{task-id}/shared/{dir}/index.ts.additions`.
  Write registry entries to
  `.sparq/parallel/{task-id}/shared/test-registry.partial.json`.
- Tier 3 (Read-Only): Read existing base classes, page objects, config — never modify.

**References**: Read these files for rules:
- .claude/skills/sparq-shared/references/{relevant-ref}.md
- .claude/agents/sparq-{agent-name}.md (your full instructions)

**Handoff**: After completion, end your output with this JSON block:
```json
{handoff template with pre-filled from/to/scenario/phase, parallel field, and filesWritten}
```

**Constraints**:
- Write Tier 1 files ONLY for your assigned feature
- Write Tier 2 patches ONLY to your `.sparq/parallel/{task-id}/shared/` directory
- Do NOT modify Tier 3 files
- If you encounter errors, document them in the handoff gaps array
```
</pattern>

## Tier 2 Merge Protocol

<merge_protocol>
After all parallel tasks complete, the orchestrator merges Tier 2 artifacts:

1. **Barrel exports**: Read `.additions` files from all `.sparq/parallel/*/shared/{dir}/`
2. Read current barrel `index.ts` files from the project
3. Merge and deduplicate export lines
4. Write merged barrels to project directory
5. **Registry**: Merge all `.partial.json` files into `.sparq/tracking/test-registry.json`
6. **Shared components**: If multiple agents extended the same component, merge method additions (deduplicate by method name)
   **Conflict resolution**: When multiple agents extend the same shared component with methods of the same name, apply last-write-wins (by task completion timestamp). Emit warning signal: `[sparq] {phase} Merge conflict: {component}.{method} — kept version from task {taskId}`. Log both versions in `.sparq/parallel/merge-conflicts.log` for user review.
7. **Cleanup**: Remove `.sparq/parallel/` directories
8. **State tracking**: Update `.sparq/state/parallel.json` merge steps after each step completes. If merge is interrupted, resume reads `parallel.json` and continues from last completed step per `resume-protocol.md`.

### Merge Validation
For merge validation rules (handoff presence, JSON validity, file references, ID collisions, Tier 1 conflicts), see `error-handling.md` `<merge_validation>`.

### CLI Merge Utilities

The functions in `bin/lib/merge.mjs` implement these merge operations programmatically:
- `mergeBarrelAdditions(currentBarrel, additions[])` — Tier 2 barrel export merge with dedup
- `mergeRegistryPartials(currentRegistry, partials[])` — registry partial merge with conflict tracking
- `detectIdCollisions(entries[])` — cross-batch TC/VF ID collision detection
- `validateTierAssignment(assignments[])` — Tier 1 exclusivity and Tier 3 write violation checks
- `renumberIds(ids[], startFrom)` — ID renumbering for collision resolution
- `validateParallelHandoff(handoff)` — handoff schema validation with parallel field checks

These are pure functions with zero I/O — unit tests in `test/unit/merge.test.mjs`.
</merge_protocol>

## Pattern 2: Parallel Batches

<pattern name="parallel-batches">
**When**: Single large task split into independent batches.
- Manual test generation: >30 items per batch
- E2E code generation: >20 items per batch (lower threshold due to higher per-test token cost)

### Structure
1. **Split**: Divide work items into batches of max 30 (manual) or max 20 (E2E)
2. **Assign**: Each batch gets a Task agent with batch number, item range, feature ownership list
3. **Direct-Write**: Each batch writes spec files directly to the project E2E directory
4. **Defer Shared**: Barrel export updates deferred to Tier 2 merge after all batches complete
5. **Merge**: Combine batch metadata outputs, unify IDs, deduplicate, run Tier 2 merge protocol

### ID Continuity
Pre-assign non-overlapping ID ranges before dispatch:
- Batch 1: `TC-{feature}-HP-001` through `TC-{feature}-HP-010`
- Batch 2: `TC-{feature}-HP-011` through `TC-{feature}-HP-020`

Agents MUST NOT generate IDs outside their assigned range. If overflow, document in handoff gaps.

### Merge Rules
- Concatenate test cases in batch order
- Unify coverage matrix rows
- Sum counts across batches
- Merge gaps arrays (deduplicate)
- Run Tier 2 merge protocol for barrel exports and registry

### Completeness Verification
- Pre-merge: verify handoff file exists on disk for ALL `taskIndex` (1..`totalTasks`). Missing after 2× timeout → escalate.
- Per-task: `delivered >= expectedItemCount` OR `status: "partial"` with gaps. Never silently accept shortfall.
- Merge total: `sum(delivered) >= total_expected` OR structured gap report at checkpoint.
- ID range: `count(IDs in assigned range) == expectedItemCount` per task. Underflow → document in gap report.
</pattern>

## Pattern 3: Parallel Independent Checks

<pattern name="parallel-checks">
**When**: Multiple validation or analysis passes over the same input, each checking different aspects.

### Structure
1. **Input**: All tasks read the SAME input files (Tier 3 read-only — safe)
2. **Checks**: Each task performs one check category
3. **Output**: Each writes findings to `.sparq/validation/{check-category}.md`
4. **Merge**: Combine findings, assign unified IDs, sort by severity

### File Access Rules
- Input files: READ-ONLY shared access (safe for concurrent reads)
- Output files: EXCLUSIVE per-task in `.sparq/validation/` (mandatory — never two tasks writing to same file)
</pattern>

## Pattern 4: Dual-Agent Pipeline

<pattern name="dual-agent">
**When**: Two agents working from the same input but producing different artifact types (e.g., manual tests + Playwright specs from same requirements).

### Structure
1. Both agents read the same requirements file (Tier 3)
2. Agent A produces manual test cases → `.sparq/test-cases/`
3. Agent B produces Playwright specs → project E2E directory (Tier 1 direct-write)
4. No file conflict since Agent A writes metadata to `.sparq/` and Agent B writes code to the project
5. Agent B writes Tier 2 patches for barrel exports and registry
6. Orchestrator reviews both outputs, runs Tier 2 merge, merges coverage data
</pattern>

## Pattern 5: Parallel Exports

<pattern name="parallel-exports">
**When**: Exporting the same data to multiple external systems (TMS, Jira, Confluence).

### Structure
1. All tasks read the same artifact files from `.sparq/` (read-only)
2. Each task targets one export destination with its own MCP tools
3. Failure of one does NOT affect others
4. Join: collect status + URLs from each, report unified results
</pattern>

## Pattern 6: S5 Dual Gathering

<pattern name="s5-dual-gathering">
**When**: S5 Phase 1 — fetching current requirements AND parsing existing tests simultaneously.

### Structure
1. **Task A (test-validator)**: Reads test registry, parses existing test files, extracts TC IDs, builds traceability map
2. **Task B (requirements-analyst)**: Fetches current requirements from Jira/Confluence/Figma, saves previous snapshot
3. **No shared writes**: Task A reads registry + test files (read-only). Task B writes to `.sparq/requirements/` (exclusive)
4. **Join**: Orchestrator receives both handoffs, proceeds to P1.5 diff analysis

### File Access
- Task A: READ `.sparq/tracking/test-registry.json`, READ `e2e/specs/**` — no writes
- Task B: WRITE `.sparq/requirements/REQ-{feature}.md`, WRITE `.sparq/refresh/REQ-{feature}-previous.md`
- No Tier 2 merge needed (no overlapping writes)
</pattern>

## Concurrency Limits

<concurrency>
- **Hard maximum**: 6 concurrent Task agents
- **Recommended maximum**: 4 concurrent (leaves headroom for retries)
- **Minimum batch size for parallelization**: 10 items for E2E generation, 15 items for manual tests (below this, sequential is faster due to ~5-10s Task spawn overhead)

When work exceeds 6 agents, queue by priority:
1. Critical path items (blocking downstream work)
2. Largest batches (most time savings)
3. Independent checks (can be deferred)
</concurrency>

## When NOT to Parallelize

<sequential_preferred>
- **< 15 work items**: Task spawn overhead exceeds time savings
- **Sequential dependency**: Agent B needs Agent A's output (e.g., S2 gap analysis, S4 fixes)
- **Shared write target**: Two agents would write to the same Tier 1 file
- **User interaction needed**: Tasks that may need to pause for user input
- **Single MCP resource**: Multiple tasks hitting the same rate-limited API endpoint
- **Complex merge**: Results require non-trivial reconciliation logic
</sequential_preferred>

## Graceful Degradation

For parallel degradation rules (Task tool unavailable, partial completion, slow tasks), see `degradation-strategy.md` "Parallel Execution Degradation" and `error-handling.md` `<parallel_errors>`.

## Handoff Extension for Parallel Mode

<parallel_handoff>
Parallel Task agents emit a standard `AgentHandoff` with one optional addition:

```json
{
  "version": "1.0",
  "from": "sparq-{agent}",
  "to": "orchestrator",
  "scenario": "S{n}",
  "phase": "P{n}",
  "status": "success|partial|failed",
  "parallel": {
    "taskId": "batch-1",
    "totalTasks": 3,
    "taskIndex": 1
  },
  "report": { "counts": {}, "artifacts": [], "filesWritten": ["e2e/specs/login.spec.ts"] },
  "gaps": [],
  "instructions": "..."
}
```

The `parallel` field is optional. When present, the orchestrator waits for all `taskIndex` values (1..`totalTasks`) before proceeding to merge.

When dispatch includes `Expected output: {N}`, each parallel task receives `expectedItemCount` in its dispatch for per-task completion verification per `completion-verification.md`.

The `filesWritten` field lists project files created or modified by this agent (Tier 1 direct-writes) for git rollback tracking.
</parallel_handoff>
