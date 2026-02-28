---
paths:
  - "claude/agents/**"
---

# Agent File Rules

## YAML Frontmatter (required)
- `name`: kebab-case, prefixed `sparq-` (e.g., `sparq-requirements-analyst`)
- `description`: gerund-form for trigger accuracy (e.g., "Orchestrating QA test workflows. Classifying requests into...")
- `model`: `opus` for complex reasoning, `sonnet` for structured generation
- `color`: unique color per agent for visual distinction

## Terminology
- **Sub-agent**: Any agent other than the orchestrator (requirements-analyst, manual-test-writer, automation-engineer, test-validator). Sub-agents are dispatched by the orchestrator and return structured handoffs. They cannot spawn other sub-agents.

## Required Sections
- `<done_criteria>` (required for ALL agents) — numbered checklist where every item is objectively verifiable (not subjective like "high quality")
- `<references>` (required for ALL agents) — list all files the agent must load at startup
- Handoff section (required for sub-agents) — use `<handoff>` XML tag or `## Handoff` markdown heading. Schema and canonical example in `claude/skills/sparq-shared/references/handoff-schema.md`
- The orchestrator is exempt from handoff sections since it dispatches rather than hands off
- IMPORTANT: An agent without `<done_criteria>` will never know when it is finished

## Structural Rules
- Use XML tags for unambiguous section boundaries: `<classification_rules>`, `<rules>`, `<constants>`, `<extraction>`, `<validation_checks>`, `<few_shot_examples>`, `<example>`
- Use lists instead of tables — ~30-40% token savings
- Use mermaid diagrams instead of ASCII art for flow visualization
- Use `@path` syntax to reference other files instead of inlining their content
- Keep agents under 300 lines — if exceeding, extract shared logic to `claude/skills/sparq-shared/references/`
- IMPORTANT: ALL handoff entries (every scenario) must live inside the agent's canonical handoff section (`<handoff>` or `## Handoff`) — never place handoff entries in workflow sections

## Content Quality
- Every workflow step must specify its output (file path, handoff, or user prompt)
- Include `<few_shot_examples>` when classification accuracy is critical (e.g., scenario classification)
- Constants (ID formats, timeouts, severity levels) go in a `<constants>` tag — never scatter through prose
- Parallel batch instructions must include ID range pre-assignment to prevent collisions
- Agents producing artifacts MUST specify exact output paths — no ambiguous locations

## Prompt Optimization
- Front-load the most critical instructions (primacy bias)
- Use IMPORTANT: prefix sparingly — only for rules that cause cascading failures if violated
- End with `<done_criteria>` (recency bias reinforces completion checklist)
- Handoff sections list ONLY scenario-varying fields (counts, artifacts, instructions); full schema in `handoff-schema.md`
- Reference canonical docs (`handoff-schema.md`, `validation-checklist.md`, `parallel-execution.md`) instead of restating content inline
- Manual prompt optimization: apply T1–T12 token-reduction techniques from `/sparq:prompt-optimizations` when refining agent files
