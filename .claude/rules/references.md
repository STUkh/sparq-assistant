---
paths:
  - "claude/skills/sparq-shared/references/**"
---

# Reference File Rules

## Purpose
References are single-source-of-truth documents consumed by multiple agents and skills. Duplication across references causes drift and contradictions.

## Structure
- Include a header comment listing which agents/skills consume this reference
- Use XML tags for sections that agents parse programmatically (e.g., `<schema>`, `<validation_rules>`, `<patterns>`)
- Use lists instead of tables for token efficiency
- Use mermaid diagrams instead of ASCII art for flows

## Single-Source-of-Truth
- IMPORTANT: Never duplicate content between references — if two references share content, extract to a new reference
- Framework extension mapping lives ONLY in `config-schema.md` — never duplicate elsewhere
- ID format definitions live ONLY in `data-model.md` — agents reference, never redefine
- When content is consolidated into a canonical reference (e.g., tool listings in `mcp-tool-inventory.md`), other files cross-reference it rather than inlining
- When adding/modifying a reference, grep for the filename across all agents and skills to verify compatibility

## Conflict Resolution
- When two references give conflicting guidance, the more specific reference wins (e.g., `playwright-patterns.md` overrides `pattern-adherence.md` on locator style)
- When an agent prompt conflicts with a reference, the reference is the source of truth — update the agent prompt to match
- When a new reference contradicts an existing one, resolve the conflict before merging — never leave both versions in place

## Size & Scope
- Keep references under 300 lines — if exceeding, split into focused documents
- Each reference should cover exactly one domain (e.g., handoff protocol, config schema, error handling)
- Avoid mixing prescriptive rules with descriptive schemas in the same file
