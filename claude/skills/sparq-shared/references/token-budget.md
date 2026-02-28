# Token Budget Reference

Context window: 200,000 tokens. Budget system ensures workflows complete within limits.
Referenced by: orchestrator (enforcement), sub-agents (awareness via dispatch).

<sub_agent_budgets>
## Sub-Agent Initial Load

Initial load = fixed overhead + agent prompt + agent references + dispatch data. All agents saved ~4K via resume-protocol-agent.md (conditional loading).

- requirements-analyst: ~15,000 (base) / ~17,000 (3+ sources with parallel-execution.md)
- manual-test-writer: ~16,000 (base) / ~17,000 (S5 + parallel + TMS format)
- automation-engineer: ~16,500 (small input) / ~17,000 (large input with 30+ test cases, conditional parallel ref) / ~18,000 (regression mode with bug ticket context)
- test-validator: ~13,500 (base) / ~16,000 (large suite with selective reading, 92K peak reduced)

Available = 200,000 - initial load. Sub-agents must keep output within available budget.
</sub_agent_budgets>

<hard_limits>
## Hard Limits

### Work Item Limits
- Max requirements per workflow: 40 (recommend feature-split above 25)
- Max manual tests per batch: 30
- Max E2E tests per batch: 20
- Max test files for sequential S4 validation: 10
- Max test files per parallel validation task: 10
- Max total test files for S4 validation: 40
- Max parallel batches: 6

### Context Protection
- Max scenario chain depth: 3 (e.g., S1->S2->S4 for generate+convert+validate)
- Max checkpoint rejections per phase: 3
- Max total checkpoint rejections per workflow: 6
- Max files read during P0.5 discovery: 20 (barrel/index files preferred, full read only when needed)
- Max lines read per file for validation: 300
- Max source grep results retained: 200 matches
- E2E infrastructure summary: max 500 words

### Handoff Size Limits
- Max instructions field: 100 words
- Max gaps array: 20 entries
- Max artifacts array: 50 paths
- Max total handoff size: 3,000 tokens (~12KB)
</hard_limits>

<enforcement>
## Budget Enforcement Protocol

### Orchestrator Responsibilities
1. Before dispatch: estimate sub-agent initial load (base + expected input size)
2. If estimated budget > 150K: split work into smaller batches before dispatch
3. After each phase: estimate accumulated context tokens
4. If accumulated > 120K: emit budget warning signal
5. If accumulated > 150K: suggest scope reduction to user at next checkpoint
6. Before chained scenario: check accumulated context against chain guards

### Sub-Agent Responsibilities
1. Before reading large inputs (test files, source code): count files and estimate tokens
2. If estimated file reading > 40K tokens: read selectively (highest-priority files first)
3. Truncate MCP responses to 5,000-word budget per source
4. If output generation will exceed available budget: summarize remaining items as gaps

### Selective Reading Strategy (for test-validator and large test suites)
When file reading would exceed budget:
1. Use file listing (paths only) to identify scope and structure — do NOT read file headers
2. Read full content only for files matching the feature scope
3. For validation: prioritize files with known issues (from prior handoff gaps)
4. For generation: prioritize files that will be extended (not new files)
5. If > 40 files total: require feature-scoped splitting before proceeding

### Chain Budget Guards
Before starting a chained scenario (e.g., S4 after S1+S2), check accumulated context:
- If < 100K: proceed normally
- If 100K-130K: proceed with warning, reduce checkpoint verbosity
- If > 130K: recommend starting the chained scenario in a fresh conversation

Auto-downgrade for chains: when entering a chained scenario, downgrade `checkpointLevel` from "full" to "standard" automatically (saves ~10K tokens across remaining checkpoints). Reuse existing P0.5 E2E Infrastructure Summary — do not re-discover.
</enforcement>

<distance_triggers>
## Distance-Based Budget Awareness

Tracks how far an agent has progressed from its initial instruction anchor, complementing raw token counting with work-unit distance metrics.

### Distance Proxy Metrics
- **Work units generated**: specs, test cases, findings — each pushes instructions further from attention
- **Re-anchor count**: how many re-anchor pauses the agent has taken (from `context-anchoring.md`)
- **Phases elapsed**: for orchestrator, how many phase transitions since workflow start

### Per-Unit Token Estimates
- Spec file (page + steps + spec): ~2,000 tokens
- Manual test case (full format): ~500 tokens
- Validation finding (with fix proposal): ~300 tokens
- Re-anchor overhead (re-read + drift check): ~800 tokens per re-anchor pause

### Re-Anchor Token Overhead Budgets
- automation-engineer (20 specs): 4 re-anchors × ~800 = ~3,200 tokens overhead
- manual-test-writer (30 tests): 2 category transitions + 1 mid-batch = 3 re-anchors × ~800 = ~2,400 tokens
- test-validator (40 files, 6 categories): 6 category checks + ~3 calibration checks = ~7,200 tokens overhead

### Combined Signal
When BOTH conditions are true:
1. Token consumption > 60% of estimated sub-agent budget
2. Drift detected at the most recent re-anchor point

Emit: `[sparq] {phase} Budget + drift warning: ~{N}% consumed with drift detected -- recommend completing current batch`

This combined signal indicates the agent is both running low on context budget AND losing instruction fidelity — a high-risk condition for output quality.
</distance_triggers>

<exhaustion_protocol>
## Token Exhaustion Protocol

Defines behavior when context budget is critically low or exceeded. Prevents silent truncation and data loss.

### Orchestrator at 150K tokens
- MUST output current state as a partial handoff before context fails
- Partial handoff includes: completed phases, current phase status, any artifacts produced so far, remaining work items as gaps
- Append journal: `state_snapshot` with `reason: "budget_exhaustion"`
- Present checkpoint: "Context budget exhausted at 150K tokens. Partial results available. Recommend continuing in a fresh conversation with /sparq:resume."

### Sub-agent at >80% of estimated budget
- Emit warning signal: `[sparq] {phase} Budget warning: ~80% of estimated budget consumed`
- Finish the current artifact being generated (do not leave partial files)
- Skip remaining items — record them as gaps in the handoff
- Return handoff with `status: "partial"` and `gaps[]` listing all skipped items
- Do NOT attempt to start new artifacts after the warning threshold

### Pre-dispatch budget check (orchestrator)
- Before each dispatch: estimate sub-agent cost = initial load + expected input tokens + expected output tokens + merge overhead
- If remaining budget (200K - accumulated) < agent estimate: refuse dispatch
- On refusal: present checkpoint with options — (A) reduce scope, (B) continue in fresh conversation via /sparq:resume, (C) proceed anyway (user override)
- Log refused dispatch in journal: `agent_dispatch` with `details.refused: true, details.reason: "insufficient_budget"`

### Truncated output recovery
- If a sub-agent's output is truncated (handoff incomplete or missing required fields): orchestrator reads whatever partial handoff is available
- Extract usable data: any completed artifacts, partial counts, file paths written
- Present at checkpoint: "Agent output was truncated due to budget limits. Partial results recovered: {summary}. Missing: {list}."
- Offer: (A) Resume from partial results in fresh conversation, (B) Re-run phase with reduced scope
</exhaustion_protocol>

