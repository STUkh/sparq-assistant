# Skill Rules

Guidance for SparQ skill prompt authoring.

## Required Sections

- YAML frontmatter with `name`, `description`, and `audience`
- Clear workflow steps with explicit checkpoints
- Output paths and done criteria

## UX Rules

- `/sparq:start` is the default entry point for conversational QA users
- Keep checkpoint summaries compact by default and show details on demand
- Ask only the minimum clarifications needed for execution

## Compatibility Rules

- Use additive aliases for renamed skills (do not remove existing commands abruptly)
- Keep existing command behavior stable unless major-version migration is defined

