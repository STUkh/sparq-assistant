# Agent Rules

Guidance for SparQ agent prompt authoring.

## Required Sections

- YAML frontmatter with `name`, `description`, `model`, `color`
- References section listing required startup references
- Done criteria section with verifiable completion conditions
- Handoff section conforming to `claude/skills/sparq-shared/references/handoff-schema.md`

## Quality Rules

- Keep user-visible language free of scenario codes (use human-readable workflow names)
- Prefer concise, deterministic instructions over narrative prose
- Use additive changes for backward compatibility unless explicitly versioned

