---
name: sparq:eval-reflect
description: "Analyzing eval results and suggesting prompt improvements for failing cases. Mapping rubric findings to specific agent prompt sections with concrete fixes."
audience: dev
service: true
---

# Eval Reflect -- Analyze Eval Results and Suggest Prompt Improvements

Service primitive (non-default path). Prefer `/sparq:improve` first; use this skill when improve returns `BLOCKED`, `NO_IMPROVEMENT`, or focused expert intervention is needed.

Read saved eval results, identify failing cases, and produce actionable improvement suggestions. Each failing rubric finding maps to a specific agent prompt section with a concrete fix.

No required args -- auto-detects the latest saved results from `test/evals/data/runs/`.

<workflow>

## 1. Load Latest Results

Scan `test/evals/data/runs/` for the most recent run file (by filename timestamp or `mtime`). Parse the results JSON/YAML. If no runs exist, halt: `"[sparq] No eval runs found in test/evals/data/runs/ -- run an eval first."`

## 2. Identify Failing Cases

Filter cases where:
- Score percentage < 75%, OR
- Regressed from baseline (if baseline exists in `test/evals/data/baselines/`)

Load baseline file matching the same scenario/case name. Flag cases that were previously passing but now fail as `REGRESSION`.

## 3. Load Agent Prompts

Map each failing case's scenario to pipeline agents per `eval-workflow.md` "Scenario Pipelines". Load each agent's prompt from `claude/agents/sparq-{name}.md`.

## 4. Analyze Findings

For every rubric finding in failing cases, identify:

- **Responsible agent**: which agent's output failed the check
- **Prompt section**: the specific section to fix (`<constants>`, `<rules>`, `<done_criteria>`, Step N, `<few_shot_examples>`)
- **Category**: one of `convention_violation`, `missing_pattern`, `structural_error`, `id_format`
- **Concrete fix**: exact text to add, modify, or move in the agent prompt

### Convergence Check

For each failing case, call `detectConvergence(caseName, modelKey)` from `eval-reflect.mjs`. Include convergence status in the reflection report. Flag cases with `oscillating`, `stagnant`, or `exhausted` status prominently.

### Model-Aware Analysis

When the eval run's `model` field differs from the agent's declared `model:` in YAML frontmatter (e.g., run used `haiku` but agent declares `model: sonnet`), adjust fix suggestions for the target model tier:

- **Downgrade** (opus->sonnet, sonnet->haiku): prioritize explicit fixes — more concrete examples (PE-3), negative constraints (PE-2), measurable criteria (PE-7), constants extraction (PE-4). Weaker models need less implicit, more explicit instructions
- **Upgrade** (haiku->sonnet, sonnet->opus): flag verbose constraints as compression candidates — suggest `/sparq:optimize` after scores stabilize
- **Same tier**: standard analysis (no model-tier adjustments)

Model tier hierarchy: opus > sonnet > haiku > local. Compare `results.model` against each pipeline agent's declared `model:` from YAML frontmatter.

## 5. Rank by Impact

Sort findings by cross-case frequency. Findings appearing in the most failing cases = highest priority. Group by agent to consolidate fixes to the same file.

## 6. Baseline Comparison

If baseline exists:
- Highlight NEW regressions (passing in baseline, failing now)
- Separate RECURRING issues (also failing in baseline)
- Note IMPROVEMENTS (failing in baseline, passing now)

### Cross-Model Comparison

If baselines exist for multiple models (e.g., `baselines/opus/` and `baselines/sonnet/`), include a cross-model section:

- List cases where the model change caused the largest score drops (candidates for model-tier-aware tuning)
- Identify cases that pass on all models (robust prompts, no action needed)
- Flag cases that pass on stronger models but fail on weaker ones (candidates for PE-3/PE-2/PE-7 hardening)

## 7. Detect Convergence Issues

Before writing the report, check loop health per `eval-workflow.md` "Convergence Control" (oscillation, stagnation, iteration limit). Call `detectConvergence(caseName, modelKey)` for each failing case. Include convergence warnings in the report header.

## 8. Write Report

Save to `test/evals/data/reflections/{timestamp}.md` with structured sections:

```markdown
# Eval Reflection — {timestamp}

## Metadata
- Run: {run-filename}
- Model: {model}
- Iteration: {N} since baseline
- Convergence: {healthy|oscillating|stagnant}
- Model tier: {run-model} (agent declares: {agent-model}) — {same|downgrade|upgrade}

## Summary
- Failing: {N}/{total} cases (< 75% or regressed)
- Regressions: {list}
- Top agent: {most-affected agent}

## Priority Fixes
1. **{agent}** `<{section}>` — {category} — {concrete fix} (affects {N} cases, est. +{N} points)
2. ...

## Per-Case Analysis
### {case-name} ({pct}%)
- {rubric}: {finding} → {agent} `<{section}>` — {fix}
```

Use this exact structure — `/sparq:eval-tune` parses it by heading names.

### Structural Requirements

The reflection report MUST contain these sections for `parseReflection()` validation:
- `## Metadata` with `- Run:` and `- Model:` fields (minimum)
- `## Summary` with failing case counts
- `## Priority Fixes` with numbered list items using `**bold agent name**` format

Reports missing required sections will fail validation when loaded by `/sparq:eval-tune`.

## 9. Print Summary

Output top 3-5 highest-impact fixes with exact agent file path, section reference, and one-line fix description. Include convergence warnings if any.

</workflow>

<few_shot_examples>

Finding: `has_pattern: "get .+\\(\\)" not found` (playwright-syntax rubric)
- Agent: sparq-automation-engineer
- Section: `<constants>` or Step 4
- Category: convention_violation
- Fix: Add to `<constants>`: "All page object locators MUST use `get` accessor pattern"

Finding: `no_pattern: "from '@playwright/test'" unexpectedly found`
- Agent: sparq-automation-engineer
- Section: `<constants>`
- Category: convention_violation
- Fix: Add to `<constants>`: "NEVER import from '@playwright/test' -- import from project fixture index"

Finding: `has_pattern: "REQ-\\w+-\\d{3}" not found`
- Agent: sparq-requirements-analyst
- Section: `<rules>` ID format subsection
- Category: id_format
- Fix: Add example to `<few_shot_examples>`: "REQ-login-001, REQ-login-002"

Finding: `has_section: "Coverage Matrix" not found`
- Agent: sparq-manual-test-writer
- Section: `<done_criteria>`
- Category: structural_error
- Fix: Add to `<done_criteria>`: "Output MUST include a ## Coverage Matrix section"

</few_shot_examples>

<done_criteria>
1. Latest results loaded and failing cases identified (< 75% or regressed)
2. All relevant agent prompts read and analyzed
3. Each finding mapped to: agent + prompt section + category + concrete fix
4. Model-tier analysis applied when run model differs from agent declared model (fix suggestions adjusted for target tier)
5. Findings ranked by cross-case frequency
6. Convergence check performed: oscillation, stagnation, iteration count (last 3 runs analyzed)
7. Reflection report saved to `test/evals/data/reflections/{timestamp}.md` with structured Metadata/Summary/Priority Fixes/Per-Case sections
8. Top 3-5 priority fixes printed with exact file paths and section references
9. Convergence warnings printed if any detected
</done_criteria>

## References

- `test/evals/data/runs/` -- saved eval run results
- `test/evals/data/baselines/` -- baseline results for regression comparison
- `claude/agents/` -- agent prompt files to analyze
- `bin/lib/commands/eval.mjs` -- SCENARIO_PIPELINES and rubric evaluation logic
- `bin/lib/commands/eval-reflect.mjs` -- `parseReflection()` validates reflection structure, `loadLatestReflection()` loads most recent, `detectConvergence()` checks oscillation, stagnation, and iteration limits

## Example

```
/sparq:eval-reflect
-> loads test/evals/data/runs/2025-01-15T14-30-00.json (latest)
-> 4/12 cases failing (< 75%): s1-login-from-jira (60%), s2-manual-to-e2e (50%), s3-parallel-batch (66%), s6-bug-regression (40%)
-> baseline found: s2-manual-to-e2e REGRESSED (was 80%), others RECURRING
-> analyzes 11 findings across 4 cases, reads 4 agent prompts
-> top fix: sparq-automation-engineer <constants> -- add `get` accessor rule (affects 3/4 cases)
-> saves test/evals/data/reflections/2025-01-15T15-00-00.md
-> prints top 3 fixes with file paths and sections
```

## Usage

```
/sparq:eval-reflect
```

Examples:
- `"Analyze eval results and suggest fixes"`
- `"Reflect on failing eval cases"`
- `"What agent prompts need improvement based on eval results?"`

After reflection, run `/sparq:eval-tune`, then `/sparq:improve {case|--all} --model haiku` (or
`/sparq:eval --all --strict --model haiku`) to verify improvement. Run `/sparq:optimize` only
after quality stabilizes and token budget is the goal.
