# Agent Handoff Schema

Structured handoff protocol for agent-to-agent communication. All agents produce handoff blocks matching this schema. Orchestrator validates required fields.

<schema>
```typescript
interface AgentHandoff {
  version: "1.0"
  from: string                    // sending agent name
  to: string                      // receiving agent or "orchestrator"
  scenario: "S1"|"S1+S2"|"S2"|"S3"|"S4"|"S5"|"S6"
  phase: "P0"|"P0.5"|"P1"|"P1.5"|"P2"|"P3"
  status: "success"|"partial"|"failed"
  report: {
    counts: Record<string, number>  // e.g. {sources: 3, reqs: 12, tests: 45}
    artifacts: string[]             // file paths produced
    confidence?: {high: number, medium: number, low: number}
    filesWritten?: string[]         // Project files created/modified by this agent (for git rollback tracking)
  }
  gaps: string[]                  // known missing data or skipped items
  instructions: string            // guidance for receiving agent (max 100 words)
  parallel?: {                    // present only when agent runs as parallel Task
    taskId: string                // e.g., "batch-1", "check-selectors", "export-testrail"
    totalTasks: number            // total parallel tasks in this dispatch
    taskIndex: number             // 1-based index of this task
  }
  anchoring?: {                   // present when context-anchoring protocol was active
    reAnchorCount: number         // how many re-anchor pauses occurred
    driftCorrections: number      // how many drift indicators triggered and corrected
    decisionsApplied: string[]    // decision constraints applied during generation
  }
  dispatch?: {                     // present when completion verification active
    expectedCount: number          // items expected per dispatch contract
    expectedType: string           // "specs" | "testCases" | "findings" | "diffs"
  }
}
```
</schema>

<validation_rules>
- `version` must be "1.0"
- `status: "failed"` requires non-empty `gaps` array
- `report.artifacts` must list existing file paths
- `instructions` under 100 words
- Orchestrator rejects handoffs missing required fields
- When `parallel` present: `parallel.taskIndex` must be 1..`parallel.totalTasks`
- Orchestrator waits for all `taskIndex` values (1..`totalTasks`) before proceeding to merge
- When `filesWritten` present, paths must be relative to project root and point to existing files
- When `anchoring` present: `reAnchorCount >= 0`, `driftCorrections >= 0`, `decisionsApplied` max 10 entries
- When `dispatch` present: if `status == "success"`, `report.counts[dispatch.expectedType] >= dispatch.expectedCount`. Violation → orchestrator rejects handoff
- `report.artifacts` maximum 50 entries
- `gaps` maximum 20 entries
- Total handoff JSON must be under 12KB (~3,000 tokens)
</validation_rules>

<example>
```json
{
  "version": "1.0",
  "from": "sparq-requirements-analyst",
  "to": "orchestrator",
  "scenario": "S1",
  "phase": "P1",
  "status": "success",
  "report": {
    "counts": {"sources": 3, "reqs": 12, "uiElements": 24, "openQuestions": 2},
    "artifacts": [".sparq/requirements/REQ-login.md"]
  },
  "gaps": ["Figma unavailable - used codebase grep for selectors"],
  "instructions": "Generate test cases covering all 12 reqs. Pay attention to 5 edge cases in EC section. 2 open questions flagged for user review."
}
```
</example>

<example>
### S3 Bug Mode Handoff

S3 dispatch includes `inputType: "feature" | "bug"` to indicate the sub-mode.

```json
{
  "version": "1.0",
  "from": "sparq-automation-engineer",
  "to": "orchestrator",
  "scenario": "S3",
  "phase": "P2",
  "status": "success",
  "report": {
    "counts": {"describeBlocksAdded": 1, "assertionCount": 5},
    "artifacts": ["e2e/specs/login/login.spec.ts"],
    "filesWritten": ["e2e/specs/login/login.spec.ts"]
  },
  "gaps": [],
  "instructions": "Appended REG-BUG-142-001 regression block to login.spec.ts. 5 assertions covering repro steps. Smoke: pass."
}
```
</example>

<required_fields>
**Always required**: version, from, to, scenario, phase, status, report.counts, report.artifacts, gaps, instructions
**Scenario-optional**: report.confidence (P2 generation agents), report.filesWritten (agents modifying project files), parallel (parallel Task agents only), anchoring (agents with >= threshold work items per context-anchoring.md), dispatch (all agents when expectedCount in dispatch prompt)
</required_fields>

<example>
```json
{
  "version": "1.0",
  "from": "sparq-automation-engineer",
  "to": "orchestrator",
  "scenario": "S2",
  "phase": "P2",
  "status": "success",
  "report": {
    "counts": {"pages": 2, "steps": 1, "specs": 3, "totalTests": 8, "skippedNotAutomatable": 1},
    "artifacts": [".sparq/test-cases/TC-login-manual.md", "e2e/specs/login/login.spec.ts"],
    "filesWritten": ["e2e/pages/login.page.ts", "e2e/specs/login/login.spec.ts", "e2e/pages/index.ts"],
    "confidence": {"high": 6, "medium": 2, "low": 0}
  },
  "gaps": ["TC-login-A11Y-003 skipped: not_automatable"],
  "instructions": "Smoke result: pass. 8 tests generated from 9 manual cases (1 skipped). Review login.spec.ts assertions."
}
```
</example>
