---
name: sparq:audit-prompts
description: "Auditing project prompt maturity and generating testing architecture prompts. Assessing AI prompt quality for testing. Checking prompt maturity level. Use when: user wants to evaluate prompt readiness, improve testing prompt architecture, or generate supplementary prompts for test generation."
audience: qa
---

# Audit Prompts

AI-enhanced companion for `sparq audit` CLI. Deterministic maturity scoring + optional prompt generation + AI codebase-aware enhancements.

<workflow>

## 1. Config & Baseline

Read `sparq.config.json` (if missing, suggest `/sparq:init`). Run deterministic audit:
```bash
npx sparq-assistant audit
```

## 2. Present Results

Show maturity level (0-4) with label and all 10 dimension scores.

Levels: 0 "Bare" (no CLAUDE.md/`.claude/`), 1 "Scaffolded" (exists, no testing arch), 2 "Partial" (gaps), 3 "Established" (minor gaps), 4 "Production-Ready" (complete).

Dimensions: e2e-patterns, manual-testing, naming-conventions, coverage-requirements, ci-integration, framework-selectors, page-objects, test-data, error-handling, accessibility.

## 3. Generate Prompts (Level < 4)

Ask: "Generate supplementary prompts to fill gaps?" On approval:
```bash
npx sparq-assistant audit --fix
```
Generates to `.sparq/prompts/`: testing-architecture.md, page-object-conventions.md, testability-guidelines.md, test-modification-guide.md, test-coverage-strategy.md, ci-test-integration.md. Adds `@` path references to `.claude/rules/sparq.md` with sentinel markers.

## 4. AI Enhancement (optional)

Offer: "Review generated prompts for project-specific enhancements?" On approval, read `.sparq/prompts/` files, scan codebase for actual patterns (page objects, selectors, test structure, CI config), suggest improvements with real examples. CHECKPOINT: apply only after user approval.

Suggest next: `/sparq:optimize` to compress prompts if token budget is a concern.

</workflow>

<done_criteria>
1. `sparq.config.json` read (or init suggested)
2. `npx sparq-assistant audit` executed, maturity level + dimension scores presented
3. If Level < 4 and approved: `--fix` executed, generated files listed
4. If AI enhancement approved: project-specific suggestions presented with checkpoint
5. Next step suggested (`/sparq:optimize`)
</done_criteria>

## References

- `sparq.config.json` -- project configuration
- `claude/skills/sparq-optimize/SKILL.md` -- prompt compression (suggested next)

## Examples

```
/sparq:audit-prompts
-> Reads sparq.config.json
-> Runs: npx sparq-assistant audit
-> Level 2 "Partial" -- 6/10 dimensions passing
-> User approves: npx sparq-assistant audit --fix
-> 6 files in .sparq/prompts/, refs added to .claude/rules/sparq.md
-> AI review: 4 codebase-specific enhancements, user picks 3
-> Suggest: /sparq:optimize
```
