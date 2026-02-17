---
name: sparq:eval-tune
description: "Tuning agent and skill prompts based on eval findings. Applying prompt engineering fixes to improve rubric scores. Reading reflection reports or raw eval results and editing agent files with concrete fixes."
audience: dev
service: true
---

# Eval Tune -- Apply Prompt Fixes from Eval Findings

Service primitive (non-default path). Default reliability flow is `eval --strict` -> `improve` -> `baseline-promote`; use this skill when targeted expert tuning is required.

Read eval reflection reports or raw eval results, map findings to agent/skill/reference prompt sections, apply prompt engineering best practices, present diffs for approval, and suggest re-scoring.

## Input

```
/sparq:eval-tune [reflection-file]
/sparq:eval-tune --latest
/sparq:eval-tune --finding "description" --agent sparq-automation-engineer
```

- `reflection-file`: path to a reflection report in `test/evals/data/reflections/`
- `--latest`: auto-detect the most recent reflection (default if no args)
- `--finding` + `--agent`: manual mode -- apply a specific fix to a named agent

<workflow>

## 1. Load Findings Source

Priority order:
1. If `reflection-file` provided: read from `test/evals/data/reflections/`
2. If `--latest` or no args: scan `test/evals/data/reflections/` for most recent file
3. If no reflections exist: scan `test/evals/data/runs/` for latest run, extract failing cases (< 75%), perform inline analysis
4. If `--finding` + `--agent`: construct a single work item from provided text

If no source found: halt with `"[sparq] No eval reflections or runs found -- run /sparq:eval --strict first."`

### Validate Reflection Structure

After loading a reflection file, validate using `parseReflection()` (from `bin/lib/commands/eval-reflect.mjs`):
- Check `valid === true` — if false, log warnings for each error and fall back to raw run analysis
- Extract `metadata.Model` for model tier detection (replaces manual parsing)
- Use `fixes[]` array for pre-parsed priority fix items

### Check Convergence Health

After loading findings, call `detectConvergence(caseName, modelKey)` from `eval-reflect.mjs` for each failing case. If status is:
- `oscillating`: warn user and suggest reviewing conflicting fixes before proceeding
- `stagnant`: warn user that the case may need manual investigation
- `exhausted`: warn user that 5+ iterations haven't improved this case — suggest scope reduction or manual fix
- `healthy` or `insufficient-data`: proceed normally

### Detect Model Context

After loading findings, determine the target model tier for PE technique weighting:
1. If reflection report has `Model tier:` in Metadata: use that
2. Else if `--agent` specified: read agent YAML frontmatter `model:` field
3. Else if latest run has `model` field: use that
4. Fallback: assume `opus` (standard priority ordering)

Log: `[sparq] Target model tier: {tier} — PE priorities adjusted`

## 2. Parse Findings into Work Items

For each finding, extract:
- **Finding text**: the rubric check that failed
- **Category**: `convention_violation`, `missing_pattern`, `structural_error`, `id_format`
- **Responsible agent**: agent file to modify
- **Target section**: XML-tagged or markdown section (`<constants>`, `<rules>`, `<done_criteria>`, `<few_shot_examples>`, workflow step N)
- **Concrete fix suggestion**: from the reflection report
- **Affected eval cases**: which cases this finding impacts
- **Priority rank**: cross-case frequency

Group work items by agent file.

## 3. Validate and Load Target Prompt Files

For each unique agent in work items:
1. **Validate existence**: call `validateAgentFiles(agentNames)` from `eval-state.mjs`. For each agent in `missing`, log the warning and skip that agent's fixes. Do not abort the entire tune.
2. **Freshness check**: if loading from a reflection file, compare the reflection timestamp against the most recent eval run — warn if 3+ newer runs exist (`"[sparq] WARNING: reflection is stale — {N} runs since it was generated. Consider running /sparq:eval-reflect first."`)
3. Read from `claude/agents/sparq-{name}.md`
4. Parse structure: YAML frontmatter, XML-tagged sections, workflow steps, handoff section
5. Count current lines (must stay under 300)
6. Read the agent's `<references>` section

Also load `claude/rules/agents.md` for structural validation rules.

## 4. Design Fixes Using Prompt Engineering Best Practices

For each work item, design the minimal effective fix. **Model-tier adjustment**: when a model tier is detected (see Step 1), reorder the technique list below per `<model_tier_pe_weights>`. Apply primary techniques first, secondary as needed.

Apply these techniques in priority order:

<prompt_engineering_techniques>

### PE-1: Rubric-Aligned Done Criteria
If a rubric checks for X and `<done_criteria>` does not mention X, add a done criteria item mirroring the rubric check. Agents self-verify against what rubrics measure.

**Before**: `<done_criteria>` has no mention of `get` accessors
**After**: Added item: "All page objects use `get` accessors for locators (not `readonly` field assignments)"

### PE-2: Explicit Negative Constraints
When a `no_pattern` check fails (forbidden pattern found), add an explicit NEVER constraint. Negative instructions are stronger than positive-only.

**Before**: No mention of `@playwright/test` import restriction
**After**: Added to `<constants>`: "NEVER import from `@playwright/test` -- import `{ test, expect }` from project fixture index"

### PE-3: Few-Shot Example Injection
When a `missing_pattern` finding recurs across multiple cases, add a concrete code example to `<few_shot_examples>`. Concrete examples beat abstract rules.

**Before**: Abstract rule "use get accessors"
**After**: Added TypeScript snippet showing exact `get emailInput(): Locator { return this.page.getByTestId('email-input') }` pattern

### PE-4: Constants Extraction
Consolidate scattered ID/naming rules into `<constants>`. Dedicated constants section = higher compliance.

### PE-5: Priority Ordering (Primacy Effect)
Move most frequently violated rules earlier in their section. Primacy = higher compliance.

### PE-6: XML Boundary Clarity
Tighten XML tag boundaries when agents confuse cross-section instructions. Replace ambiguous headings with XML tags.

### PE-7: Measurable Completion Criteria
Replace vague done criteria with measurable ones ("all TC IDs match `TC-{feature}-{ABBR}-{NNN}`"). Every item objectively verifiable.

### PE-8: Chain-of-Thought Guidance
Add explicit verification steps for structural errors: "Before generating, verify: (1) base class exists, (2) fixture index resolved, (3) barrel exports identified."

### PE-9: Cross-Section Dedup
Check if rule exists elsewhere before adding. Consolidate to one canonical location.

### PE-10: Semantic Density
Maximum semantic density — every word carries meaning. No filler per T3.

</prompt_engineering_techniques>

<model_tier_pe_weights>

### Model-Tier PE Technique Priorities

When applying fixes, prioritize PE techniques based on the target model tier. Detect the model tier from:
1. The reflection report's Metadata section (`Model tier: {tier}`)
2. The agent's YAML frontmatter `model:` field
3. The latest eval run's `model` field in `test/evals/data/runs/`

#### Haiku (cost-optimized, needs maximum explicitness)
- **Primary**: PE-3 (few-shot examples), PE-2 (explicit negative constraints), PE-7 (measurable criteria), PE-4 (constants extraction)
- **Secondary**: PE-1 (rubric-aligned done criteria), PE-5 (priority ordering)
- **Avoid**: PE-8 (chain-of-thought) — consumes output tokens without proportional improvement on haiku

#### Sonnet (structured generation, needs clear boundaries)
- **Primary**: PE-1 (rubric-aligned done criteria), PE-4 (constants extraction), PE-5 (priority ordering)
- **Secondary**: PE-2 (negative constraints), PE-7 (measurable criteria), PE-3 (few-shot examples)
- **Full set**: all PE-1 through PE-10 effective, but prioritize structural clarity

#### Opus (strong reasoning, standard priority)
- **Primary**: PE-5 (priority ordering), PE-1 (rubric-aligned done criteria), PE-9 (cross-section dedup)
- **Secondary**: all others as needed
- **Note**: opus rarely needs PE-3 (few-shot) for pattern compliance — abstract rules usually suffice

When a fix uses a technique ranked "Avoid" for the target tier, note the risk in the CHECKPOINT diff presentation.

</model_tier_pe_weights>

## 5. Immutable Constraints Check

Before presenting any fix, verify it does NOT violate:
- `<done_criteria>` semantic meaning unchanged (may ADD items, never remove or weaken existing)
- YAML frontmatter identity fields (`name`, `model`, `color`) unchanged
- `@path` references still point to existing files
- Content-bearing few-shot examples preserved (may compress, never remove)
- Handoff entries remain inside canonical section (`<handoff>` or `## Handoff`)
- Agent stays under 300 lines post-fix

If a fix pushes an agent over 300 lines: apply `/sparq:optimize` T3 (filler removal), T5 (verbose->concise), T9 (cross-section dedup) to create room. Report line count before/after.

## 6. Estimate Impact

For each fix, calculate:
- Which rubric checks it addresses (by name)
- How many eval cases benefit (from affected cases list)
- Potential score improvement (rubric points gained)

Sort fixes by estimated impact (highest first).

## 7. Present Changes (CHECKPOINT)

For each agent file, present:

```
## Fix 1 of N: sparq-automation-engineer.md
Finding: no_pattern "from '@playwright/test'" unexpectedly found (3 cases)
Category: convention_violation
Technique: PE-2 (Explicit Negative Constraint) + PE-1 (Rubric-Aligned Done Criteria)

BEFORE (<constants>, lines 12-15):
  <constants>
  - Regression test ID format: `REG-{ticket}-{NNN}`
  </constants>

AFTER (<constants>, lines 12-16):
  <constants>
  - Regression test ID format: `REG-{ticket}-{NNN}`
  - NEVER import from `@playwright/test` -- import { test, expect } from project fixture index
  </constants>

Lines: 287 -> 290 (+3)
Impact: +2 points across 3 cases (playwright-syntax: fixture-import, no-playwright-import)
```

**Block until user approves each file's changes (or approves all at once).**

## 8. Apply Approved Fixes

**Before writing**: call `createCheckpoint()` from `eval-state.mjs` to save current agent state via git stash. If `success === false`, log the error and proceed. If `empty === true`, no stash was needed (agents unchanged).

**Atomic writes**: Write each agent file using the tmp-then-rename pattern (`atomicWriteSync` from `eval-reflect.mjs`) to prevent partial writes on failure. If any file fails mid-way, the original files remain intact.

Write modified agent files. Emit: `[sparq] Applied {N} fixes to {M} agent files`

**Save tune record**: call `saveTuneRecord()` from `eval-state.mjs` with the list of applied fixes (agent, section, technique, rubric checks, expected delta). This enables fix traceability (GAP 4.2) and protected sections (GAP 3.2).

If any write fails mid-way, call `restoreCheckpoint()` from `eval-state.mjs` to restore agent files. Report which files were written and which failed.

## 9. Post-Fix Verification

Verify all modified files:
1. YAML frontmatter present with required fields
2. `<done_criteria>` section exists
3. `<references>` section exists (sub-agents)
4. Under 300 lines
5. No broken `@path` references

Report verification results.

## 10. Suggest Re-Scoring

```
[sparq] Fixes applied. Re-score to verify improvement:
  /sparq:improve {affected-case} --model haiku
  /sparq:improve --all --model haiku   (if latest strict run was mock or model is unresolved)
  /sparq:baseline-promote {affected-case|--all} after clean strict passes
```

</workflow>

<finding_to_section_map>

Extended mapping from rubric findings to agent prompt sections:

- `convention_violation` + `has_pattern` failed -> `<constants>` (add rule) + `<done_criteria>` (add check)
- `convention_violation` + `no_pattern` failed -> `<constants>` (add NEVER constraint) + `<done_criteria>` (add negative check)
- `missing_pattern` + code pattern -> `<few_shot_examples>` (add concrete example)
- `missing_pattern` + structural element -> `<done_criteria>` (add output check) + workflow step (add instruction)
- `structural_error` + handoff issue -> `<handoff>` section (fix schema compliance)
- `structural_error` + missing section -> workflow step (add section generation instruction)
- `id_format` -> `<constants>` (add/fix format rule) + `<few_shot_examples>` (add ID examples)

</finding_to_section_map>

<rubric_to_agent_map>

Fallback mapping when working from raw run results (no reflection report):

- `format-compliance` (TC/REQ IDs) -> requirements-analyst (REQ), manual-test-writer (TC)
- `coverage-completeness` -> requirements-analyst, manual-test-writer
- `playwright-syntax` -> automation-engineer
- `executability-check` -> automation-engineer
- `assertion-detection` -> automation-engineer
- `requirement-coverage` -> requirements-analyst, manual-test-writer, automation-engineer (regression mode)
- `error-handling-compliance` -> all agents
- `parallel-merge` -> orchestrator
- `progress-signal-compliance` -> all agents
- `resume-state-compliance` -> orchestrator
- `template-compliance` -> manual-test-writer, requirements-analyst
- `regression-compliance` -> automation-engineer (regression mode)
- `handoff-compliance` -> all sub-agents
- `naming-conventions` -> requirements-analyst (REQ), manual-test-writer (TC), automation-engineer (REG)

</rubric_to_agent_map>

<few_shot_examples>

### Example 1: Convention Violation Fix

Finding: `no_pattern: "from '@playwright/test'" unexpectedly found`
- Agent: sparq-automation-engineer
- Section: `<constants>`
- Category: convention_violation
- Techniques: PE-2 + PE-1

Applied:
1. Added to `<constants>`: `NEVER import from '@playwright/test' -- import { test, expect } from project fixture index`
2. Added to `<done_criteria>`: `All specs import from the project's fixture index (not from @playwright/test)`

### Example 2: Missing Pattern Fix

Finding: `has_pattern: "REQ-\\w+-\\d{3}" not found`
- Agent: sparq-requirements-analyst
- Section: `<constants>` + `<few_shot_examples>`
- Category: id_format
- Techniques: PE-4 + PE-3

Applied:
1. Added to `<constants>`: `REQ ID format: REQ-{feature}-{NNN} — lowercase kebab-case feature, zero-padded 3-digit number`
2. Added to `<few_shot_examples>`: `REQ-login-001, REQ-login-002, REQ-user-profile-001`
3. Added to `<done_criteria>`: `All requirement IDs match format REQ-{feature}-{NNN}`

### Example 3: Structural Error Fix

Finding: `Missing "report" field (expected {counts, artifacts[]})`
- Agent: sparq-automation-engineer
- Section: `<handoff>`
- Category: structural_error
- Techniques: PE-7 + PE-3

Applied:
1. Updated `<handoff>`: added explicit `report` field structure with `counts` object and `artifacts` array
2. Added to `<done_criteria>`: `Handoff contains report field with counts object and artifacts array`

</few_shot_examples>

<done_criteria>
1. Findings source loaded (reflection file, latest reflection, latest run, or manual finding)
2. Reflection structure validated via `parseReflection()` — invalid reports fall back to raw run analysis with warning
3. Agent file existence validated — missing agents warned and skipped, not aborted
4. Reflection freshness checked — warned if stale (3+ newer runs exist)
5. Model context detected (reflection metadata, agent YAML, or run metadata) and PE priorities adjusted per `<model_tier_pe_weights>`
6. All findings parsed into work items with: finding text, category, agent, section, priority
7. All target agent files read and structure parsed (frontmatter, XML sections, line count)
8. Each fix uses at least one prompt engineering technique (PE-1 through PE-10), weighted by target model tier
9. Immutable constraints verified: done_criteria meaning preserved, frontmatter unchanged, @path refs valid, agents under 300 lines
10. Impact estimate calculated per fix (rubric checks addressed, cases affected, points gained)
11. All changes presented with before/after diffs at CHECKPOINT — user approval obtained
12. Rollback checkpoint created (`git stash`) before writing agent files
13. Modified files written only after approval
14. Post-fix verification passed: frontmatter, done_criteria, references, line count
15. Re-scoring command suggested with specific case names
</done_criteria>

## References

- `test/evals/data/reflections/` -- reflection reports from eval-reflect
- `test/evals/data/runs/` -- raw eval results (fallback)
- `claude/agents/` -- agent prompt files to modify
- `claude/skills/sparq-shared/references/eval-workflow.md` -- eval loop context
- `claude/rules/agents.md` -- structural rules for agent files
- `bin/lib/commands/eval-reflect.mjs` -- `parseReflection()`, `loadLatestReflection()`, `atomicWriteSync()`
- `bin/lib/commands/eval-state.mjs` -- `createCheckpoint()`, `restoreCheckpoint()`, `validateAgentFiles()`, `saveTuneRecord()`, `getProtectedSections()`

## Examples

```
/sparq:eval-tune
-> loads test/evals/data/reflections/20260212-200000.md (latest)
-> 5 findings across 2 agents: automation-engineer (4), requirements-analyst (1)
-> designs 5 fixes using PE-1, PE-2, PE-3, PE-4
-> CHECKPOINT: presents per-file diffs for 3 agent files
-> user approves all
-> writes modified agents (287->292, 156->159, 203->206 lines)
-> verification: all pass structural checks
-> suggests: /sparq:improve --all --model haiku
```

```
/sparq:eval-tune --finding "get accessor pattern missing" --agent sparq-automation-engineer
-> constructs single work item: convention_violation, <constants>, PE-2+PE-3
-> loads sparq-automation-engineer.md (287 lines)
-> designs 1 fix: add get accessor rule to <constants> + example
-> CHECKPOINT: 1 diff for 1 file
-> user approves
-> writes (287->293 lines)
-> suggests: /sparq:improve s2-manual-to-e2e --model haiku
```

```
/sparq:eval-tune --latest
-> no reflections found, falls back to latest run
-> 4/12 cases failing, extracts 11 findings
-> groups by agent, designs fixes
-> 2 agents over 295 lines post-fix: applies T3+T5 to create room
-> CHECKPOINT: presents diffs with compression notes
-> user approves 4/5 fixes, skips 1
-> applies 4 approved fixes
-> suggests: /sparq:improve --all --model haiku
```
