## Checkpoint: {Phase Name}

### Summary
{2-3 sentence summary: what was accomplished, key numbers, and notable findings. Use plain language — no scenario codes.}

- **Workflow:** {human-readable workflow name} for "{feature}"
- **Phase:** {current} of {total}
- **Tests:** {count} ({category breakdown if applicable})
- **Coverage:** {percentage}% of requirements
- **Gaps:** {count or "None"}

### Decisions
- **(A) Approve** and continue **(Recommended)**
- **(B) Show details** (breakdown, artifacts, traceability)
- **(C) Reject** and provide feedback

---

### Detailed Breakdown (shown only when user selects B)

#### Artifacts
- `{file path}`: {description} ({line count or test count})

> **Categories**: HP = Happy Path | VE = Validation & Error | SEC = Security | EC = Edge Case | A11Y = Accessibility

#### Category Breakdown (test generation phases)
- Happy Path: {count} tests covering {REQ list}
- Validation & Error: {count} tests covering {REQ list}
- Security: {count} tests covering {REQ list}
- Edge Cases: {count} tests covering {REQ list}
- Accessibility: {count} tests covering {REQ list}

#### Traceability
{One line per requirement — compact REQ → TC mapping}
- {REQ-ID} ({short description}) → {TC-ID list}
- ...
- **Coverage:** {covered}/{total} requirements. {Gaps if any.}

#### Batch Summary (parallel execution only)
- **Tasks completed:** {completed} / {total}
- {task-id}: {status} -- {summary}

#### Merge Status (parallel execution only)
- **Tier 2 merge result:** {success | conflict}
- **Merged files:** {count}

#### Open Questions (if any)
- {question}

#### Agents Used
- {agent list — only in detailed view, never in summary}

## Example

> Phase 1 checkpoint for Login feature, Jira EP-142

### Summary
Requirements analysis complete for Login. 4 requirements extracted from Jira EP-142 and Confluence, covering authentication, validation, security lockout, and accessibility.

- **Workflow:** Unified Generate (Manual + E2E) for "Login"
- **Phase:** 1 of 3
- **Tests:** 14 estimated (5 HP, 4 VE, 3 SEC, 1 EC, 1 A11Y)
- **Coverage:** 100% of requirements mapped
- **Gaps:** None

### Decisions
- **(A) Approve** and continue to test generation
- **(B) Show details** (requirement list, sources, traceability)
- **(C) Reject** and provide feedback
