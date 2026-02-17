---
name: sparq:tune
description: "Optimizing agent prompts for cheaper model tiers (balanced/economy). Switching between premium (opus+sonnet), balanced (all sonnet), and economy (all haiku) tiers. Generating AI-powered model guidance to compensate for cheaper models. Reducing Claude Code costs while maintaining output quality. Use when: user wants to reduce costs, switch to cheaper models, tune prompts for sonnet or haiku, optimize model tier, or improve cost efficiency."
audience: qa
---

# Model Tier Optimization

Optimize SparQ agent prompts for cheaper Claude models. Two-layer approach:
- **Layer 1** (CLI, deterministic): pre-authored prompt enhancements injected via `sparq tune apply`
- **Layer 2** (this skill, AI-powered): generates explicit `<model_guidance>` sections tailored to each agent's needs on the target model

The skill acts as an Opus-level "teacher" — analyzing each agent prompt and generating explicit instructions, examples, and scaffolding that compensate for the cheaper model's weaker implicit reasoning.

## Input

```
/sparq:tune                     Select tier interactively
/sparq:tune economy             Apply economy tier directly
/sparq:tune balanced            Apply balanced tier directly
/sparq:tune premium             Revert to premium (removes all enhancements)
/sparq:tune --refine            Improve guidance based on workflow feedback
/sparq:tune --status            Show current tier and agent status
```

> **CLI mapping:** Skill flags map to CLI subcommands:
> `/sparq:tune --status` → `sparq tune status`, `/sparq:tune economy` → `sparq tune apply economy`,
> `/sparq:tune premium` → `sparq tune revert`.

<workflow>

## 1. Read Current State

1. Read `sparq.config.json` → get `preferences.modelTier` (default: `premium`)
2. If `--status`: run `sparq tune status` equivalent — show tier, models, Layer 1/L2 status per agent, refine count. Stop here.
3. If `--refine`: jump to Step 6 (Refinement Mode)

## 2. Select Target Tier

If tier not provided as argument, present interactive selection:

```
Current tier: {currentTier}

Which model tier?
  1. premium  — best quality, highest cost (opus + sonnet) [default]
  2. balanced — good quality, lower cost (all sonnet)
  3. economy  — lowest cost, needs explicit guidance (all haiku)
```

If selected tier equals current tier: "Already on {tier} tier. Nothing to change."

## 3. Apply Layer 1 (CLI, Deterministic)

Layer 1 uses pre-authored prompt engineering enhancements from the built-in catalog. These are deterministic, offline, and free.

Run via Bash:
```bash
node bin/sparq.mjs tune apply {tier} --force
```

This command handles steps 1-6 below deterministically:
1. Check budget headroom for each agent (max 450 lines total per agent)
2. If any agent lacks headroom: suggest running `/sparq:optimize` on those agents first, then proceed with remaining agents
3. If upgrading to premium: revert all enhancements and stop (no Layer 2 needed)
4. Apply Layer 1: inject `[sparq:tier:{name}]` marked lines into agent XML sections
5. Update agent `model:` fields in YAML frontmatter
6. Update `preferences.modelTier` in `sparq.config.json`

Report Layer 1 results:
```
Layer 1 (pre-authored enhancements):
  sparq-orchestrator.md:         +2 lines (305 total)
  sparq-requirements-analyst.md: +3 lines (256 total)
  sparq-manual-test-writer.md:   +3 lines (244 total)
  sparq-automation-engineer.md:  +5 lines (362 total)
  sparq-test-validator.md:       +3 lines (271 total)
  Model fields updated to {tier} tier models
```

## 4. Generate Layer 2 Guidance (AI-Powered)

For each agent, generate a `<model_guidance tier="{tier}">` section (max 80 lines) containing explicit instructions the cheaper model needs.

### Analysis Approach Per Agent

Read each agent file (now with Layer 1 applied). For each agent:

1. **Identify implicit reasoning gaps**: What does this agent need to do that the cheaper model might struggle with? Focus on:
   - Complex classification logic (orchestrator)
   - Multi-source synthesis (requirements-analyst)
   - Format compliance across categories (manual-test-writer)
   - Code generation patterns and conventions (automation-engineer)
   - Severity judgment and fix proposals (test-validator)

2. **Generate compensating guidance** using these PE techniques, weighted by target model:
   - **Few-shot examples** (PE-3): Concrete output snippets showing exact expected format
   - **Decision trees** (PE-8): Explicit step-by-step reasoning for complex decisions
   - **Format templates** (PE-4): Copy-paste-ready output templates
   - **Negative constraints** (PE-2): Explicit "NEVER do X" rules for common mistakes
   - **Checklists** (PE-7): Measurable completion criteria the model can self-verify

3. **Prioritize by impact**: If guidance exceeds 80 lines, keep highest-impact items first:
   - Output format compliance (IDs, structure, required sections)
   - Code correctness (imports, patterns, assertions)
   - Decision accuracy (classification, severity)
   - Completeness (coverage, categories, traceability)

### Guidance Generation Per Agent

<agent_guidance_priorities>

**orchestrator** — Focus: scenario classification + dispatch correctness
- Decision tree for S1-S6 classification with concrete examples
- Dispatch handoff JSON template with all 6 required fields
- Phase transition rules: which agent runs in which phase

**requirements-analyst** — Focus: REQ ID format + source labeling + acceptance criteria
- 3+ REQ ID examples with different feature names
- Source label examples (SRC-J, SRC-C, SRC-F, SRC-L) with when to use each
- Acceptance criteria template: verb-first, testable, measurable

**manual-test-writer** — Focus: TC ID format + category coverage + coverage matrix
- Complete test case example for one category (HP recommended)
- TC ID examples across all 5 categories (HP, VE, SEC, EC, A11Y)
- Coverage matrix markdown table template

**automation-engineer** — Focus: code patterns + import conventions + page objects
- Page object class example with `get` accessors (not methods)
- Spec file example with describe/it blocks and 3+ assertions
- Import convention: fixture index, never `@playwright/test` (or Cypress equivalent)
- Barrel index.ts update example

**test-validator** — Focus: VF ID format + severity classification + fix proposals
- VF entry format with all required fields
- Severity decision tree: Critical vs Warning vs Info
- Fix proposal template with before/after code

</agent_guidance_priorities>

### Write Guidance

For each agent:
1. Generate `<model_guidance tier="{tier}">` block
2. Validate total agent file stays under 450 lines
3. If over budget: truncate guidance to fit, prioritizing highest-impact items
4. Write guidance to agent file (append before closing content)
5. Cache guidance to `.sparq/tune/{agent}-{tier}.md` for re-application after `sparq update`

Self-review: Re-read each modified agent file. Verify:
- Guidance is coherent with existing agent instructions (no contradictions)
- Examples match the project's actual patterns (read `sparq.config.json` for framework, paths)
- Total lines within 450 budget
- No duplicate instructions between Layer 1 markers and Layer 2 guidance

## 5. Report Results

```
Model Tier Optimization Complete

  Tier: {tier}
  Layer 1: {N} pre-authored enhancements applied
  Layer 2: AI guidance generated for {M} agents

  Agent Status:
    sparq-orchestrator.md:         L1 ✓  L2 ✓  +28 lines  (333 total)
    sparq-requirements-analyst.md: L1 ✓  L2 ✓  +22 lines  (278 total)
    sparq-manual-test-writer.md:   L1 ✓  L2 ✓  +18 lines  (262 total)
    sparq-automation-engineer.md:  L1 ✓  L2 ✓  +35 lines  (397 total)
    sparq-test-validator.md:       L1 ✓  L2 ✓  +20 lines  (291 total)

  All agents within 450-line budget ✓
  Refinements remaining: 3/3

Next steps:
  1. Run /sparq:generate on a ticket to verify output quality
  2. If results need improvement: /sparq:tune --refine (3 rounds available)
  3. To revert: /sparq:tune premium
```

## 6. Refinement Mode (`--refine`)

Triggered by `/sparq:tune --refine`. Iteratively improves Layer 2 guidance based on actual workflow output.

### Pre-checks

1. Read current tier from config — if `premium`, nothing to refine
2. Check refine count in `.sparq/tune/refine-count.json`:
   - If >= 3 for current tier: report "Maximum refinement rounds reached (3/3). Current guidance represents the best achievable result for {tier} tier. Consider upgrading to a higher tier if quality is insufficient." Stop here.
3. Increment refine count

### Gather Feedback

Ask user: "What issues did you notice in the generated output? You can:"
- Describe the problem in plain language
- Provide a path to the generated output file
- Paste a snippet of problematic output

### Analyze and Improve

1. Read each agent's current guidance from `.sparq/tune/{agent}-{tier}.md`
2. Identify specific gaps based on user feedback:
   - Missing format rules → add format examples
   - Wrong patterns → add explicit negative constraints
   - Incomplete output → add completeness checklist
   - Confused classification → add decision tree steps
3. Modify guidance within the 80-line budget:
   - Replace weaker items with more impactful ones (don't just append)
   - Prioritize the specific issues the user reported
4. Write updated guidance to agent files and cache
5. Report changes and remaining refinement rounds

```
Refinement round {N}/3 applied

Changes:
  sparq-automation-engineer.md: replaced generic PO example with project-specific pattern
  sparq-orchestrator.md: added edge case to classification tree

Refinements remaining: {3-N}/3
Run /sparq:generate to verify improvement.
```

</workflow>

<done_criteria>
1. Current tier detected from `sparq.config.json`
2. Target tier selected (interactive or argument)
3. Layer 1 applied via deterministic catalog (pre-authored `[sparq:tier:*]` markers)
4. Agent model fields updated in YAML frontmatter
5. Config `preferences.modelTier` updated
6. Layer 2 `<model_guidance>` generated for each agent (max 80 lines each)
7. All agents within 450-line total budget
8. Guidance cached to `.sparq/tune/` for persistence across `sparq update`
9. Self-review: no contradictions between Layer 1 and Layer 2, no duplicate instructions
10. Results summary shown with per-agent line counts and next steps
11. Refinement mode respects 3-round limit per tier transition
</done_criteria>

## Usage

```
/sparq:tune
```

Examples:
- `"Apply balanced tier optimizations"`
- `"Switch to economy tier to reduce costs"`
- `"Revert to premium tier"`
- `"Refine model guidance after test generation"`

## References

- `sparq.config.json` — current tier and project settings
- `.claude/agents/` — agent prompt files to enhance (in target project)
- `claude/skills/sparq-shared/references/config-schema.md` — config field documentation
