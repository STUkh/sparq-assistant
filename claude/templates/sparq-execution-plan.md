# SparQ Execution Plan

See also: `claude/templates/sparq-execution-plan.json` for the machine-readable JSON schema of this plan.

## Request
- **Input:** {user input}
- **Scenario:** {1: Manual | 2: Conversion | 3: Auto Gen | 4: Validation}
- **Created:** {timestamp}
- **Updated:** {timestamp}

## Sources
- **Jira**: {enabled} {ref} {status}
- **Confluence**: {enabled} {ref} {status}
- **Figma**: {enabled} {ref} {status}
- **Local Files**: {enabled} {ref} {status}

## Phases
- **P0 Classification**: {status} | orchestrator | {start}->{end}
- **P1 Requirements**: {status} | requirements-analyst | {start}->{end}
- **P2 Generation**: {status} | {agent} | {start}->{end}
- **P3 Export**: {status} | orchestrator | {start}->{end}

## Parallel Execution
- **Mode**: {sequential | parallel | degraded-sequential}
- **Active tasks**: {N}
- {phase} | {task-id} | {agent} | {status} | {output-path}

## E2E Infrastructure Summary
- **Framework**: {e2e.framework}
- **Page Objects**: {list with paths from e2e.structure.pages}
- **Components**: {list with paths from e2e.structure.components}
- **Steps**: {list with paths from e2e.structure.steps}
- **Fixtures**: {list with paths from e2e.structure.fixtures}
- **Base Class**: {e2e.baseClass} | **Auth Pattern**: {description}
- **Tech Stack**: {detected framework summary}
- **Gaps**: {missing infrastructure}

## Requirements
- {REQ-feature-NNN} {Title} | src:{SRC-J|SRC-C|SRC-F|SRC-L} | pri:{P1|P2|P3|P4} | cat:{category}

## Test Estimation
- **Requirements count**: {N}
- **UI elements count**: {N}
- **Estimated tests**: {N} (reqs x5={N}, UI x2={N})
- **Batching**: {single|warning|required} ({N} batches)

## Batches
- **Batch {N}** {feature area}: {N} reqs, ~{N} tests | Status: {Pending|In Progress|Complete}

## Artifacts
- {file} | type:{type} | {status}

## Coverage Summary
- **Overall**: {N}/{N} reqs covered ({percentage})
- **By category**: {category}: {N}/{N} | {category}: {N}/{N}
- **Gaps**: {list of uncovered reqs}

## Checkpoints
- **Checkpoint 1: Plan Approval** (P1): {status} {response} {timestamp}
- **Checkpoint 2: Output Review** (P2): {status} {response} {timestamp}
- **Checkpoint 3: Final Approval** (P3): {status} {response} {timestamp}

## Open Questions
- **Q{#}**: {question} | src:{source} | {status} | resolution:{resolution}

## Notes
- {timestamp} {Decision|Info}: {note}

## Resume State
- **Last Completed Phase:** {phase or N/A}
- **Next Phase:** {phase or N/A}
- **Last Handoff:** {path or N/A}
- **Config Hash:** {sha256 or N/A}
- **Interrupted At:** {timestamp or N/A}
- **Reason:** {user_abort | error | timeout | session_end | N/A}

## Completion
- **Status:** {In Progress | Complete | Aborted}
- **Scenario:** {1-5}
- **Agents:** {count}
- **Artifacts:** {count}
- **Checkpoints Passed:** {count}
- **Parallel Tasks:** {count}

## Example

> S1+S2 (Unified Generate) for Login feature, Jira EP-142

### Request
- **Input:** "Generate manual and E2E tests for login feature EP-142"
- **Scenario:** S1+S2: Unified Generate
- **Created:** 2026-02-13T10:00:00Z

### Sources
- **Jira**: enabled EP-142 Fetched
- **Confluence**: enabled "Auth Spec v3" Fetched
- **Figma**: disabled -- --
- **Local Files**: disabled -- --

### Phases
- **P0 Classification**: complete | orchestrator | 10:00->10:01
- **P1 Requirements**: complete | requirements-analyst | 10:01->10:04
- **P2 Generation**: in_progress | manual-test-writer + automation-engineer | 10:05->--
- **P3 Export**: pending | orchestrator | --

### Requirements
- REQ-login-001 Successful login | src:SRC-J | pri:P1 | cat:Functional
- REQ-login-002 Invalid credentials error | src:SRC-J | pri:P1 | cat:Validation
- REQ-login-003 Account lockout | src:SRC-C | pri:P1 | cat:Security
- REQ-login-004 Keyboard accessibility | src:SRC-C | pri:P2 | cat:Accessibility

### Test Estimation
- **Requirements count**: 4
- **UI elements count**: 6
- **Estimated tests**: 14 (reqs x5=20, capped by category distribution)
- **Batching**: single (1 batch)
