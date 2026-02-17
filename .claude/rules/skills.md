---
paths:
  - "claude/skills/**"
---

# Skill File Rules

## YAML Frontmatter (required)
- `name`: format `sparq:{verb}` (e.g., `sparq:analyze`, `sparq:sync`)
- `description`: trigger-oriented — describe WHEN to use, WHAT it does, KEY WORDS that activate it

## Workflow Structure
1. **Config check first**: Read `sparq.config.json`. If missing, prompt for `/sparq:init` or auto-detect from `package.json`
2. **Propose plan**: Present execution plan with checkpoints before starting work
3. **Delegate to agent(s)**: Skills dispatch to appropriate agents — skills are entry points, not executors
4. **Present output**: Show results for user review before proceeding
5. **Offer chaining**: Suggest next logical skill (e.g., `/sparq:generate-manual` → `/sparq:manual-to-e2e`)

### Config Preamble (all non-init skills)
Every skill (except `sparq:init`) must perform these steps before its workflow:
- Read `sparq.config.json` for enabled sources, e2e setup, tech stack, and output dirs. Only query sources where `enabled: true`.
- Verify `version` matches current; if outdated, warn user to run `npx sparq-assistant update`
- If config missing, prompt for `/sparq:init` or auto-detect from `package.json`. Log: `"[sparq] No config found -- auto-detecting from package.json"`. See `config-schema.md` for full schema.
- Follow `pattern-adherence.md` rules

### E2E Code Generation Preamble (generate, generate-e2e, manual-to-e2e, sync)
Before generating or modifying E2E code:
- MUST read `e2e.structure.*` from config for directory paths and scan them
- Match exact conventions -- locator style (`get` accessors, not constructor assignments), import paths (relative like `../../fixtures`), barrel exports
- Check `e2e-common-patterns.md` section "UI Framework Selectors" for framework-specific selector patterns

## Degradation & Fallbacks
- Every MCP-dependent workflow must include fallback behavior when external sources are unavailable
- Reference `claude/skills/sparq-shared/references/degradation-strategy.md` for per-source fallback patterns
- IMPORTANT: Skills must never hard-fail on MCP unavailability — always offer an alternative input path

## Output Conventions
- Output paths must match `sparq.config.json` output settings
- E2E test code (pages, steps, specs, fixtures, components) goes directly to the project test directory per `e2e.structure.*` config
- Metadata artifacts (requirements, coverage, validation reports, test registry, execution plans) go to `.sparq/`

## References Section
- Skills that reference shared docs (e.g., `See mcp-tool-inventory.md`) must also list them in the formal `## References` section
- The `## References` section is the startup loading manifest — inline mentions alone are insufficient

## Usage Example (required)
- Every skill MUST end with a usage example showing: input format → expected output files
- Example should cover the most common invocation pattern
